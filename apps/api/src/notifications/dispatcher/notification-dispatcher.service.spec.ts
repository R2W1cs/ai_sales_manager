/**
 * Automated TDD Test Suite for T-NOTIF-01 — Notification dispatcher & handoff/lead alert engine
 */

import type { Job } from "bullmq";

import {
  NotificationDispatcherService,
  type NotificationEvent,
} from "./notification-dispatcher.service";
import {
  NotificationsProcessor,
  type NotificationJobData,
  NOTIFICATIONS_JOB,
} from "./notifications.processor";

describe("Notification dispatcher & handoff/lead alert engine (T-NOTIF-01)", () => {
  const mockBusinessId = "11111111-1111-4111-8111-111111111111";
  const mockBusinessId2 = "99999999-9999-4999-8999-999999999999";
  const mockConversationId = "22222222-2222-4222-8222-222222222222";
  const mockOrderId = "33333333-3333-4333-8333-333333333333";

  let dispatcherService: NotificationDispatcherService;
  let processor: NotificationsProcessor;
  let mockPrisma: any;
  let mockQueue: any;
  let mockRedis: any;
  let mockRealtimeService: any;

  beforeEach(() => {
    mockPrisma = {
      businessMember: {
        findMany: jest.fn().mockResolvedValue([
          { user_id: "user-owner-1", role_id: "role-owner" },
          { user_id: "user-admin-2", role_id: "role-admin" },
        ]),
      },
      notification: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: `notif-${Math.random().toString(36).substring(2, 9)}`,
            ...data,
            read_at: null,
            created_at: new Date(),
          }),
        ),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-notif-123" }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockRedis = {
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };

    mockRealtimeService = {
      emitNotificationNew: jest.fn(),
    };

    processor = new NotificationsProcessor(mockPrisma, mockQueue, mockRealtimeService);

    dispatcherService = new NotificationDispatcherService(processor, mockRedis);
  });

  describe("1. Canonical Type Mapping & Dedupe Key Generation", () => {
    it("Maps event types to the 4 canonical DB NotificationTypes (12 §13.1)", () => {
      expect(dispatcherService.toCanonicalType("HANDOFF_REQUIRED")).toBe("HANDOFF");
      expect(dispatcherService.toCanonicalType("HANDOFF")).toBe("HANDOFF");
      expect(dispatcherService.toCanonicalType("HOT_LEAD")).toBe("HOT_LEAD");
      expect(dispatcherService.toCanonicalType("ORDER_PENDING")).toBe("ORDER_REQUEST");
      expect(dispatcherService.toCanonicalType("ORDER_DRAFT_READY")).toBe("ORDER_REQUEST");
      expect(dispatcherService.toCanonicalType("ORDER_REQUEST")).toBe("ORDER_REQUEST");
      expect(dispatcherService.toCanonicalType("USAGE_WARNING_85")).toBe("ESCALATION");
      expect(dispatcherService.toCanonicalType("USAGE_BREACH_100")).toBe("ESCALATION");
      expect(dispatcherService.toCanonicalType("ESCALATION")).toBe("ESCALATION");
    });

    it("Maps unknown event types to ESCALATION fallback with logging", () => {
      expect(dispatcherService.toCanonicalType("UNKNOWN_EVENT" as any)).toBe("ESCALATION");
    });

    it("Generates canonical hourly dedupe key format: {type}:{entity_id}:{yyyy-MM-ddTHH}", () => {
      const fixedDate = new Date("2026-08-28T08:15:30.000Z");
      const event: NotificationEvent = {
        businessId: mockBusinessId,
        type: "HANDOFF_REQUIRED",
        entityId: "conv-123",
      };

      const key = dispatcherService.generateDedupeKey(event, fixedDate);
      expect(key).toBe("handoff_required:conv-123:2026-08-28T08");
    });

    it("Generates canonical monthly dedupe key for quota warnings: usage_warning_85:{businessId}:{yyyy-MM}", () => {
      const fixedDate = new Date("2026-09-02T10:00:00.000Z");
      const event: NotificationEvent = {
        businessId: mockBusinessId,
        type: "USAGE_WARNING_85",
        entityId: mockBusinessId,
      };

      const key = dispatcherService.generateDedupeKey(event, fixedDate);
      expect(key).toBe(`usage_warning_85:${mockBusinessId}:2026-09`);
    });

    it("Respects custom dedupeKey if explicitly provided", () => {
      const event: NotificationEvent = {
        businessId: mockBusinessId,
        type: "HANDOFF",
        entityId: mockConversationId,
        dedupeKey: "custom_key_123",
      };

      expect(dispatcherService.generateDedupeKey(event)).toBe("custom_key_123");
    });
  });

  describe("2. Dispatcher Service & Duplicate Suppression", () => {
    it("Dispatches a notification event successfully when not suppressed", async () => {
      mockRedis.set.mockResolvedValue("OK"); // Successfully acquired lock/suppression key

      const result = await dispatcherService.dispatch({
        businessId: mockBusinessId,
        type: "HANDOFF_REQUIRED",
        entityId: mockConversationId,
        handoffPriority: "critical",
      });

      expect(result.dispatched).toBe(true);
      expect(result.reason).toBe("dispatched");
      expect(result.canonicalType).toBe("HANDOFF");
      expect(result.jobId).toBe("job-notif-123");
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        NOTIFICATIONS_JOB,
        expect.objectContaining({
          businessId: mockBusinessId,
          type: "HANDOFF",
          handoffPriority: "critical",
          entityId: mockConversationId,
        }),
        expect.objectContaining({
          attempts: 3,
        }),
      );
    });

    it("Suppression: Duplicate handoff event within 30 min is suppressed", async () => {
      mockRedis.set.mockResolvedValue(null); // Key already exists -> suppressed!

      const result = await dispatcherService.dispatch({
        businessId: mockBusinessId,
        type: "HANDOFF_REQUIRED",
        entityId: mockConversationId,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe("suppressed");
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("Suppression: Falls back to in-memory cache when Redis is unavailable", async () => {
      const inMemoryDispatcher = new NotificationDispatcherService(processor, null);

      const event: NotificationEvent = {
        businessId: mockBusinessId,
        type: "HOT_LEAD",
        entityId: mockConversationId,
      };

      const firstDispatch = await inMemoryDispatcher.dispatch(event);
      expect(firstDispatch.dispatched).toBe(true);

      const secondDispatch = await inMemoryDispatcher.dispatch(event);
      expect(secondDispatch.dispatched).toBe(false);
      expect(secondDispatch.reason).toBe("suppressed");
    });

    it("Suppression: Prunes expired in-memory cache entries when capacity threshold is reached", async () => {
      const inMemoryDispatcher = new NotificationDispatcherService(processor, null);

      // Seed cache with expired entries
      for (let i = 0; i < 1005; i++) {
        (inMemoryDispatcher as any).inMemorySuppressionCache.set(`old-key-${i}`, Date.now() - 1000);
      }

      expect((inMemoryDispatcher as any).inMemorySuppressionCache.size).toBe(1005);

      // Trigger isSuppressedOrMark to initiate prune
      await inMemoryDispatcher.isSuppressedOrMark("fresh-key", 60);

      // Expired entries should be pruned
      expect((inMemoryDispatcher as any).inMemorySuppressionCache.size).toBe(1);
    });

    it("Suppression: Enforces hard capacity limit and FIFO eviction when cache is full of unexpired entries (F4)", async () => {
      const inMemoryDispatcher = new NotificationDispatcherService(processor, null);

      // Seed cache with 1000 unexpired entries
      for (let i = 0; i < 1000; i++) {
        (inMemoryDispatcher as any).inMemorySuppressionCache.set(
          `unexpired-key-${i}`,
          Date.now() + 100000,
        );
      }

      expect((inMemoryDispatcher as any).inMemorySuppressionCache.size).toBe(1000);

      // Add one more key
      await inMemoryDispatcher.isSuppressedOrMark("overflow-key", 60);

      // Cache size must remain bounded at 1000
      expect((inMemoryDispatcher as any).inMemorySuppressionCache.size).toBe(1000);
      // Oldest entry (unexpired-key-0) was evicted
      expect((inMemoryDispatcher as any).inMemorySuppressionCache.has("unexpired-key-0")).toBe(
        false,
      );
      // New key is present
      expect((inMemoryDispatcher as any).inMemorySuppressionCache.has("overflow-key")).toBe(true);
    });

    it("Error Handling: Returns failed result and unmarks suppression if processor is missing (F2)", async () => {
      const noProcessorDispatcher = new NotificationDispatcherService(undefined, mockRedis);

      const event: NotificationEvent = {
        businessId: mockBusinessId,
        type: "HANDOFF",
        entityId: mockConversationId,
      };

      const result = await noProcessorDispatcher.dispatch(event);

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe("failed");
      expect(result.error).toContain("NotificationsProcessor is not available");
      expect(mockRedis.del).toHaveBeenCalledWith(
        `notif:suppress:${mockBusinessId}:${result.dedupeKey}`,
      );
    });

    it("Error Handling: Returns failed result and unmarks suppression if enqueueNotification throws (F2)", async () => {
      jest
        .spyOn(processor, "enqueueNotification")
        .mockRejectedValueOnce(new Error("Queue offline"));

      const event: NotificationEvent = {
        businessId: mockBusinessId,
        type: "HANDOFF",
        entityId: mockConversationId,
      };

      const result = await dispatcherService.dispatch(event);

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe("failed");
      expect(result.error).toBe("Queue offline");
      expect(mockRedis.del).toHaveBeenCalledWith(
        `notif:suppress:${mockBusinessId}:${result.dedupeKey}`,
      );
    });
  });

  describe("3. Priority Collapsing (HANDOFF + HOT_LEAD)", () => {
    it("Simultaneous handoff + hot lead emits a single unified notification", () => {
      const events: NotificationEvent[] = [
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          title: "Hot Lead Detected",
          metadata: { score: 95 },
        },
        {
          businessId: mockBusinessId,
          type: "HANDOFF_REQUIRED",
          entityId: mockConversationId,
          title: "Human Takeover Required",
          message: "Angry customer requesting manager",
          metadata: { reason: "angry_customer" },
        },
      ];

      const collapsed = dispatcherService.collapsePriority(events);

      expect(collapsed).toHaveLength(1);
      expect(collapsed[0]?.type).toBe("HANDOFF_REQUIRED");
      expect(collapsed[0]?.metadata).toEqual(
        expect.objectContaining({
          score: 95,
          reason: "angry_customer",
          is_hot_lead: true,
        }),
      );
      expect(collapsed[0]?.message).toBe("Angry customer requesting manager (Hot Lead)");
    });

    it("Safely handles events with undefined or null metadata without throwing (F1)", () => {
      const events: NotificationEvent[] = [
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          metadata: undefined,
        },
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          metadata: null as any,
        },
        {
          businessId: mockBusinessId,
          type: "HANDOFF",
          entityId: mockConversationId,
          metadata: undefined,
        },
      ];

      expect(() => dispatcherService.collapsePriority(events)).not.toThrow();
      const collapsed = dispatcherService.collapsePriority(events);
      expect(collapsed).toHaveLength(1);
      expect(collapsed[0]?.metadata).toEqual({ is_hot_lead: true });
    });

    it("Safely handles repeated hot leads with undefined metadata without throwing (F1)", () => {
      const events: NotificationEvent[] = [
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          metadata: undefined,
        },
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          metadata: { intent: "purchase" },
        },
      ];

      expect(() => dispatcherService.collapsePriority(events)).not.toThrow();
      const collapsed = dispatcherService.collapsePriority(events);
      expect(collapsed).toHaveLength(1);
      expect(collapsed[0]?.metadata).toEqual({ intent: "purchase" });
    });

    it("Partitions collapsing by businessId and entityId (multi-tenant isolation) (F5)", () => {
      const sharedEntityId = "shared-entity-123";
      const events: NotificationEvent[] = [
        {
          businessId: mockBusinessId,
          type: "HANDOFF",
          entityId: sharedEntityId,
          metadata: { tenant: "business-1" },
        },
        {
          businessId: mockBusinessId2,
          type: "HOT_LEAD",
          entityId: sharedEntityId,
          metadata: { tenant: "business-2" },
        },
      ];

      const collapsed = dispatcherService.collapsePriority(events);

      // Must NOT be collapsed together across different businesses
      expect(collapsed).toHaveLength(2);
      const b1 = collapsed.find((e) => e.businessId === mockBusinessId);
      const b2 = collapsed.find((e) => e.businessId === mockBusinessId2);
      expect(b1?.type).toBe("HANDOFF");
      expect(b1?.metadata).toEqual({ tenant: "business-1" });
      expect(b2?.type).toBe("HOT_LEAD");
      expect(b2?.metadata).toEqual({ tenant: "business-2" });
    });

    it("Leaves independent events for different entities uncollapsed", () => {
      const events: NotificationEvent[] = [
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: "conv-1",
        },
        {
          businessId: mockBusinessId,
          type: "HANDOFF",
          entityId: "conv-2",
        },
      ];

      const collapsed = dispatcherService.collapsePriority(events);
      expect(collapsed).toHaveLength(2);
    });

    it("Collapses repeated hot-lead events for the same entity into a single notification (FR-NOTIF-013)", () => {
      const events: NotificationEvent[] = [
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          title: "Hot Lead Step 1",
          metadata: { score: 75, signal: "price_inquiry" },
        },
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          title: "Hot Lead Step 2",
          metadata: { score: 92, signal: "checkout_intent" },
        },
      ];

      const collapsed = dispatcherService.collapsePriority(events);
      expect(collapsed).toHaveLength(1);
      expect(collapsed[0]?.type).toBe("HOT_LEAD");
      expect(collapsed[0]?.metadata).toEqual({
        score: 92,
        signal: "checkout_intent",
      });
    });

    it("Retains other event types when handoff and hot lead are collapsed together", () => {
      const events: NotificationEvent[] = [
        {
          businessId: mockBusinessId,
          type: "HOT_LEAD",
          entityId: mockConversationId,
          metadata: { score: 85 },
        },
        {
          businessId: mockBusinessId,
          type: "HANDOFF_REQUIRED",
          entityId: mockConversationId,
          metadata: { reason: "low_confidence" },
        },
        {
          businessId: mockBusinessId,
          type: "ORDER_REQUEST",
          entityId: mockConversationId,
          metadata: { orderId: "order-123" },
        },
      ];

      const collapsed = dispatcherService.collapsePriority(events);
      expect(collapsed).toHaveLength(2);
      expect(collapsed.find((e) => e.type === "HANDOFF_REQUIRED")).toBeDefined();
      expect(collapsed.find((e) => e.type === "ORDER_REQUEST")).toBeDefined();
    });
  });

  describe("4. BullMQ Processor & Tenant Fan-Out (NotificationsProcessor)", () => {
    it("Handoff Alert: Creates notification row for all tenant members when handoff is triggered", async () => {
      const jobData: NotificationJobData = {
        businessId: mockBusinessId,
        type: "HANDOFF",
        handoffPriority: "critical",
        title: "Urgent: Customer Escalation",
        message: "Customer requested live agent immediately.",
        entityType: "conversation",
        entityId: mockConversationId,
        dedupeKey: `handoff:${mockConversationId}:2026-09-02T10`,
      };

      const mockJob = {
        id: "job-1",
        data: jobData,
      } as Job<NotificationJobData>;

      const result = await processor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(2);
      expect(result.recipientCount).toBe(2);

      // Verify DB query filtered by tenant ID and removed_at is null
      expect(mockPrisma.businessMember.findMany).toHaveBeenCalledWith({
        where: {
          business_id: mockBusinessId,
          removed_at: null,
        },
        select: {
          user_id: true,
        },
      });

      // Verify DB insertions for both members
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: mockBusinessId,
          user_id: "user-owner-1",
          type: "HANDOFF",
          handoff_priority: "critical",
          dedupe_key: jobData.dedupeKey,
        }),
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: mockBusinessId,
          user_id: "user-admin-2",
          type: "HANDOFF",
          handoff_priority: "critical",
          dedupe_key: jobData.dedupeKey,
        }),
      });

      // Realtime event emission
      expect(mockRealtimeService.emitNotificationNew).toHaveBeenCalledTimes(2);
      expect(mockRealtimeService.emitNotificationNew).toHaveBeenCalledWith(
        mockBusinessId,
        "user-owner-1",
        expect.anything(),
      );
      expect(mockRealtimeService.emitNotificationNew).toHaveBeenCalledWith(
        mockBusinessId,
        "user-admin-2",
        expect.anything(),
      );
    });

    it("Fans out only to targetUserIds when explicitly provided", async () => {
      const jobData: NotificationJobData = {
        businessId: mockBusinessId,
        type: "ORDER_REQUEST",
        handoffPriority: "high",
        title: "New Order Request",
        message: "Order ready for confirmation",
        entityType: "order",
        entityId: mockOrderId,
        dedupeKey: `order_request:${mockOrderId}:2026-09-02T10`,
        targetUserIds: ["user-specific-99"],
      };

      const mockJob = {
        id: "job-2",
        data: jobData,
      } as Job<NotificationJobData>;

      const result = await processor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);
      expect(mockPrisma.businessMember.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: "user-specific-99",
          type: "ORDER_REQUEST",
        }),
      });
    });

    it("Deduplicates targetUserIds when duplicate IDs are provided", async () => {
      const jobData: NotificationJobData = {
        businessId: mockBusinessId,
        type: "ORDER_REQUEST",
        title: "New Order",
        message: "Order ready",
        entityId: mockOrderId,
        dedupeKey: `order_request:${mockOrderId}:2026-09-02T10`,
        targetUserIds: ["user-dup", "user-dup"],
      };

      const mockJob = {
        id: "job-dup",
        data: jobData,
      } as Job<NotificationJobData>;

      const result = await processor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it("Safely ignores P2002 unique constraint conflicts without throwing", async () => {
      mockPrisma.notification.create.mockRejectedValueOnce({
        code: "P2002",
        message: "Unique constraint failed on the fields: (`user_id`,`dedupe_key`)",
      });

      const jobData: NotificationJobData = {
        businessId: mockBusinessId,
        type: "HANDOFF",
        title: "Test",
        message: "Test",
        entityId: mockConversationId,
        dedupeKey: `handoff:${mockConversationId}:2026-09-02T10`,
        targetUserIds: ["user-1", "user-2"],
      };

      const mockJob = {
        id: "job-3",
        data: jobData,
      } as Job<NotificationJobData>;

      const result = await processor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);
      expect(result.skippedDuplicates).toBe(1);
    });

    it("Throws error if businessId is missing to enforce tenant isolation", async () => {
      const jobData: any = {
        type: "HANDOFF",
        title: "Test",
        message: "Test",
        entityId: mockConversationId,
        dedupeKey: "key-1",
      };

      const mockJob = {
        id: "job-4",
        data: jobData,
      } as Job<NotificationJobData>;

      await expect(processor.processJob(mockJob)).rejects.toThrow(
        "missing businessId (tenant isolation invariant)",
      );
    });

    it("Handles zero recipients gracefully without creating notifications", async () => {
      mockPrisma.businessMember.findMany.mockResolvedValueOnce([]);

      const jobData: NotificationJobData = {
        businessId: mockBusinessId,
        type: "HANDOFF",
        title: "Test",
        message: "Test",
        entityId: mockConversationId,
        dedupeKey: "key-empty",
      };

      const mockJob = {
        id: "job-5",
        data: jobData,
      } as Job<NotificationJobData>;

      const result = await processor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(0);
      expect(result.recipientCount).toBe(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("5. Lifecycle cleanup", () => {
    it("Cleans up resources cleanly on module destroy", async () => {
      await expect(processor.onModuleDestroy()).resolves.not.toThrow();
      await expect(dispatcherService.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
