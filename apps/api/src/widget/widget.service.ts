import { randomBytes, randomUUID } from "node:crypto";

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ConversationSource,
  ConversationStatus,
  MessageDeliveryStatus,
  MessageDirection,
  Prisma,
  SenderType,
  type PrismaClient,
} from "@prisma/client";

import { OrchestratorService } from "../ai/orchestrator/orchestrator.service";
import { logger } from "../lib/logger";
import { prisma as defaultPrisma } from "../lib/prisma";

const KEY_PATTERN = /^wk_[a-f0-9]{32}$/;
const VISITOR_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_MESSAGE_LENGTH = 1000;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export interface WebsiteWidgetInstall {
  publicKey: string;
  enabled: boolean;
  businessName: string;
}

export interface PublicWidgetConfig {
  businessName: string;
  greeting: string;
  language: string;
}

export interface PublicWidgetMessage {
  id: string;
  role: "customer" | "ai" | "human" | "system";
  content: string;
  createdAt: string;
}

export interface PublicWidgetTurn {
  conversationId: string;
  reply: string | null;
  pending: boolean;
  messages: PublicWidgetMessage[];
}

type WidgetSettings = {
  publicKey: string;
  enabled: boolean;
};

type BusinessSettings = Record<string, unknown> & {
  websiteWidget?: WidgetSettings;
};

@Injectable()
export class WidgetService {
  private readonly hits = new Map<string, number[]>();
  private readonly prisma: PrismaClient = defaultPrisma;

  constructor(private readonly orchestrator: OrchestratorService) {}

  async getInstall(businessId: string): Promise<WebsiteWidgetInstall> {
    const business = await this.requireBusiness(businessId);
    const settings = await this.ensureWidget(business.id, readSettings(business.settings));
    return {
      publicKey: settings.publicKey,
      enabled: settings.enabled,
      businessName: business.name,
    };
  }

  async rotateKey(businessId: string): Promise<WebsiteWidgetInstall> {
    const business = await this.requireBusiness(businessId);
    const current = readSettings(business.settings);
    const widget = readWidget(current) ?? { publicKey: createPublicKey(), enabled: true };
    const next: WidgetSettings = { publicKey: createPublicKey(), enabled: widget.enabled };
    await this.writeWidget(business.id, current, next);
    return {
      publicKey: next.publicKey,
      enabled: next.enabled,
      businessName: business.name,
    };
  }

  async getPublicConfig(publicKey: string): Promise<PublicWidgetConfig> {
    const business = await this.requireByKey(publicKey);
    const language = business.default_language || "fr";
    return {
      businessName: business.name,
      greeting: greetingFor(language, business.name),
      language,
    };
  }

  async sendMessage(
    publicKey: string,
    input: { visitorId?: string; message?: string },
  ): Promise<PublicWidgetTurn> {
    const business = await this.requireByKey(publicKey);
    const visitorId = assertVisitorId(input.visitorId);
    const message = assertMessage(input.message);
    this.consumeRate(publicKey, visitorId);

    const language = business.default_language || "fr";
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        business_id: business.id,
        source: ConversationSource.website,
        external_thread_id: visitorId,
        is_test: false,
      },
      orderBy: { created_at: "desc" },
    });

    if (!conversation) {
      const customer = await this.prisma.customer.create({
        data: {
          business_id: business.id,
          name: visitorName(language),
          language,
        },
      });
      conversation = await this.prisma.conversation.create({
        data: {
          business_id: business.id,
          customer_id: customer.id,
          source: ConversationSource.website,
          external_thread_id: visitorId,
          status: ConversationStatus.NEW,
          ai_enabled: true,
          is_test: false,
        },
      });
    }

    const inbound = await this.prisma.message.create({
      data: {
        business_id: business.id,
        conversation_id: conversation.id,
        direction: MessageDirection.inbound,
        sender_type: SenderType.customer,
        content: message,
        delivery_status: MessageDeliveryStatus.delivered,
        idempotency_key: `website:${business.id}:in:${randomUUID()}`,
      },
    });

    const humanOwnsThread =
      !conversation.ai_enabled ||
      conversation.status === ConversationStatus.HUMAN_HANDLING ||
      conversation.status === ConversationStatus.HUMAN_REQUIRED;

    let reply: string | null = null;
    let nextStatus: ConversationStatus = conversation.status;

    if (!humanOwnsThread) {
      try {
        const turn = await this.orchestrator.executeTurn(
          conversation.id,
          { id: inbound.id, content: message },
          {
            businessId: business.id,
            inboundMessageId: inbound.id,
            mode: "inbound",
          },
        );
        if (turn.response && turn.response.trim().length > 0) {
          reply = turn.response.trim();
          await this.prisma.message.create({
            data: {
              business_id: business.id,
              conversation_id: conversation.id,
              direction: MessageDirection.outbound,
              sender_type: SenderType.ai,
              content: reply,
              delivery_status: MessageDeliveryStatus.sent,
              idempotency_key: `website:${business.id}:out:${randomUUID()}`,
              ai_metadata: {
                toolsCalled: turn.toolsCalled,
                groundingPassed: turn.groundingPassed,
              } as Prisma.InputJsonValue,
            },
          });
        }
        const requested = turn.intendedTransition?.toStatus;
        if (requested && isConversationStatus(requested)) {
          nextStatus = requested;
        } else if (conversation.status === ConversationStatus.NEW) {
          nextStatus = ConversationStatus.AI_ACTIVE;
        }
      } catch (err) {
        logger.warn({ err, conversationId: conversation.id }, "Website widget AI turn failed");
        reply = holdingMessage(language);
        nextStatus = ConversationStatus.HUMAN_REQUIRED;
        await this.prisma.message.create({
          data: {
            business_id: business.id,
            conversation_id: conversation.id,
            direction: MessageDirection.outbound,
            sender_type: SenderType.ai,
            content: reply,
            delivery_status: MessageDeliveryStatus.sent,
            idempotency_key: `website:${business.id}:hold:${randomUUID()}`,
          },
        });
      }
    }

    const preview = (reply ?? message).slice(0, 200);
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: nextStatus,
        last_message_at: new Date(),
        last_message_preview: preview,
      },
    });

    const messages = await this.listMessages(business.id, conversation.id);
    return {
      conversationId: conversation.id,
      reply,
      pending: reply === null,
      messages,
    };
  }

  async listPublicMessages(
    publicKey: string,
    conversationId: string,
    visitorIdRaw: string | undefined,
  ): Promise<PublicWidgetMessage[]> {
    const business = await this.requireByKey(publicKey);
    const visitorId = assertVisitorId(visitorIdRaw);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        business_id: business.id,
        source: ConversationSource.website,
        external_thread_id: visitorId,
      },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Conversation not found" },
      });
    }
    return this.listMessages(business.id, conversation.id);
  }

  private async listMessages(
    businessId: string,
    conversationId: string,
  ): Promise<PublicWidgetMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { business_id: businessId, conversation_id: conversationId },
      orderBy: { created_at: "asc" },
      take: 50,
      select: {
        id: true,
        sender_type: true,
        content: true,
        created_at: true,
      },
    });
    return rows
      .filter((row) => typeof row.content === "string" && row.content.length > 0)
      .map((row) => ({
        id: row.id,
        role: mapRole(row.sender_type),
        content: row.content ?? "",
        createdAt: row.created_at.toISOString(),
      }));
  }

  private async requireBusiness(businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deleted_at: null },
      select: { id: true, name: true, settings: true, default_language: true },
    });
    if (!business) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Business not found" },
      });
    }
    return business;
  }

  private async requireByKey(publicKey: string) {
    if (!KEY_PATTERN.test(publicKey)) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Widget not found" },
      });
    }
    const business = await this.prisma.business.findFirst({
      where: {
        deleted_at: null,
        settings: {
          path: ["websiteWidget", "publicKey"],
          equals: publicKey,
        },
      },
      select: {
        id: true,
        name: true,
        settings: true,
        default_language: true,
      },
    });
    if (!business) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Widget not found" },
      });
    }
    const widget = readWidget(business.settings);
    if (!widget?.enabled) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Widget not found" },
      });
    }
    return business;
  }

  private async ensureWidget(
    businessId: string,
    settings: BusinessSettings,
  ): Promise<WidgetSettings> {
    const existing = readWidget(settings);
    if (existing) return existing;
    const created: WidgetSettings = { publicKey: createPublicKey(), enabled: true };
    await this.writeWidget(businessId, settings, created);
    return created;
  }

  private async writeWidget(
    businessId: string,
    settings: BusinessSettings,
    widget: WidgetSettings,
  ): Promise<void> {
    const next: BusinessSettings = { ...settings, websiteWidget: widget };
    await this.prisma.business.update({
      where: { id: businessId },
      data: { settings: next as Prisma.InputJsonValue },
    });
  }

  private consumeRate(publicKey: string, visitorId: string): void {
    const bucket = `${publicKey}:${visitorId}`;
    const now = Date.now();
    const recent = (this.hits.get(bucket) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      throw new HttpException(
        { error: { code: "rate_limited", message: "Too many messages. Try again in a minute." } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(bucket, recent);
  }
}

function createPublicKey(): string {
  return `wk_${randomBytes(16).toString("hex")}`;
}

function readSettings(value: Prisma.JsonValue | null): BusinessSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as BusinessSettings;
}

function readWidget(value: Prisma.JsonValue | null | BusinessSettings): WidgetSettings | null {
  const settings = readSettings(value as Prisma.JsonValue);
  const widget = settings.websiteWidget;
  if (!widget || typeof widget.publicKey !== "string" || !KEY_PATTERN.test(widget.publicKey)) {
    return null;
  }
  return { publicKey: widget.publicKey, enabled: widget.enabled !== false };
}

function assertVisitorId(value: string | undefined): string {
  const visitorId = (value ?? "").trim();
  if (!VISITOR_PATTERN.test(visitorId)) {
    throw new BadRequestException({
      error: { code: "validation_error", message: "visitorId is required" },
    });
  }
  return visitorId;
}

function assertMessage(value: string | undefined): string {
  const message = (value ?? "").trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestException({
      error: {
        code: "validation_error",
        message: `message must be 1-${MAX_MESSAGE_LENGTH.toString()} characters`,
      },
    });
  }
  return message;
}

function isConversationStatus(value: string): value is ConversationStatus {
  return (Object.values(ConversationStatus) as string[]).includes(value);
}

function mapRole(sender: SenderType): PublicWidgetMessage["role"] {
  if (sender === SenderType.customer) return "customer";
  if (sender === SenderType.human) return "human";
  if (sender === SenderType.system) return "system";
  return "ai";
}

function greetingFor(language: string, businessName: string): string {
  if (language.startsWith("ar")) {
    return `أهلاً بيك في ${businessName}. شنوة تحب تعرف؟`;
  }
  if (language.startsWith("en")) {
    return `Hello, welcome to ${businessName}. What can I help you find?`;
  }
  return `Bonjour, bienvenue chez ${businessName}. Qu'est-ce que je peux vous aider à trouver ?`;
}

function visitorName(language: string): string {
  if (language.startsWith("ar")) return "زائر الموقع";
  if (language.startsWith("en")) return "Website visitor";
  return "Visiteur du site";
}

function holdingMessage(language: string): string {
  if (language.startsWith("ar")) return "عضو من الفريق باش يكمل معاك هنا.";
  if (language.startsWith("en")) return "A teammate will continue this chat here.";
  return "Un membre de l'équipe va continuer cette conversation ici.";
}
