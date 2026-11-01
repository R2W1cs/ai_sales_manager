import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import type { Message, MessageAttachment, PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

import {
  type MessageAttachmentDto,
  type MessageDto,
  type PaginatedMessagesResponse,
  SendMessageSchema,
} from "@app/shared";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import { downloadFileAsBuffer, uploadFile } from "../../lib/storage";

export const DELIVER_OUTBOUND_QUEUE = "deliver_outbound";
export const DELIVER_OUTBOUND_JOB = "deliver_outbound";

export interface DeliverOutboundJobData {
  messageId: string;
  businessId: string;
  channelAccountId?: string | null;
  channel_account_id?: string | null;
  enqueuedAt: number;
}

export interface MessageWithOptionalAttachments extends Message {
  attachments?: MessageAttachment[];
}

export function mapMessageToDto(m: MessageWithOptionalAttachments): MessageDto {
  return {
    id: m.id,
    businessId: m.business_id,
    conversationId: m.conversation_id,
    channelAccountId: m.channel_account_id,
    direction: m.direction,
    senderType: m.sender_type,
    senderUserId: m.sender_user_id,
    content: m.content,
    contentType: m.content_type,
    externalMessageId: m.external_message_id,
    idempotencyKey: m.idempotency_key,
    aiMetadata: m.ai_metadata,
    deliveryStatus: m.delivery_status,
    createdAt: m.created_at,
    attachments: (m.attachments ?? []).map((a): MessageAttachmentDto => ({
      id: a.id,
      s3Key: a.s3_key,
      contentType: a.content_type,
      sizeBytes: a.size_bytes,
      sortOrder: a.sort_order,
      createdAt: a.created_at,
    })),
  };
}

@Injectable()
export class MessagesService implements OnModuleDestroy {
  private readonly prisma: PrismaClient;
  private queue: Queue<DeliverOutboundJobData> | null = null;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<DeliverOutboundJobData> | null,
  ) {
    this.prisma = prismaClient ?? prisma;
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
          "Could not initialize BullMQ deliver_outbound queue in MessagesService",
        );
      }
    }
  }

  async onModuleDestroy() {
    if (this.queue) {
      try {
        await this.queue.close();
      } catch {
        // ignore teardown errors
      }
    }
  }

  private mapToMessageDto(m: MessageWithOptionalAttachments): MessageDto {
    return mapMessageToDto(m);
  }

  /**
   * 13 §6.2 GET /api/v1/conversations/:id/messages
   * Paginated thread messages toward the past.
   * Invariant: GET does NOT mark conversation read.
   */
  async getMessages(
    businessId: string,
    conversationId: string,
    query: { limit?: number; cursor?: string; after?: string } = {},
  ): Promise<PaginatedMessagesResponse> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, business_id: businessId },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Conversation not found",
        },
      });
    }

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);

    let cursorFilter: Record<string, unknown> = {};
    if (query.cursor) {
      const cursorMessage = await this.prisma.message.findFirst({
        where: {
          id: query.cursor,
          business_id: businessId,
          conversation_id: conversationId,
        },
      });

      if (cursorMessage) {
        cursorFilter = {
          OR: [
            { created_at: { lt: cursorMessage.created_at } },
            {
              created_at: cursorMessage.created_at,
              id: { lt: cursorMessage.id },
            },
          ],
        };
      }
    } else if (query.after) {
      const afterMessage = await this.prisma.message.findFirst({
        where: {
          id: query.after,
          business_id: businessId,
          conversation_id: conversationId,
        },
      });

      if (afterMessage) {
        cursorFilter = {
          OR: [
            { created_at: { gt: afterMessage.created_at } },
            {
              created_at: afterMessage.created_at,
              id: { gt: afterMessage.id },
            },
          ],
        };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
        ...cursorFilter,
      },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : undefined;

    return {
      items: items.map((m) => this.mapToMessageDto(m)),
      nextCursor: nextCursor ?? undefined,
      hasMore,
    };
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/read
   * Explicitly marks conversation read by staff.
   */
  async markAsRead(
    businessId: string,
    conversationId: string,
  ): Promise<{ success: boolean; staffReadAt: string }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, business_id: businessId },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Conversation not found",
        },
      });
    }

    const now = new Date();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { staff_read_at: now },
    });

    return {
      success: true,
      staffReadAt: now.toISOString(),
    };
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/messages
   * Send human reply. Sets implicit takeover (`ai_enabled = false`).
   * Transitions HUMAN_REQUIRED -> HUMAN_HANDLING.
   * Enqueues to BullMQ deliver_outbound.
   */
  async sendMessage(
    businessId: string,
    conversationId: string,
    currentUserId: string,
    rawDto: unknown,
    idempotencyKey?: string,
  ): Promise<MessageDto> {
    if (
      !idempotencyKey ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.length > 128
    ) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Idempotency-Key header is required (max 128 characters)",
        },
      });
    }

    const parseResult = SendMessageSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid send message payload",
        },
      });
    }

    const dto = parseResult.data;

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, business_id: businessId },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Conversation not found",
        },
      });
    }

    // Idempotency check:
    const existing = await this.prisma.message.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: { attachments: { orderBy: { sort_order: "asc" } } },
    });

    if (existing) {
      if (existing.business_id !== businessId || existing.conversation_id !== conversationId) {
        throw new ConflictException({
          error: {
            code: "idempotency_key_conflict",
            message: "Idempotency key already used for a different conversation or business",
          },
        });
      }

      if (existing.content !== (dto.content ?? null)) {
        throw new ConflictException({
          error: {
            code: "idempotency_key_conflict",
            message: "Idempotency key already used with different payload",
          },
        });
      }

      return this.mapToMessageDto(existing);
    }

    const now = new Date();
    const preview = dto.content ? dto.content.slice(0, 255) : "[Attachment]";
    const shouldTransitionToHandling = conversation.status === "HUMAN_REQUIRED";
    const nextStatus = shouldTransitionToHandling ? "HUMAN_HANDLING" : conversation.status;

    // Website replies are read by the embed through this API. There is no Meta
    // delivery step. Without a live Meta token, local demo sends are also recorded
    // as sent so the operator does not see a permanent "queued" state.
    let deliveryStatus: "queued" | "sent" = "queued";
    if (conversation.source === "website") {
      deliveryStatus = "sent";
    } else if (process.env.NODE_ENV !== "production") {
      const account = conversation.channel_account_id
        ? await this.prisma.channelAccount.findFirst({
            where: { id: conversation.channel_account_id },
            select: { status: true, credentials_ref: true },
          })
        : null;
      if (!account || account.status !== "active" || !account.credentials_ref) {
        deliveryStatus = "sent";
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (shouldTransitionToHandling) {
        await tx.conversationStatusEvent.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            from_status: conversation.status,
            to_status: "HUMAN_HANDLING",
            actor_type: "user",
            actor_user_id: currentUserId,
            is_test: conversation.is_test,
          },
        });
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          ai_enabled: false,
          status: nextStatus,
          last_message_at: now,
          last_message_preview: preview,
          staff_read_at: now,
        },
      });

      const message = await tx.message.create({
        data: {
          business_id: businessId,
          conversation_id: conversationId,
          channel_account_id: conversation.channel_account_id,
          direction: "outbound",
          sender_type: "human",
          sender_user_id: currentUserId,
          content: dto.content ?? null,
          content_type: dto.contentType ?? "text",
          delivery_status: deliveryStatus,
          idempotency_key: idempotencyKey,
          attachments:
            dto.attachments && dto.attachments.length > 0
              ? {
                  create: dto.attachments.map((att, idx) => ({
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

      return message;
    });

    if (this.queue) {
      try {
        await this.queue.add(
          DELIVER_OUTBOUND_JOB,
          {
            messageId: created.id,
            businessId,
            channelAccountId: conversation.channel_account_id,
            channel_account_id: conversation.channel_account_id,
            enqueuedAt: Date.now(),
          },
          {
            jobId: created.id,
            removeOnComplete: true,
          },
        );
      } catch (err) {
        logger.warn({ err, messageId: created.id }, "Failed to enqueue message to outbound queue");
      }
    }

    return this.mapToMessageDto(created);
  }

  /**
   * Stores an operator attachment for a conversation and returns the key
   * expected by POST .../messages.
   */
  async uploadAttachment(
    businessId: string,
    conversationId: string,
    body: { filename?: string; contentType?: string; dataBase64?: string },
  ): Promise<{ s3Key: string; contentType: string; sizeBytes: number }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, business_id: businessId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Conversation not found" },
      });
    }

    const contentType = (body.contentType || "application/octet-stream").toLowerCase();
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ]);
    if (!allowed.has(contentType)) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Only JPEG, PNG, WebP, GIF, and PDF attachments are supported",
        },
      });
    }

    const raw = body.dataBase64?.trim();
    if (!raw) {
      throw new BadRequestException({
        error: { code: "validation_error", message: "dataBase64 is required" },
      });
    }

    const buffer = Buffer.from(raw, "base64");
    if (buffer.length === 0 || buffer.length > 280 * 1024) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Attachment must be between 1 byte and 280 KB",
        },
      });
    }

    const safeName = (body.filename || "file")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const s3Key = `businesses/${businessId}/conversations/${conversationId}/attachments/${randomUUID()}-${safeName}`;
    await uploadFile(s3Key, buffer, { contentType });

    return { s3Key, contentType, sizeBytes: buffer.length };
  }

  async readAttachment(
    businessId: string,
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const prefix = `businesses/${businessId}/`;
    if (!key.startsWith(prefix) || key.includes("..")) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Attachment not found" },
      });
    }
    try {
      const buffer = await downloadFileAsBuffer(key);
      const lower = key.toLowerCase();
      const contentType = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".gif")
            ? "image/gif"
            : lower.endsWith(".pdf")
              ? "application/pdf"
              : "image/jpeg";
      return { buffer, contentType };
    } catch {
      throw new NotFoundException({
        error: { code: "not_found", message: "Attachment not found" },
      });
    }
  }
}
