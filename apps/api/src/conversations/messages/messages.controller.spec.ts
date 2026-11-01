import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import type { AuthenticatedUser } from "../../platform/security/tenant.guard";
import { ThreadActionsService } from "../threads/thread-actions.service";
import { MessagesController } from "./messages.controller";
import { type DeliverOutboundJobData, MessagesService } from "./messages.service";

/**
 * Automated TDD Test Suite for T-CONV-02 — Message thread, sending, actions (approve/retry/takeover/resume/assign/close/notes)
 */

interface MockPrisma {
  conversation: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  message: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  conversationStatusEvent: {
    create: jest.Mock;
  };
  conversationAssignment: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  conversationNote: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
  businessMember: {
    findFirst: jest.Mock;
  };
  order: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe("Message thread, sending, actions (approve/retry/takeover/resume/assign/close/notes) (T-CONV-02)", () => {
  let controller: MessagesController;
  let messagesService: MessagesService;
  let threadActionsService: ThreadActionsService;
  let prismaMock: MockPrisma;

  let queueMock: {
    add: jest.Mock;
  };

  const businessId = "11111111-1111-4111-a111-111111111111";
  const userId = "22222222-2222-4222-a222-222222222222";
  const conversationId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const messageId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

  const testUser: AuthenticatedUser = {
    id: userId,
    sub: userId,
    email: "rep@example.com",
    role: "employee",
    businessId,
  };

  const makeConversation = (overrides: Record<string, unknown> = {}) => ({
    id: conversationId,
    business_id: businessId,
    customer_id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    channel_account_id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
    source: "instagram",
    external_thread_id: "ext_123",
    status: "HUMAN_REQUIRED",
    ai_enabled: false,
    assigned_user_id: null,
    last_intent: "order_inquiry",
    escalation_reason: "complex_query",
    handoff_priority: "high",
    handoff_context: null,
    handoff_at: new Date("2026-08-20T10:00:00Z"),
    handoff_completed_at: null,
    summary: "Customer needs assistance",
    collected_fields: null,
    snoozed_until: null,
    lead_score: 80,
    lead_temperature: "hot",
    lead_score_factors: null,
    lead_scored_at: new Date("2026-08-20T10:00:00Z"),
    last_message_at: new Date("2026-08-20T12:00:00Z"),
    last_message_preview: "Can you help me?",
    staff_read_at: new Date("2026-08-20T12:00:00Z"),
    is_test: false,
    whatsapp_window_expires_at: null,
    created_at: new Date("2026-08-20T09:00:00Z"),
    updated_at: new Date("2026-08-20T12:00:00Z"),
    ...overrides,
  });

  const makeMessage = (overrides: Record<string, unknown> = {}) => ({
    id: messageId,
    business_id: businessId,
    conversation_id: conversationId,
    channel_account_id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
    direction: "outbound",
    sender_type: "human",
    sender_user_id: userId,
    content: "Hello, how can I help you?",
    content_type: "text",
    external_message_id: null,
    idempotency_key: "idem-key-123",
    ai_metadata: null,
    delivery_status: "queued",
    created_at: new Date("2026-08-20T12:00:00Z"),
    attachments: [],
    ...overrides,
  });

  beforeEach(() => {
    prismaMock = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue(makeConversation()),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...makeConversation(),
            ...data,
          }),
        ),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(makeMessage()),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...makeMessage(),
            ...data,
          }),
        ),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...makeMessage(),
            ...data,
          }),
        ),
      },
      conversationStatusEvent: {
        create: jest.fn().mockResolvedValue({ id: "event-123" }),
      },
      conversationAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "assign-123" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      conversationNote: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: "note-123",
            created_at: new Date(),
            ...data,
          }),
        ),
      },
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: "member-123",
          business_id: businessId,
          user_id: userId,
          removed_at: null,
        }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((cb: (tx: MockPrisma) => Promise<unknown>) => cb(prismaMock)),
    };

    queueMock = {
      add: jest.fn().mockResolvedValue({ id: "job-123" }),
    };

    messagesService = new MessagesService(
      prismaMock as unknown as PrismaClient,
      queueMock as unknown as Queue<DeliverOutboundJobData>,
    );

    threadActionsService = new ThreadActionsService(
      prismaMock as unknown as PrismaClient,
      queueMock as unknown as Queue<DeliverOutboundJobData>,
    );

    controller = new MessagesController(messagesService, threadActionsService);
  });

  describe("Permission & Security Guards", () => {
    it("Enforces @RequirePermission on all endpoints", () => {
      const getMessagesHandler = Reflect.get(MessagesController.prototype, "getMessages") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, getMessagesHandler)).toEqual(["inbox.read"]);

      const markAsReadHandler = Reflect.get(MessagesController.prototype, "markAsRead") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, markAsReadHandler)).toEqual(["inbox.write"]);

      const sendMessageHandler = Reflect.get(MessagesController.prototype, "sendMessage") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, sendMessageHandler)).toEqual(["inbox.write"]);

      const approveHandler = Reflect.get(MessagesController.prototype, "approveMessage") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, approveHandler)).toEqual(["inbox.write"]);

      const retryHandler = Reflect.get(MessagesController.prototype, "retryMessage") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, retryHandler)).toEqual(["inbox.write"]);

      const takeoverHandler = Reflect.get(MessagesController.prototype, "takeover") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, takeoverHandler)).toEqual(["inbox.write"]);

      const resumeAiHandler = Reflect.get(MessagesController.prototype, "resumeAi") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, resumeAiHandler)).toEqual(["inbox.write"]);

      const assignHandler = Reflect.get(MessagesController.prototype, "assign") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, assignHandler)).toEqual(["inbox.write"]);

      const closeHandler = Reflect.get(MessagesController.prototype, "close") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, closeHandler)).toEqual(["inbox.write"]);

      const createNoteHandler = Reflect.get(MessagesController.prototype, "createNote") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, createNoteHandler)).toEqual(["inbox.write"]);

      const getNotesHandler = Reflect.get(MessagesController.prototype, "getNotes") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, getNotesHandler)).toEqual(["inbox.read"]);
    });
  });

  describe("GET /conversations/:id/messages", () => {
    it("Negative Invariant: GET does NOT modify staff_read_at timestamp", async () => {
      const msg1 = makeMessage({ id: "msg-1", content: "First" });
      const msg2 = makeMessage({ id: "msg-2", content: "Second" });
      prismaMock.message.findMany.mockResolvedValue([msg1, msg2]);

      const result = await controller.getMessages(businessId, conversationId, {});

      expect(prismaMock.conversation.update).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("msg-1");
    });

    it("Throws 404 if conversation is not found or belongs to another business", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(null);

      await expect(controller.getMessages(businessId, "wrong-id", {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it("Supports query.after for reconnect backfill to filter newer messages", async () => {
      const anchor = makeMessage({
        id: "msg-anchor",
        created_at: new Date("2026-08-20T10:00:00Z"),
      });
      const newer = makeMessage({ id: "msg-newer", created_at: new Date("2026-08-20T10:05:00Z") });

      prismaMock.message.findFirst.mockResolvedValueOnce(anchor);
      prismaMock.message.findMany.mockResolvedValueOnce([newer]);

      const result = await controller.getMessages(businessId, conversationId, {
        after: "msg-anchor",
      });

      expect(prismaMock.message.findFirst).toHaveBeenCalledWith({
        where: { id: "msg-anchor", business_id: businessId, conversation_id: conversationId },
      });
      expect(prismaMock.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: businessId,
            conversation_id: conversationId,
            OR: [
              { created_at: { gt: anchor.created_at } },
              { created_at: anchor.created_at, id: { gt: anchor.id } },
            ],
          }),
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe("msg-newer");
    });
  });

  describe("POST /conversations/:id/read", () => {
    it("Explicit Mark Read: Updates staff_read_at on conversation", async () => {
      const res = await controller.markAsRead(businessId, conversationId);

      expect(res.success).toBe(true);
      expect(res.staffReadAt).toBeDefined();
      expect(prismaMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: expect.objectContaining({ staff_read_at: expect.any(Date) }),
        }),
      );
    });
  });

  describe("POST /conversations/:id/messages (Send Human Reply)", () => {
    it("Send Human Message: Sets implicit takeover and stops AI auto-turns.", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(
        makeConversation({
          status: "HUMAN_REQUIRED",
          ai_enabled: true,
        }),
      );

      const body = { content: "Here is your invoice link", contentType: "text" as const };
      const idempotencyKey = "idem-msg-001";

      const res = await controller.sendMessage(
        businessId,
        testUser,
        conversationId,
        body,
        idempotencyKey,
      );

      expect(res).toBeDefined();
      expect(res.content).toBe("Here is your invoice link");

      // Verify conversation updated with implicit takeover
      expect(prismaMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: expect.objectContaining({
            ai_enabled: false,
            status: "HUMAN_HANDLING",
            last_message_preview: "Here is your invoice link",
          }),
        }),
      );

      // Verify outbound job was enqueued
      expect(queueMock.add).toHaveBeenCalled();
    });

    it("Enforces Idempotency-Key header on message creation", async () => {
      const body = { content: "Test message" };

      // Missing header
      await expect(
        controller.sendMessage(businessId, testUser, conversationId, body, undefined),
      ).rejects.toThrow(BadRequestException);

      // Empty header
      await expect(
        controller.sendMessage(businessId, testUser, conversationId, body, ""),
      ).rejects.toThrow(BadRequestException);
    });

    it("Returns existing message on duplicate idempotent call with same payload", async () => {
      const existing = makeMessage({
        id: "existing-msg-id",
        idempotency_key: "idem-dup-key",
        content: "Same content",
      });
      prismaMock.message.findUnique.mockResolvedValue(existing);

      const res = await controller.sendMessage(
        businessId,
        testUser,
        conversationId,
        { content: "Same content" },
        "idem-dup-key",
      );

      expect(res.id).toBe("existing-msg-id");
      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it("Throws 409 Conflict if idempotency key used with different payload", async () => {
      const existing = makeMessage({
        id: "existing-msg-id",
        idempotency_key: "idem-conflict-key",
        content: "Original content",
      });
      prismaMock.message.findUnique.mockResolvedValue(existing);

      await expect(
        controller.sendMessage(
          businessId,
          testUser,
          conversationId,
          { content: "Different content" },
          "idem-conflict-key",
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("POST /messages/:id/approve & POST /messages/:id/retry", () => {
    it("Approve Draft: Marks draft approved and enqueues to outbound worker.", async () => {
      const draftMsg = makeMessage({
        id: messageId,
        delivery_status: "draft",
        content: "AI suggested draft",
      });
      prismaMock.message.findFirst.mockResolvedValue(draftMsg);

      const res = await controller.approveMessage(businessId, testUser, messageId, {
        content: "Edited AI reply",
      });

      expect(res).toBeDefined();
      expect(prismaMock.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: messageId },
          data: expect.objectContaining({
            delivery_status: "queued",
            content: "Edited AI reply",
          }),
        }),
      );
      expect(queueMock.add).toHaveBeenCalledWith(
        "deliver_outbound",
        expect.objectContaining({ messageId }),
        expect.objectContaining({ jobId: messageId }),
      );
    });

    it("Approve Draft: Throws 409 if message is in draft_only mode", async () => {
      const draftOnlyMsg = makeMessage({
        id: messageId,
        delivery_status: "draft",
        ai_metadata: { reply_mode: "draft_only" },
      });
      prismaMock.message.findFirst.mockResolvedValue(draftOnlyMsg);

      await expect(
        controller.approveMessage(businessId, testUser, messageId, undefined),
      ).rejects.toThrow(ConflictException);
    });

    it("Retry Message: Retries failed message and transitions to queued", async () => {
      const failedMsg = makeMessage({
        id: messageId,
        delivery_status: "failed",
      });
      prismaMock.message.findFirst.mockResolvedValue(failedMsg);

      const res = await controller.retryMessage(businessId, testUser, messageId);

      expect(res).toBeDefined();
      expect(prismaMock.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: messageId },
          data: { delivery_status: "queued" },
        }),
      );
      expect(queueMock.add).toHaveBeenCalledWith(
        "deliver_outbound",
        expect.objectContaining({ messageId }),
        expect.objectContaining({ jobId: messageId }),
      );
    });

    it("Retry Message: Rejects with 400 if message is still draft", async () => {
      const draftMsg = makeMessage({
        id: messageId,
        delivery_status: "draft",
      });
      prismaMock.message.findFirst.mockResolvedValue(draftMsg);

      await expect(controller.retryMessage(businessId, testUser, messageId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("Takeover & State Transitions", () => {
    it("Takeover: Transitions HUMAN_REQUIRED -> HUMAN_HANDLING and sets ai_enabled = false", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(
        makeConversation({
          status: "HUMAN_REQUIRED",
          ai_enabled: true,
        }),
      );

      const res = await controller.takeover(businessId, testUser, conversationId);

      expect(res.success).toBe(true);
      expect(res.aiEnabled).toBe(false);
      expect(res.status).toBe("HUMAN_HANDLING");
      expect(prismaMock.conversationStatusEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            from_status: "HUMAN_REQUIRED",
            to_status: "HUMAN_HANDLING",
          }),
        }),
      );
    });
  });

  describe("Pending Order Guard (409 Conflict)", () => {
    it("Pending Order Guard (409): Resume and close return 409 when pending order is open.", async () => {
      prismaMock.order.findMany.mockResolvedValue([
        {
          id: "order-pending-1",
          status: "PENDING_CONFIRMATION",
          conversation_id: conversationId,
          business_id: businessId,
        },
      ]);

      // Resume blocked with 409
      await expect(controller.resumeAi(businessId, testUser, conversationId)).rejects.toThrow(
        ConflictException,
      );

      // Close blocked with 409
      await expect(controller.close(businessId, testUser, conversationId)).rejects.toThrow(
        ConflictException,
      );
    });

    it("Resume AI: Transitions to AI_ACTIVE and sets ai_enabled = true when no pending orders exist", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);
      prismaMock.conversation.findFirst.mockResolvedValue(
        makeConversation({
          status: "HUMAN_HANDLING",
          ai_enabled: false,
        }),
      );

      const res = await controller.resumeAi(businessId, testUser, conversationId);

      expect(res.success).toBe(true);
      expect(res.aiEnabled).toBe(true);
      expect(res.status).toBe("AI_ACTIVE");
    });

    it("Close Conversation: Transitions status to RESOLVED when no pending orders exist", async () => {
      prismaMock.order.findMany.mockResolvedValue([]);
      prismaMock.conversation.findFirst.mockResolvedValue(
        makeConversation({
          status: "HUMAN_HANDLING",
        }),
      );

      const res = await controller.close(businessId, testUser, conversationId);

      expect(res.success).toBe(true);
      expect(res.status).toBe("RESOLVED");
      expect(prismaMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: { status: "RESOLVED" },
        }),
      );
    });
  });

  describe("Assign Conversation", () => {
    it("Assigns conversation to active teammate", async () => {
      const targetUserId = "33333333-3333-4333-a333-333333333333";
      prismaMock.businessMember.findFirst.mockResolvedValue({
        id: "member-333",
        user_id: targetUserId,
        business_id: businessId,
        removed_at: null,
      });

      const res = await controller.assign(businessId, testUser, conversationId, {
        userId: targetUserId,
      });

      expect(res.success).toBe(true);
      expect(res.assignedUserId).toBe(targetUserId);
      expect(prismaMock.conversationAssignment.create).toHaveBeenCalled();
    });

    it("Rejects assignment if target user is not an active member of the business", async () => {
      prismaMock.businessMember.findFirst.mockResolvedValue(null);

      await expect(
        controller.assign(businessId, testUser, conversationId, {
          userId: "44444444-4444-4444-a444-444444444444",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Internal Notes", () => {
    it("Internal Notes: Internal notes are saved without dispatching to customer.", async () => {
      const body = { body: "Customer requested callback tomorrow at 10 AM" };

      const res = await controller.createNote(businessId, testUser, conversationId, body);

      expect(res).toBeDefined();
      expect(res.body).toBe("Customer requested callback tomorrow at 10 AM");
      expect(res.authorUserId).toBe(userId);

      // Verify note saved in DB
      expect(prismaMock.conversationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_id: businessId,
            conversation_id: conversationId,
            author_user_id: userId,
            body: "Customer requested callback tomorrow at 10 AM",
          }),
        }),
      );

      // Invariant: NEVER queue or send outbound message for notes
      expect(prismaMock.message.create).not.toHaveBeenCalled();
      expect(queueMock.add).not.toHaveBeenCalled();
    });

    it("Retrieves notes in chronological order", async () => {
      const note1 = {
        id: "note-1",
        business_id: businessId,
        conversation_id: conversationId,
        author_user_id: userId,
        body: "First note",
        created_at: new Date("2026-08-20T10:00:00Z"),
      };
      const note2 = {
        id: "note-2",
        business_id: businessId,
        conversation_id: conversationId,
        author_user_id: userId,
        body: "Second note",
        created_at: new Date("2026-08-20T11:00:00Z"),
      };
      prismaMock.conversationNote.findMany.mockResolvedValue([note1, note2]);

      const res = await controller.getNotes(businessId, conversationId);

      expect(res).toHaveLength(2);
      expect(res[0]?.body).toBe("First note");
      expect(res[1]?.body).toBe("Second note");
    });
  });
});
