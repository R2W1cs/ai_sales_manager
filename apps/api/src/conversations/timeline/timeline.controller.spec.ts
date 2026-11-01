import { NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { TimelineController } from "./timeline.controller";
import { TimelineService } from "./timeline.service";

/**
 * Automated TDD Test Suite for T-CONV-05 — Conversation timeline projection API (`GET /conversations/:id/timeline`)
 */

describe("Conversation timeline projection API (`GET /conversations/:id/timeline`) (T-CONV-05)", () => {
  let controller: TimelineController;
  let service: TimelineService;
  let prismaMock: {
    conversation: {
      findFirst: jest.Mock;
    };
    message: {
      findMany: jest.Mock;
    };
    conversationStatusEvent: {
      findMany: jest.Mock;
    };
    conversationNote: {
      findMany: jest.Mock;
    };
    order: {
      findMany: jest.Mock;
    };
    conversationAssignment: {
      findMany: jest.Mock;
    };
    aiAction: {
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-4111-a111-111111111111";
  const conversationId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const userId = "22222222-2222-4222-a222-222222222222";

  beforeEach(() => {
    prismaMock = {
      conversation: {
        findFirst: jest.fn(),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversationStatusEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversationNote: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversationAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      aiAction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new TimelineService(prismaMock as unknown as PrismaClient);
    controller = new TimelineController(service);
  });

  describe("Permission and Guard Metadata", () => {
    it("Controller endpoint requires inbox.read permission", () => {
      const handler = Reflect.get(TimelineController.prototype, "getTimeline") as object;
      const requiredPermission = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[];
      expect(requiredPermission).toEqual(["inbox.read"]);
    });
  });

  describe("Timeline Stream Projection", () => {
    it("Timeline Stream: Returns chronological interleaved event items.", async () => {
      // Setup conversation
      prismaMock.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
        status: "HUMAN_HANDLING",
      });

      const t1 = new Date("2026-08-20T10:00:00Z");
      const t2 = new Date("2026-08-20T10:05:00Z");
      const t3 = new Date("2026-08-20T10:10:00Z");
      const t4 = new Date("2026-08-20T10:15:00Z");
      const t5 = new Date("2026-08-20T10:20:00Z");
      const t6 = new Date("2026-08-20T10:25:00Z");
      const t7 = new Date("2026-08-20T10:30:00Z");

      // t1: Status event (NEW -> AI_ACTIVE)
      prismaMock.conversationStatusEvent.findMany.mockResolvedValue([
        {
          id: "evt-1",
          business_id: businessId,
          conversation_id: conversationId,
          from_status: "NEW",
          to_status: "AI_ACTIVE",
          escalation_reason: null,
          actor_type: "system",
          actor_user_id: null,
          is_test: false,
          created_at: t1,
        },
        // t4: Status event with handoff (AI_ACTIVE -> HUMAN_REQUIRED)
        {
          id: "evt-2",
          business_id: businessId,
          conversation_id: conversationId,
          from_status: "AI_ACTIVE",
          to_status: "HUMAN_REQUIRED",
          escalation_reason: "Customer requested human agent",
          actor_type: "ai_escalation",
          actor_user_id: null,
          is_test: false,
          created_at: t4,
        },
      ]);

      // t2: Customer inbound message
      prismaMock.message.findMany.mockResolvedValue([
        {
          id: "msg-1",
          business_id: businessId,
          conversation_id: conversationId,
          direction: "inbound",
          sender_type: "customer",
          sender_user_id: null,
          content: "I would like to purchase item X",
          content_type: "text",
          delivery_status: "delivered",
          ai_metadata: null,
          created_at: t2,
          attachments: [],
        },
      ]);

      // t3: AI Action (lookup catalog)
      prismaMock.aiAction.findMany.mockResolvedValue([
        {
          id: "act-1",
          business_id: businessId,
          conversation_id: conversationId,
          action_type: "tool_execution",
          tool_name: "query_catalog",
          input: { query: "item X" },
          output: { found: true },
          success: true,
          error_message: null,
          duration_ms: 120,
          created_at: t3,
        },
      ]);

      // t5: Internal staff note
      prismaMock.conversationNote.findMany.mockResolvedValue([
        {
          id: "note-1",
          business_id: businessId,
          conversation_id: conversationId,
          author_user_id: userId,
          body: "Spoke with customer, preparing discount",
          created_at: t5,
        },
      ]);

      // t6: Staff assignment
      prismaMock.conversationAssignment.findMany.mockResolvedValue([
        {
          id: "asgn-1",
          business_id: businessId,
          conversation_id: conversationId,
          user_id: userId,
          assigned_by_user_id: userId,
          status: "active",
          assigned_at: t6,
          released_at: null,
        },
      ]);

      // t7: Order created
      prismaMock.order.findMany.mockResolvedValue([
        {
          id: "ord-1",
          business_id: businessId,
          customer_id: "cust-1",
          conversation_id: conversationId,
          status: "PENDING_CONFIRMATION",
          payment_status: "NOT_COMPLETED",
          currency: "SAR",
          total: "150.000",
          subtotal: "130.000",
          delivery_fee: "20.000",
          order_confirmed_at: null,
          cancelled_at: null,
          completed_at: null,
          created_at: t7,
          items: [
            {
              id: "item-1",
              variant_id: "var-1",
              quantity: 1,
              unit_price: "130.000",
              name_snapshot: "Item X",
              sku_snapshot: "SKU-X",
              attributes_snapshot: null,
            },
          ],
        },
      ]);

      const result = await controller.getTimeline(businessId, conversationId);

      expect(result).toHaveLength(7);

      const [i0, i1, i2, i3, i4, i5, i6] = result;

      // Verify exact chronological sequence
      expect(i0?.id).toBe("evt-1");
      expect(i0?.type).toBe("STATUS_CHANGE");
      expect(i0?.timestamp).toEqual(t1);

      expect(i1?.id).toBe("msg-1");
      expect(i1?.type).toBe("MESSAGE");
      expect(i1?.timestamp).toEqual(t2);

      expect(i2?.id).toBe("act-1");
      expect(i2?.type).toBe("AI_ACTION");
      expect(i2?.timestamp).toEqual(t3);

      expect(i3?.id).toBe("evt-2");
      expect(i3?.type).toBe("HANDOFF");
      expect(i3?.timestamp).toEqual(t4);
      expect(i3?.data.escalationReason).toBe("Customer requested human agent");

      expect(i4?.id).toBe("note-1");
      expect(i4?.type).toBe("NOTE");
      expect(i4?.timestamp).toEqual(t5);

      expect(i5?.id).toBe("asgn-1");
      expect(i5?.type).toBe("ASSIGNMENT");
      expect(i5?.timestamp).toEqual(t6);

      expect(i6?.id).toBe("ord-1");
      expect(i6?.type).toBe("ORDER");
      expect(i6?.timestamp).toEqual(t7);
      expect(i6?.data.total).toBe("150.000");
    });

    it("Throws NotFoundException when conversation does not exist or tenant mismatch", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(null);

      await expect(controller.getTimeline(businessId, "non-existent-conv")).rejects.toThrow(
        NotFoundException,
      );

      expect(prismaMock.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: "non-existent-conv",
          business_id: businessId,
        },
      });
    });

    it("Returns an empty array when conversation has no events", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
        status: "NEW",
      });

      const result = await controller.getTimeline(businessId, conversationId);

      expect(result).toEqual([]);
    });

    it("Includes message attachments in message timeline items", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });

      const t1 = new Date("2026-08-20T10:00:00Z");

      prismaMock.message.findMany.mockResolvedValue([
        {
          id: "msg-attach",
          business_id: businessId,
          conversation_id: conversationId,
          direction: "outbound",
          sender_type: "agent",
          sender_user_id: userId,
          content: "Here is the receipt",
          content_type: "image",
          delivery_status: "delivered",
          ai_metadata: null,
          created_at: t1,
          attachments: [
            {
              id: "att-1",
              s3_key: "receipts/receipt.png",
              content_type: "image/png",
              size_bytes: 2048,
              sort_order: 0,
              created_at: t1,
            },
          ],
        },
      ]);

      const result = await controller.getTimeline(businessId, conversationId);

      expect(result).toHaveLength(1);
      const first = result[0];
      expect(first?.type).toBe("MESSAGE");
      const attachments = first?.data.attachments as { s3Key: string }[];
      expect(attachments).toHaveLength(1);
      expect(attachments[0]?.s3Key).toBe("receipts/receipt.png");
    });

    it("Handles identical timestamps with deterministic id tie-breaker", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });

      const sameTime = new Date("2026-08-20T12:00:00Z");

      prismaMock.conversationNote.findMany.mockResolvedValue([
        {
          id: "note-z",
          business_id: businessId,
          conversation_id: conversationId,
          author_user_id: userId,
          body: "Second note",
          created_at: sameTime,
        },
        {
          id: "note-a",
          business_id: businessId,
          conversation_id: conversationId,
          author_user_id: userId,
          body: "First note",
          created_at: sameTime,
        },
      ]);

      const result = await controller.getTimeline(businessId, conversationId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("note-a");
      expect(result[1]?.id).toBe("note-z");
    });
  });
});
