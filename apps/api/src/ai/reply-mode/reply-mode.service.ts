import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import {
  MessageDeliveryStatus,
  MessageDirection,
  ReplyMode,
  SenderType,
  type Message,
  type PrismaClient,
} from "@prisma/client";
import { Queue } from "bullmq";

import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import {
  connection,
  DELIVER_OUTBOUND_QUEUE,
  DELIVER_OUTBOUND_JOB,
  type DeliverOutboundJobData,
} from "../../lib/queue";

export { DELIVER_OUTBOUND_QUEUE, DELIVER_OUTBOUND_JOB, type DeliverOutboundJobData };
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.65;

export interface RealtimeMessageNotifier {
  emitMessageNew(businessId: string, conversationId: string, message: unknown): void;
}

export interface ReplyModeResolution {
  effectiveMode: ReplyMode;
  configuredMode: ReplyMode;
  downgraded: boolean;
  downgradeReason?: "low_confidence" | "shadow_mode";
  confidenceThreshold: number;
}

export interface DispatchReplyInput {
  businessId: string;
  conversationId: string;
  content: string;
  confidence?: number;
  aiMetadata?: Record<string, unknown>;
  channelAccountId?: string | null;
  idempotencyKey?: string;
  shadowMode?: boolean;
  forceMode?: ReplyMode;
  attachments?: {
    s3Key: string;
    contentType: string;
    sizeBytes?: number;
    sortOrder?: number;
  }[];
}

export interface DispatchReplyResult {
  message: Message;
  effectiveMode: ReplyMode;
  configuredMode: ReplyMode;
  downgraded: boolean;
  downgradeReason?: "low_confidence" | "shadow_mode";
  deliveryStatus: MessageDeliveryStatus;
  jobId?: string;
}

@Injectable()
export class ReplyModeService implements OnModuleDestroy {
  private readonly prisma: PrismaClient;
  private queue: Queue<DeliverOutboundJobData> | null = null;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<DeliverOutboundJobData> | null,
    @Optional() private readonly realtimeNotifier?: RealtimeMessageNotifier,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
    if (queue !== undefined) {
      this.queue = queue;
    } else {
      try {
        this.queue = new Queue<DeliverOutboundJobData>(DELIVER_OUTBOUND_QUEUE, {
          connection,
        });
      } catch (err) {
        logger.warn(
          { err },
          "Could not initialize BullMQ deliver_outbound queue in ReplyModeService",
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.close();
      } catch {
        // ignore teardown errors
      }
    }
  }

  /**
   * Resolves the effective reply mode considering tenant settings, agent threshold, confidence, and shadow mode.
   * Invariant: Default reply mode for newly created stores or missing settings is strictly `approval_required`.
   */
  async resolveReplyMode(
    businessId: string,
    confidence?: number,
    options?: { shadowMode?: boolean; forceMode?: ReplyMode },
  ): Promise<ReplyModeResolution> {
    if (!businessId) {
      throw new BadRequestException({
        error: {
          code: "bad_request",
          message: "businessId is required to resolve reply mode",
        },
      });
    }

    // 1. If explicit forceMode is provided
    if (options?.forceMode) {
      return {
        effectiveMode: options.forceMode,
        configuredMode: options.forceMode,
        downgraded: false,
        confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      };
    }

    // 2. Query AiSettings, AiAgent, and feature flags in parallel for the tenant
    const [settings, agent, flagOverride, flagDefault] = await Promise.all([
      this.prisma.aiSettings.findUnique({
        where: { business_id: businessId },
      }),
      this.prisma.aiAgent.findUnique({
        where: { business_id: businessId },
      }),
      options?.shadowMode !== undefined
        ? Promise.resolve(null)
        : this.prisma.featureFlag.findFirst({
            where: { business_id: businessId, feature: "ai_shadow_mode" },
          }),
      options?.shadowMode !== undefined
        ? Promise.resolve(null)
        : this.prisma.featureFlag.findFirst({
            where: { business_id: null, feature: "ai_shadow_mode" },
          }),
    ]);

    // 3. Default reply mode invariant: `approval_required`
    const configuredMode: ReplyMode = settings?.reply_mode ?? ReplyMode.approval_required;
    const confidenceThreshold = agent?.confidence_threshold
      ? Number(agent.confidence_threshold)
      : DEFAULT_CONFIDENCE_THRESHOLD;

    const isShadowMode =
      options?.shadowMode ?? flagOverride?.enabled ?? flagDefault?.enabled ?? false;

    // 4. Shadow mode check: forces draft behaviour only if reply_mode = auto_send
    if (isShadowMode) {
      if (configuredMode === ReplyMode.auto_send) {
        return {
          effectiveMode: ReplyMode.approval_required,
          configuredMode,
          downgraded: true,
          downgradeReason: "shadow_mode",
          confidenceThreshold,
        };
      }

      return {
        effectiveMode: configuredMode,
        configuredMode,
        downgraded: false,
        confidenceThreshold,
      };
    }

    // 5. Confidence fallback: if auto_send but confidence is missing or below threshold -> downgrade
    if (configuredMode === ReplyMode.auto_send) {
      if (confidence === undefined || confidence < confidenceThreshold) {
        return {
          effectiveMode: ReplyMode.approval_required,
          configuredMode,
          downgraded: true,
          downgradeReason: "low_confidence",
          confidenceThreshold,
        };
      }

      return {
        effectiveMode: ReplyMode.auto_send,
        configuredMode,
        downgraded: false,
        confidenceThreshold,
      };
    }

    // 6. Configured as approval_required or draft_only
    return {
      effectiveMode: configuredMode,
      configuredMode,
      downgraded: false,
      confidenceThreshold,
    };
  }

  /**
   * Determines message delivery status based on effective reply mode
   */
  determineDeliveryStatus(effectiveMode: ReplyMode): MessageDeliveryStatus {
    switch (effectiveMode) {
      case ReplyMode.auto_send:
        return MessageDeliveryStatus.queued;
      case ReplyMode.approval_required:
      case ReplyMode.draft_only:
      default:
        return MessageDeliveryStatus.draft;
    }
  }

  /**
   * Dispatches an AI generated reply:
   * - Resolves effective reply mode
   * - Persists message to DB
   * - Emits `message.new` to inbox via realtime service
   * - If AUTO_SEND: enqueues message to BullMQ `deliver_outbound` queue
   * - If APPROVAL_REQUIRED / DRAFT_ONLY: saves as draft without enqueuing
   */
  async dispatchReply(input: DispatchReplyInput): Promise<DispatchReplyResult> {
    const { businessId, conversationId, content } = input;

    if (!businessId || !conversationId) {
      throw new BadRequestException({
        error: {
          code: "bad_request",
          message: "businessId and conversationId are required",
        },
      });
    }

    // Verify conversation exists and belongs to tenant
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        business_id: businessId,
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Conversation not found in this business",
        },
      });
    }

    // Resolve reply mode with safety guards
    const resolution = await this.resolveReplyMode(businessId, input.confidence, {
      shadowMode: input.shadowMode,
      forceMode: input.forceMode,
    });

    const deliveryStatus = this.determineDeliveryStatus(resolution.effectiveMode);
    const channelAccountId = input.channelAccountId ?? conversation.channel_account_id;
    const idempotencyKey = input.idempotencyKey ?? `ai-reply-${randomUUID()}`;

    const enrichedMetadata = {
      ...input.aiMetadata,
      replyMode: resolution.effectiveMode,
      configuredMode: resolution.configuredMode,
      confidence: input.confidence,
      confidenceThreshold: resolution.confidenceThreshold,
      downgraded: resolution.downgraded,
      ...(resolution.downgradeReason ? { downgradeReason: resolution.downgradeReason } : {}),
    };

    // Persist message in database
    const message = await this.prisma.message.create({
      data: {
        business_id: businessId,
        conversation_id: conversationId,
        channel_account_id: channelAccountId,
        direction: MessageDirection.outbound,
        sender_type: SenderType.ai,
        content,
        delivery_status: deliveryStatus,
        idempotency_key: idempotencyKey,
        ai_metadata: enrichedMetadata,
        attachments:
          input.attachments && input.attachments.length > 0
            ? {
                create: input.attachments.map((att, idx) => ({
                  business_id: businessId,
                  s3_key: att.s3Key,
                  content_type: att.contentType,
                  size_bytes: att.sizeBytes ?? null,
                  sort_order: att.sortOrder ?? idx,
                })),
              }
            : undefined,
      },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
    });

    // Always emit realtime notification to tenant & conversation rooms (inbox)
    if (this.realtimeNotifier) {
      try {
        this.realtimeNotifier.emitMessageNew(businessId, conversationId, message);
      } catch (err) {
        logger.warn({ err, messageId: message.id }, "Failed to emit message.new event");
      }
    }

    let jobId: string | undefined;
    let finalMessage = message;
    let finalDeliveryStatus = deliveryStatus;

    // AUTO_SEND: Enqueue to BullMQ deliver_outbound queue
    if (resolution.effectiveMode === ReplyMode.auto_send) {
      let enqueueFailed = false;

      if (this.queue) {
        try {
          const job = await this.queue.add(
            DELIVER_OUTBOUND_JOB,
            {
              messageId: message.id,
              businessId,
              channelAccountId,
              channel_account_id: channelAccountId,
              enqueuedAt: Date.now(),
            },
            {
              jobId: message.id,
              removeOnComplete: true,
            },
          );
          jobId = job.id;
        } catch (err) {
          enqueueFailed = true;
          logger.warn(
            { err, messageId: message.id },
            "Failed to enqueue auto_send reply to deliver_outbound queue",
          );
        }
      } else {
        enqueueFailed = true;
        logger.warn(
          { messageId: message.id },
          "BullMQ deliver_outbound queue unavailable; marking auto_send reply as failed",
        );
      }

      if (enqueueFailed) {
        finalDeliveryStatus = MessageDeliveryStatus.failed;
        finalMessage = await this.prisma.message.update({
          where: { id: message.id },
          data: { delivery_status: MessageDeliveryStatus.failed },
          include: {
            attachments: {
              orderBy: { sort_order: "asc" },
            },
          },
        });
      }
    }

    return {
      message: finalMessage,
      effectiveMode: resolution.effectiveMode,
      configuredMode: resolution.configuredMode,
      downgraded: resolution.downgraded,
      downgradeReason: resolution.downgradeReason,
      deliveryStatus: finalDeliveryStatus,
      jobId,
    };
  }

  /**
   * Helper to verify if auto-send is allowed for a given turn
   */
  async isAutoSendAllowed(
    businessId: string,
    confidence?: number,
    options?: { shadowMode?: boolean },
  ): Promise<boolean> {
    const resolution = await this.resolveReplyMode(businessId, confidence, options);
    return resolution.effectiveMode === ReplyMode.auto_send;
  }
}
