import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

import {
  ApproveDraftMessageSchema,
  AssignConversationSchema,
  type ConversationNoteDto,
  CreateInternalNoteSchema,
  type MessageDto,
} from "@app/shared";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import {
  DELIVER_OUTBOUND_JOB,
  DELIVER_OUTBOUND_QUEUE,
  type DeliverOutboundJobData,
  mapMessageToDto,
  type MessageWithOptionalAttachments,
} from "../messages/messages.service";

@Injectable()
export class ThreadActionsService implements OnModuleDestroy {
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
          "Could not initialize BullMQ deliver_outbound queue in ThreadActionsService",
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
   * 13 §6.2 POST /api/v1/messages/:id/approve
   * Approves an AI draft message, optionally edits content, and queues for delivery.
   */
  async approveMessage(
    businessId: string,
    messageId: string,
    _currentUserId: string,
    rawDto?: unknown,
  ): Promise<MessageDto> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, business_id: businessId },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Message not found",
        },
      });
    }

    // Check draft_only mode
    const aiMetadata = message.ai_metadata as Record<string, unknown> | null;
    if (aiMetadata?.reply_mode === "draft_only") {
      throw new ConflictException({
        error: {
          code: "draft_only",
          message: "Draft-only messages cannot be approved. Copy and send via POST /messages.",
        },
      });
    }

    let nextContent = message.content;
    if (rawDto && typeof rawDto === "object") {
      const parseResult = ApproveDraftMessageSchema.safeParse(rawDto);
      if (parseResult.success && parseResult.data.content !== undefined) {
        nextContent = parseResult.data.content;
      }
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        delivery_status: "queued",
        content: nextContent,
      },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
    });

    if (this.queue) {
      try {
        await this.queue.add(
          DELIVER_OUTBOUND_JOB,
          {
            messageId: updated.id,
            businessId,
            channelAccountId: updated.channel_account_id,
            channel_account_id: updated.channel_account_id,
            enqueuedAt: Date.now(),
          },
          {
            jobId: updated.id,
            removeOnComplete: true,
          },
        );
      } catch (err) {
        logger.warn(
          { err, messageId: updated.id },
          "Failed to enqueue approved message to outbound queue",
        );
      }
    }

    return this.mapToMessageDto(updated);
  }

  /**
   * 13 §6.2 POST /api/v1/messages/:id/retry
   * Retries failed message send by transitioning failed -> queued.
   */
  async retryMessage(
    businessId: string,
    messageId: string,
    _currentUserId: string,
  ): Promise<MessageDto> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, business_id: businessId },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Message not found",
        },
      });
    }

    if (message.delivery_status === "draft") {
      throw new BadRequestException({
        error: {
          code: "invalid_state",
          message: "Draft messages must be approved before sending. Use /approve instead.",
        },
      });
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        delivery_status: "queued",
      },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
    });

    if (this.queue) {
      try {
        await this.queue.add(
          DELIVER_OUTBOUND_JOB,
          {
            messageId: updated.id,
            businessId,
            channelAccountId: updated.channel_account_id,
            channel_account_id: updated.channel_account_id,
            enqueuedAt: Date.now(),
          },
          {
            jobId: updated.id,
            removeOnComplete: true,
          },
        );
      } catch (err) {
        logger.warn(
          { err, messageId: updated.id },
          "Failed to enqueue retried message to outbound queue",
        );
      }
    }

    return this.mapToMessageDto(updated);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/takeover
   * Human takeover. Sets `ai_enabled = false`.
   * Transitions HUMAN_REQUIRED -> HUMAN_HANDLING.
   */
  async takeover(
    businessId: string,
    conversationId: string,
    currentUserId: string,
  ): Promise<{ success: boolean; aiEnabled: boolean; status: string }> {
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

    const shouldTransition = conversation.status === "HUMAN_REQUIRED";
    const nextStatus = shouldTransition ? "HUMAN_HANDLING" : conversation.status;

    await this.prisma.$transaction(async (tx) => {
      if (shouldTransition) {
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
        },
      });
    });

    return {
      success: true,
      aiEnabled: false,
      status: nextStatus,
    };
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/resume (or resume-ai)
   * Resumes AI on the conversation.
   * Guard: Rejects with 409 Conflict if an unconfirmed order draft exists.
   */
  async resumeAi(
    businessId: string,
    conversationId: string,
    currentUserId: string,
  ): Promise<{ success: boolean; aiEnabled: boolean; status: string }> {
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

    // 409 Guard: Check for pending confirmation orders on this conversation
    const pendingOrders = await this.prisma.order.findMany({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
        status: "PENDING_CONFIRMATION",
      },
    });

    if (pendingOrders.length > 0) {
      throw new ConflictException({
        error: {
          code: "pending_order_blocks_resume",
          message: "Cannot resume AI while an unconfirmed order exists for this conversation",
        },
      });
    }

    const shouldTransitionToActive =
      conversation.status === "HUMAN_REQUIRED" || conversation.status === "HUMAN_HANDLING";
    const nextStatus = shouldTransitionToActive ? "AI_ACTIVE" : conversation.status;

    await this.prisma.$transaction(async (tx) => {
      if (shouldTransitionToActive) {
        await tx.conversationStatusEvent.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            from_status: conversation.status,
            to_status: "AI_ACTIVE",
            actor_type: "user",
            actor_user_id: currentUserId,
            is_test: conversation.is_test,
          },
        });
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          ai_enabled: true,
          status: nextStatus,
        },
      });
    });

    return {
      success: true,
      aiEnabled: true,
      status: nextStatus,
    };
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/assign
   * Assigns conversation to an active teammate or unassigns.
   */
  async assign(
    businessId: string,
    conversationId: string,
    currentUserId: string,
    rawDto: unknown,
  ): Promise<{ success: boolean; assignedUserId: string | null }> {
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

    const parseResult = AssignConversationSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid assign conversation payload",
        },
      });
    }

    const targetUserId = parseResult.data.userId ?? parseResult.data.assignedUserId ?? null;

    if (targetUserId) {
      const activeMember = await this.prisma.businessMember.findFirst({
        where: {
          business_id: businessId,
          user_id: targetUserId,
          removed_at: null,
        },
      });

      if (!activeMember) {
        throw new BadRequestException({
          error: {
            code: "invalid_user",
            message: "Target user is not an active member of this business",
          },
        });
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.conversationAssignment.updateMany({
        where: {
          business_id: businessId,
          conversation_id: conversationId,
          status: "active",
        },
        data: {
          status: "released",
          released_at: now,
        },
      });

      if (targetUserId) {
        await tx.conversationAssignment.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            user_id: targetUserId,
            assigned_by_user_id: currentUserId,
            status: "active",
            assigned_at: now,
          },
        });
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          assigned_user_id: targetUserId,
        },
      });
    });

    return {
      success: true,
      assignedUserId: targetUserId,
    };
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/close
   * Closes conversation (transitions status to RESOLVED).
   * Guard: Rejects with 409 Conflict if an unconfirmed order exists.
   */
  async close(
    businessId: string,
    conversationId: string,
    currentUserId: string,
  ): Promise<{ success: boolean; status: string }> {
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

    // 409 Guard: Cannot close if pending confirmation order exists
    const pendingOrders = await this.prisma.order.findMany({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
        status: "PENDING_CONFIRMATION",
      },
    });

    if (pendingOrders.length > 0) {
      throw new ConflictException({
        error: {
          code: "pending_order_blocks_close",
          message:
            "Cannot close conversation while an unconfirmed order exists. Confirm or cancel the order first.",
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.conversationStatusEvent.create({
        data: {
          business_id: businessId,
          conversation_id: conversationId,
          from_status: conversation.status,
          to_status: "RESOLVED",
          actor_type: "user",
          actor_user_id: currentUserId,
          is_test: conversation.is_test,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          status: "RESOLVED",
        },
      });
    });

    return {
      success: true,
      status: "RESOLVED",
    };
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/notes
   * Creates an internal team note. Never dispatched as outbound message to customer.
   */
  async createNote(
    businessId: string,
    conversationId: string,
    currentUserId: string,
    rawDto: unknown,
  ): Promise<ConversationNoteDto> {
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

    const parseResult = CreateInternalNoteSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid internal note payload",
        },
      });
    }

    const note = await this.prisma.conversationNote.create({
      data: {
        business_id: businessId,
        conversation_id: conversationId,
        author_user_id: currentUserId,
        body: parseResult.data.body,
      },
    });

    return {
      id: note.id,
      businessId: note.business_id,
      conversationId: note.conversation_id,
      authorUserId: note.author_user_id,
      body: note.body,
      createdAt: note.created_at,
    };
  }

  /**
   * 13 §6.2 GET /api/v1/conversations/:id/notes
   * Retrieves all internal notes for a conversation.
   */
  async getNotes(businessId: string, conversationId: string): Promise<ConversationNoteDto[]> {
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

    const notes = await this.prisma.conversationNote.findMany({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
      },
      orderBy: { created_at: "asc" },
    });

    return notes.map((n) => ({
      id: n.id,
      businessId: n.business_id,
      conversationId: n.conversation_id,
      authorUserId: n.author_user_id,
      body: n.body,
      createdAt: n.created_at,
    }));
  }
}
