import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import type { TimelineItem } from "@app/shared";

import { prisma } from "../../lib/prisma";

@Injectable()
export class TimelineService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * 13 §6.2 GET /api/v1/conversations/:id/timeline (FR-CONV-040)
   * Projection-only merged chronological activity stream of:
   * - MESSAGE
   * - STATUS_CHANGE
   * - HANDOFF
   * - NOTE
   * - ORDER
   * - ASSIGNMENT
   * - AI_ACTION
   */
  async getTimeline(businessId: string, conversationId: string): Promise<TimelineItem[]> {
    // 1. Verify existence and multi-tenant boundary
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
          message: `Conversation ${conversationId} not found`,
        },
      });
    }

    // 2. Query source tables in parallel with strict tenant isolation
    const [messages, statusEvents, notes, orders, assignments, aiActions] = await Promise.all([
      this.prisma.message.findMany({
        where: { business_id: businessId, conversation_id: conversationId },
        include: { attachments: true },
      }),
      this.prisma.conversationStatusEvent.findMany({
        where: { business_id: businessId, conversation_id: conversationId },
      }),
      this.prisma.conversationNote.findMany({
        where: { business_id: businessId, conversation_id: conversationId },
      }),
      this.prisma.order.findMany({
        where: { business_id: businessId, conversation_id: conversationId },
        include: { items: true },
      }),
      this.prisma.conversationAssignment.findMany({
        where: { business_id: businessId, conversation_id: conversationId },
      }),
      this.prisma.aiAction.findMany({
        where: { business_id: businessId, conversation_id: conversationId },
      }),
    ]);

    // 3. Project into unified TimelineItem representation
    const items: TimelineItem[] = [];

    for (const m of messages) {
      items.push({
        id: m.id,
        type: "MESSAGE",
        timestamp: m.created_at,
        data: {
          id: m.id,
          direction: m.direction,
          senderType: m.sender_type,
          senderUserId: m.sender_user_id,
          content: m.content,
          contentType: m.content_type,
          deliveryStatus: m.delivery_status,
          aiMetadata: m.ai_metadata,
          attachments: m.attachments.map((a) => ({
            id: a.id,
            s3Key: a.s3_key,
            contentType: a.content_type,
            sizeBytes: a.size_bytes,
            sortOrder: a.sort_order,
            createdAt: a.created_at,
          })),
          createdAt: m.created_at,
        },
      });
    }

    for (const e of statusEvents) {
      const isHandoff =
        e.to_status === "HUMAN_REQUIRED" ||
        e.actor_type === "ai_escalation" ||
        Boolean(e.escalation_reason);

      items.push({
        id: e.id,
        type: isHandoff ? "HANDOFF" : "STATUS_CHANGE",
        timestamp: e.created_at,
        data: {
          id: e.id,
          fromStatus: e.from_status,
          toStatus: e.to_status,
          escalationReason: e.escalation_reason,
          actorType: e.actor_type,
          actorUserId: e.actor_user_id,
          isTest: e.is_test,
          createdAt: e.created_at,
        },
      });
    }

    for (const n of notes) {
      items.push({
        id: n.id,
        type: "NOTE",
        timestamp: n.created_at,
        data: {
          id: n.id,
          authorUserId: n.author_user_id,
          body: n.body,
          createdAt: n.created_at,
        },
      });
    }

    for (const o of orders) {
      items.push({
        id: o.id,
        type: "ORDER",
        timestamp: o.created_at,
        data: {
          id: o.id,
          status: o.status,
          paymentStatus: o.payment_status,
          currency: o.currency,
          total: o.total.toString(),
          subtotal: o.subtotal.toString(),
          deliveryFee: o.delivery_fee.toString(),
          orderConfirmedAt: o.order_confirmed_at,
          cancelledAt: o.cancelled_at,
          completedAt: o.completed_at,
          items: o.items.map((i) => ({
            id: i.id,
            variantId: i.variant_id,
            quantity: i.quantity,
            unitPrice: i.unit_price.toString(),
            nameSnapshot: i.name_snapshot,
            skuSnapshot: i.sku_snapshot,
            attributesSnapshot: i.attributes_snapshot,
          })),
          createdAt: o.created_at,
        },
      });
    }

    for (const a of assignments) {
      items.push({
        id: a.id,
        type: "ASSIGNMENT",
        timestamp: a.assigned_at,
        data: {
          id: a.id,
          userId: a.user_id,
          assignedByUserId: a.assigned_by_user_id,
          status: a.status,
          assignedAt: a.assigned_at,
          releasedAt: a.released_at,
        },
      });
    }

    for (const action of aiActions) {
      items.push({
        id: action.id,
        type: "AI_ACTION",
        timestamp: action.created_at,
        data: {
          id: action.id,
          actionType: action.action_type,
          toolName: action.tool_name,
          input: action.input,
          output: action.output,
          success: action.success,
          errorMessage: action.error_message,
          durationMs: action.duration_ms,
          createdAt: action.created_at,
        },
      });
    }

    // 4. Sort chronologically (ascending by timestamp, id tie-breaker)
    items.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.id.localeCompare(b.id);
    });

    return items;
  }
}
