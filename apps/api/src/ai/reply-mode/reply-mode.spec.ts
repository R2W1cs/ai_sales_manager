import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  ContentType,
  MessageDeliveryStatus,
  MessageDirection,
  ReplyMode,
  SenderType,
  type AiAgent,
  type AiSettings,
  type Conversation,
  type FeatureFlag,
  type Message,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { Queue } from "bullmq";

import {
  DELIVER_OUTBOUND_JOB,
  DEFAULT_CONFIDENCE_THRESHOLD,
  ReplyModeService,
  type DeliverOutboundJobData,
} from "./reply-mode.service";

interface MockDb {
  aiSettings: Map<string, Partial<AiSettings>>;
  aiAgent: Map<string, Partial<AiAgent>>;
  conversations: Map<string, Partial<Conversation>>;
  featureFlags: Map<string, Partial<FeatureFlag>>;
  messages: (Message & { attachments?: unknown[] })[];
}

describe("AI reply modes engine (approval_required, auto_send, draft_only) (T-AI-04)", () => {
  let service: ReplyModeService;
  let mockPrisma: PrismaClient;
  let mockQueue: {
    add: jest.Mock;
    close: jest.Mock;
  };
  let mockRealtimeNotifier: {
    emitMessageNew: jest.Mock;
  };
  let mockMessageUpdate: jest.Mock;
  let db: MockDb;

  const tenantA = "11111111-1111-4111-a111-111111111111";
  const tenantB = "22222222-2222-4222-a222-222222222222";
  const conversationId1 = "aaaa1111-1111-4111-a111-111111111111";
  const conversationId2 = "bbbb2222-2222-4222-a222-222222222222";
  const channelAccountId1 = "cccc3333-3333-4333-a333-333333333333";

  beforeEach(() => {
    db = {
      aiSettings: new Map(),
      aiAgent: new Map(),
      conversations: new Map(),
      featureFlags: new Map(),
      messages: [],
    };

    // Seed conversation for tenantA
    db.conversations.set(conversationId1, {
      id: conversationId1,
      business_id: tenantA,
      channel_account_id: channelAccountId1,
    });

    // Seed conversation for tenantB
    db.conversations.set(conversationId2, {
      id: conversationId2,
      business_id: tenantB,
      channel_account_id: null,
    });

    // Setup mock Prisma Client
    mockMessageUpdate = jest.fn(
      ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: { delivery_status?: MessageDeliveryStatus };
        include?: { attachments?: { orderBy: { sort_order: "asc" } } };
      }) => {
        const existing = db.messages.find((m) => m.id === where.id);
        if (!existing) {
          return Promise.reject(new Error("Message not found"));
        }
        if (data.delivery_status) {
          existing.delivery_status = data.delivery_status;
        }
        const updated = {
          ...existing,
          attachments: include?.attachments ? (existing.attachments ?? []) : undefined,
        };
        return Promise.resolve(updated as unknown as Message);
      },
    );

    mockPrisma = {
      aiSettings: {
        findUnique: jest.fn(({ where }: { where: { business_id: string } }) => {
          return Promise.resolve(db.aiSettings.get(where.business_id) ?? null);
        }),
      },
      aiAgent: {
        findUnique: jest.fn(({ where }: { where: { business_id: string } }) => {
          return Promise.resolve(db.aiAgent.get(where.business_id) ?? null);
        }),
      },
      featureFlag: {
        findFirst: jest.fn(
          ({ where }: { where: { business_id?: string | null; feature: string } }) => {
            const key = `${where.business_id ?? "platform"}:${where.feature}`;
            return Promise.resolve(db.featureFlags.get(key) ?? null);
          },
        ),
      },
      conversation: {
        findFirst: jest.fn(({ where }: { where: { id: string; business_id: string } }) => {
          const conv = db.conversations.get(where.id);
          if (conv?.business_id === where.business_id) {
            return Promise.resolve(conv);
          }
          return Promise.resolve(null);
        }),
      },
      message: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const created: Message & { attachments?: unknown[] } = {
            id: `msg-${String(db.messages.length + 1)}`,
            business_id: data.business_id as string,
            conversation_id: data.conversation_id as string,
            channel_account_id: (data.channel_account_id as string | undefined) ?? null,
            direction: data.direction as MessageDirection,
            sender_type: data.sender_type as SenderType,
            sender_user_id: null,
            content: (data.content as string | undefined) ?? null,
            content_type: ContentType.text,
            external_message_id: null,
            delivery_status: data.delivery_status as MessageDeliveryStatus,
            idempotency_key: data.idempotency_key as string,
            ai_metadata: (data.ai_metadata as Prisma.JsonValue | undefined) ?? null,
            created_at: new Date(),
            attachments: (data.attachments as { create?: unknown[] } | undefined)?.create ?? [],
          };
          db.messages.push(created);
          return Promise.resolve(created as unknown as Message);
        }),
        update: mockMessageUpdate,
      },
    } as unknown as PrismaClient;

    // Setup mock BullMQ Queue
    mockQueue = {
      add: jest.fn((name: string, data: unknown, opts?: { jobId?: string }) => {
        return Promise.resolve({
          id: opts?.jobId ?? "job-123",
          name,
          data,
        });
      }),
      close: jest.fn(() => Promise.resolve()),
    };

    // Setup mock Realtime Notifier
    mockRealtimeNotifier = {
      emitMessageNew: jest.fn(),
    };

    service = new ReplyModeService(
      mockPrisma,
      mockQueue as unknown as Queue<DeliverOutboundJobData>,
      mockRealtimeNotifier,
    );
  });

  describe("1. Approval Required Mode (Default & Standard)", () => {
    it("Approval Required: Creates draft message requiring human approval and does NOT enqueue to outbound queue", async () => {
      // Seed tenantA with APPROVAL_REQUIRED setting
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.approval_required,
      });

      const result = await service.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "Bonjour! Comment puis-je vous aider aujourd'hui?",
        confidence: 0.95,
        aiMetadata: { model: "gemini-3.5-flash", intent: "greeting" },
      });

      // 1. Message persisted with delivery_status = DRAFT
      expect(result.message).toBeDefined();
      expect(result.message.delivery_status).toBe(MessageDeliveryStatus.draft);
      expect(result.message.direction).toBe(MessageDirection.outbound);
      expect(result.message.sender_type).toBe(SenderType.ai);
      expect(result.message.content).toBe("Bonjour! Comment puis-je vous aider aujourd'hui?");
      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.draft);
      expect(result.effectiveMode).toBe(ReplyMode.approval_required);
      expect(result.configuredMode).toBe(ReplyMode.approval_required);
      expect(result.downgraded).toBe(false);

      // 2. Realtime notification emitted to inbox for human review
      expect(mockRealtimeNotifier.emitMessageNew).toHaveBeenCalledTimes(1);
      expect(mockRealtimeNotifier.emitMessageNew).toHaveBeenCalledWith(
        tenantA,
        conversationId1,
        result.message,
      );

      // 3. Invariant: Does NOT dispatch to outbound queue
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(result.jobId).toBeUndefined();
    });

    it("Resolves approval_required correctly from settings", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.approval_required,
      });

      const resolution = await service.resolveReplyMode(tenantA, 0.9);
      expect(resolution.effectiveMode).toBe(ReplyMode.approval_required);
      expect(resolution.configuredMode).toBe(ReplyMode.approval_required);
      expect(resolution.downgraded).toBe(false);
      expect(await service.isAutoSendAllowed(tenantA, 0.9)).toBe(false);
    });
  });

  describe("2. Auto Send Mode", () => {
    it("Auto Send: Dispatches message directly to outbound queue when confidence is high", async () => {
      // Seed tenantA with AUTO_SEND setting & default confidence threshold (0.65)
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });
      db.aiAgent.set(tenantA, {
        business_id: tenantA,
        confidence_threshold: 0.65 as unknown as AiAgent["confidence_threshold"],
      });

      const result = await service.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "Nous avons bien ce t-shirt en taille M en stock à 49 TND.",
        confidence: 0.92,
        aiMetadata: { model: "gemini-3.5-flash", intent: "product_inquiry" },
      });

      // 1. Message persisted with delivery_status = QUEUED
      expect(result.message.delivery_status).toBe(MessageDeliveryStatus.queued);
      expect(result.effectiveMode).toBe(ReplyMode.auto_send);
      expect(result.configuredMode).toBe(ReplyMode.auto_send);
      expect(result.downgraded).toBe(false);
      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.queued);

      // 2. Dispatches directly to BullMQ deliver_outbound queue with messageId as jobId
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        DELIVER_OUTBOUND_JOB,
        {
          messageId: result.message.id,
          businessId: tenantA,
          channelAccountId: channelAccountId1,
          channel_account_id: channelAccountId1,
          enqueuedAt: expect.any(Number),
        },
        {
          jobId: result.message.id,
          removeOnComplete: true,
        },
      );
      expect(result.jobId).toBe(result.message.id);

      // 3. Emits realtime notification to inbox
      expect(mockRealtimeNotifier.emitMessageNew).toHaveBeenCalledWith(
        tenantA,
        conversationId1,
        result.message,
      );
    });

    it("Allows auto-send when confidence is above threshold", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });
      db.aiAgent.set(tenantA, {
        business_id: tenantA,
        confidence_threshold: 0.7 as unknown as AiAgent["confidence_threshold"],
      });

      expect(await service.isAutoSendAllowed(tenantA, 0.85)).toBe(true);
      expect(await service.isAutoSendAllowed(tenantA, 0.7)).toBe(true);
    });

    it("Marks message as failed when outbound queue enqueue fails", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });
      mockQueue.add.mockRejectedValueOnce(new Error("Redis unavailable"));

      const result = await service.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "Auto-send reply that fails to enqueue.",
        confidence: 0.95,
      });

      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.failed);
      expect(result.message.delivery_status).toBe(MessageDeliveryStatus.failed);
      expect(result.jobId).toBeUndefined();
      expect(mockMessageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: result.message.id },
          data: { delivery_status: MessageDeliveryStatus.failed },
        }),
      );
    });

    it("Marks message as failed when outbound queue is unavailable", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });

      const serviceWithoutQueue = new ReplyModeService(mockPrisma, null, mockRealtimeNotifier);

      const result = await serviceWithoutQueue.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "Auto-send reply with no queue configured.",
        confidence: 0.95,
      });

      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.failed);
      expect(result.message.delivery_status).toBe(MessageDeliveryStatus.failed);
      expect(result.jobId).toBeUndefined();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("3. Low Confidence Fallback & Safety Downgrades", () => {
    it("Low Confidence: Automatically downgrades auto-send to draft on low confidence.", async () => {
      // Configure tenant A in AUTO_SEND mode with agent threshold 0.65
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });
      db.aiAgent.set(tenantA, {
        business_id: tenantA,
        confidence_threshold: 0.65 as unknown as AiAgent["confidence_threshold"],
      });

      // AI confidence 0.45 < threshold 0.65
      const result = await service.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "I think you might be asking about our return policy, but I am not certain.",
        confidence: 0.45,
        aiMetadata: { intent: "policy_question" },
      });

      // 1. Downgraded to approval_required and saved as draft
      expect(result.effectiveMode).toBe(ReplyMode.approval_required);
      expect(result.configuredMode).toBe(ReplyMode.auto_send);
      expect(result.downgraded).toBe(true);
      expect(result.downgradeReason).toBe("low_confidence");
      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.draft);
      expect(result.message.delivery_status).toBe(MessageDeliveryStatus.draft);

      // 2. Enriched metadata contains downgrade details
      expect((result.message.ai_metadata as Record<string, unknown>).downgraded).toBe(true);
      expect((result.message.ai_metadata as Record<string, unknown>).downgradeReason).toBe(
        "low_confidence",
      );
      expect((result.message.ai_metadata as Record<string, unknown>).confidence).toBe(0.45);
      expect((result.message.ai_metadata as Record<string, unknown>).confidenceThreshold).toBe(
        0.65,
      );

      // 3. Invariant: Does NOT dispatch to outbound queue
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(result.jobId).toBeUndefined();

      // 4. Emits message.new for inbox review
      expect(mockRealtimeNotifier.emitMessageNew).toHaveBeenCalledWith(
        tenantA,
        conversationId1,
        result.message,
      );
    });

    it("Downgrades auto_send when confidence is missing", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });

      const resolution = await service.resolveReplyMode(tenantA);
      expect(resolution.effectiveMode).toBe(ReplyMode.approval_required);
      expect(resolution.configuredMode).toBe(ReplyMode.auto_send);
      expect(resolution.downgraded).toBe(true);
      expect(resolution.downgradeReason).toBe("low_confidence");
      expect(await service.isAutoSendAllowed(tenantA)).toBe(false);
    });

    it("Downgrades based on custom agent confidence threshold", async () => {
      // Configure custom high threshold 0.85
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });
      db.aiAgent.set(tenantA, {
        business_id: tenantA,
        confidence_threshold: 0.85 as unknown as AiAgent["confidence_threshold"],
      });

      // Confidence 0.80 would pass default 0.65, but fails custom 0.85
      const resolution = await service.resolveReplyMode(tenantA, 0.8);
      expect(resolution.effectiveMode).toBe(ReplyMode.approval_required);
      expect(resolution.configuredMode).toBe(ReplyMode.auto_send);
      expect(resolution.downgraded).toBe(true);
      expect(resolution.downgradeReason).toBe("low_confidence");
      expect(resolution.confidenceThreshold).toBe(0.85);
      expect(await service.isAutoSendAllowed(tenantA, 0.8)).toBe(false);
    });

    it("Shadow mode forces draft even if auto_send with high confidence", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });
      db.aiAgent.set(tenantA, {
        business_id: tenantA,
        confidence_threshold: 0.6 as unknown as AiAgent["confidence_threshold"],
      });

      const result = await service.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "Testing in shadow mode.",
        confidence: 0.99,
        shadowMode: true,
      });

      expect(result.effectiveMode).toBe(ReplyMode.approval_required);
      expect(result.configuredMode).toBe(ReplyMode.auto_send);
      expect(result.downgraded).toBe(true);
      expect(result.downgradeReason).toBe("shadow_mode");
      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.draft);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("Shadow mode via database feature flag forces draft when option is omitted", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.auto_send,
      });
      db.featureFlags.set(`${tenantA}:ai_shadow_mode`, {
        business_id: tenantA,
        feature: "ai_shadow_mode",
        enabled: true,
      });

      const resolution = await service.resolveReplyMode(tenantA, 0.99);
      expect(resolution.effectiveMode).toBe(ReplyMode.approval_required);
      expect(resolution.configuredMode).toBe(ReplyMode.auto_send);
      expect(resolution.downgraded).toBe(true);
      expect(resolution.downgradeReason).toBe("shadow_mode");
    });

    it("Shadow mode preserves draft_only without upgrading it to approval_required", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.draft_only,
      });

      const resolution = await service.resolveReplyMode(tenantA, 0.99, { shadowMode: true });
      expect(resolution.effectiveMode).toBe(ReplyMode.draft_only);
      expect(resolution.configuredMode).toBe(ReplyMode.draft_only);
      expect(resolution.downgraded).toBe(false);
    });
  });

  describe("4. Draft Only Mode", () => {
    it("Draft Only: Saves message as draft and emits to inbox", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.draft_only,
      });

      const result = await service.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "Draft only sandbox mode message.",
        confidence: 0.95,
      });

      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.draft);
      expect(result.effectiveMode).toBe(ReplyMode.draft_only);
      expect(result.configuredMode).toBe(ReplyMode.draft_only);
      expect(result.downgraded).toBe(false);
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockRealtimeNotifier.emitMessageNew).toHaveBeenCalledWith(
        tenantA,
        conversationId1,
        result.message,
      );
    });
  });

  describe("5. Invariant: Default Draft for New Stores", () => {
    it("🛡️ Defaults strictly to approval_required when AiSettings row is missing", async () => {
      // tenantB has no AiSettings seeded
      expect(db.aiSettings.get(tenantB)).toBeUndefined();

      const resolution = await service.resolveReplyMode(tenantB, 0.99);
      expect(resolution.effectiveMode).toBe(ReplyMode.approval_required);
      expect(resolution.configuredMode).toBe(ReplyMode.approval_required);
      expect(resolution.confidenceThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLD);

      const result = await service.dispatchReply({
        businessId: tenantB,
        conversationId: conversationId2,
        content: "First AI draft for a new store.",
        confidence: 0.99,
      });

      expect(result.deliveryStatus).toBe(MessageDeliveryStatus.draft);
      expect(result.effectiveMode).toBe(ReplyMode.approval_required);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("6. Multi-tenant Isolation & Error Handling", () => {
    it("Throws NotFoundException when conversation belongs to a different tenant", async () => {
      // conversationId1 belongs to tenantA, but caller provides tenantB
      await expect(
        service.dispatchReply({
          businessId: tenantB,
          conversationId: conversationId1,
          content: "Cross-tenant intrusion attempt.",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("Throws BadRequestException when required parameters are missing", async () => {
      await expect(
        service.dispatchReply({
          businessId: "",
          conversationId: conversationId1,
          content: "Hello",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(service.resolveReplyMode("")).rejects.toThrow(BadRequestException);
    });

    it("Supports optional attachments and custom idempotency key", async () => {
      db.aiSettings.set(tenantA, {
        business_id: tenantA,
        reply_mode: ReplyMode.approval_required,
      });

      const result = await service.dispatchReply({
        businessId: tenantA,
        conversationId: conversationId1,
        content: "Here is the catalog image.",
        idempotencyKey: "custom-idemp-123",
        attachments: [
          {
            s3Key: "products/hoodie.png",
            contentType: "image/png",
            sizeBytes: 1024,
            sortOrder: 0,
          },
        ],
      });

      const createdAttachments = (
        result.message as unknown as { attachments?: { s3_key: string }[] }
      ).attachments;
      expect(createdAttachments).toBeDefined();
      expect(createdAttachments).toHaveLength(1);
      if (createdAttachments && createdAttachments.length > 0) {
        expect(createdAttachments[0]?.s3_key).toBe("products/hoodie.png");
      }
    });

    it("Handles queue close gracefully onModuleDestroy", async () => {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });
});
