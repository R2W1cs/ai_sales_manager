import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Notification } from "@prisma/client";

import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { TenantGuard } from "../../platform/security/tenant.guard";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

describe("NotificationsController & NotificationsService (T-NOTIF-02)", () => {
  let controller: NotificationsController;

  const mockTenantId = "11111111-1111-4111-8111-111111111111";
  const mockOtherTenantId = "99999999-9999-4999-8999-999999999999";
  const mockUserIdA = "user-a";
  const mockUserIdB = "user-b";

  let mockNotificationsStore: Notification[] = [];

  const mockPrisma = {
    notification: {
      count: jest.fn(
        ({ where }: { where: { business_id: string; user_id: string; read_at?: null } }) => {
          return Promise.resolve(
            mockNotificationsStore.filter(
              (n) =>
                n.business_id === where.business_id &&
                n.user_id === where.user_id &&
                (where.read_at === null ? n.read_at === null : true),
            ).length,
          );
        },
      ),
      findMany: jest.fn(
        ({ where }: { where: { business_id: string; user_id: string; read_at?: null } }) => {
          return Promise.resolve(
            mockNotificationsStore.filter(
              (n) =>
                n.business_id === where.business_id &&
                n.user_id === where.user_id &&
                (where.read_at === null ? n.read_at === null : true),
            ),
          );
        },
      ),
      findFirst: jest.fn(
        ({ where }: { where: { id: string; user_id: string; business_id: string } }) => {
          const found =
            mockNotificationsStore.find(
              (n) =>
                n.id === where.id &&
                n.user_id === where.user_id &&
                n.business_id === where.business_id,
            ) ?? null;
          return Promise.resolve(found);
        },
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: { read_at: Date } }) => {
        const item = mockNotificationsStore.find((n) => n.id === where.id);
        if (!item) return Promise.reject(new Error("Record not found"));
        item.read_at = data.read_at;
        return Promise.resolve(item);
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { business_id: string; user_id: string; read_at?: null };
          data: { read_at: Date };
        }) => {
          let count = 0;
          for (const item of mockNotificationsStore) {
            if (
              item.business_id === where.business_id &&
              item.user_id === where.user_id &&
              item.read_at === null
            ) {
              item.read_at = data.read_at;
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };

  const createMockNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: overrides.id ?? "22222222-2222-4222-8222-222222222222",
    business_id: overrides.business_id ?? mockTenantId,
    user_id: overrides.user_id ?? mockUserIdA,
    type: overrides.type ?? "HANDOFF",
    handoff_priority:
      overrides.handoff_priority !== undefined ? overrides.handoff_priority : "high",
    title: overrides.title ?? "Test Notification",
    message: overrides.message ?? "Test Message",
    entity_type: overrides.entity_type ?? "conversation",
    entity_id: overrides.entity_id ?? "33333333-3333-4333-8333-333333333333",
    dedupe_key: overrides.dedupe_key ?? "test-key-1",
    read_at: overrides.read_at ?? null,
    created_at: overrides.created_at ?? new Date("2026-08-28T10:00:00Z"),
  });

  beforeEach(async () => {
    mockNotificationsStore = [];
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: new NotificationsService(mockPrisma as unknown as never),
        },
      ],
    })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe("1. Notification Feed (GET /api/v1/notifications)", () => {
    it("Notification Feed: Returns unread count and recent notifications scoped to user and tenant.", async () => {
      // Setup: 2 unread for User A in Tenant 1, 1 read for User A, 1 for User B, 1 for Tenant 2
      mockNotificationsStore = [
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000001",
          user_id: mockUserIdA,
          business_id: mockTenantId,
          title: "User A Unread 1",
          read_at: null,
          created_at: new Date("2026-08-28T10:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000002",
          user_id: mockUserIdA,
          business_id: mockTenantId,
          title: "User A Unread 2",
          read_at: null,
          created_at: new Date("2026-08-28T11:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000003",
          user_id: mockUserIdA,
          business_id: mockTenantId,
          title: "User A Read",
          read_at: new Date("2026-08-28T09:00:00Z"),
          created_at: new Date("2026-08-28T08:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000004",
          user_id: mockUserIdB,
          business_id: mockTenantId,
          title: "User B Notification",
          read_at: null,
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000005",
          user_id: mockUserIdA,
          business_id: mockOtherTenantId,
          title: "Other Tenant Notification",
          read_at: null,
        }),
      ];

      const res = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        {},
      );

      expect(res.unreadCount).toBe(2);
      expect(res.items).toHaveLength(3);
      expect(res.items.map((i) => i.id)).toEqual([
        "10000000-0000-0000-0000-000000000002",
        "10000000-0000-0000-0000-000000000001",
        "10000000-0000-0000-0000-000000000003",
      ]);
      // Verify isolation: User B's notification and other tenant's notifications are not returned
      expect(res.items.some((i) => i.id === "10000000-0000-0000-0000-000000000004")).toBe(false);
      expect(res.items.some((i) => i.id === "10000000-0000-0000-0000-000000000005")).toBe(false);
    });

    it("Respects unread=true query filter", async () => {
      mockNotificationsStore = [
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000001",
          user_id: mockUserIdA,
          read_at: null,
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000002",
          user_id: mockUserIdA,
          read_at: new Date(),
        }),
      ];

      const res = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        { unread: true },
      );

      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.id).toBe("10000000-0000-0000-0000-000000000001");
    });

    it("Sorts by priority (critical > high > normal > null) then created_at DESC (FR-NOTIF-003)", async () => {
      mockNotificationsStore = [
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000001",
          handoff_priority: "normal",
          created_at: new Date("2026-08-28T12:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000002",
          handoff_priority: "critical",
          created_at: new Date("2026-08-28T10:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000003",
          handoff_priority: "high",
          created_at: new Date("2026-08-28T11:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000004",
          handoff_priority: "critical",
          created_at: new Date("2026-08-28T10:30:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000005",
          handoff_priority: null,
          created_at: new Date("2026-08-28T13:00:00Z"),
        }),
      ];

      const res = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        {},
      );

      // Expected order:
      // 1. Critical (10:30) -> id 4
      // 2. Critical (10:00) -> id 2
      // 3. High (11:00) -> id 3
      // 4. Normal (12:00) -> id 1
      // 5. Null priority (13:00) -> id 5
      expect(res.items.map((i) => i.id)).toEqual([
        "10000000-0000-0000-0000-000000000004",
        "10000000-0000-0000-0000-000000000002",
        "10000000-0000-0000-0000-000000000003",
        "10000000-0000-0000-0000-000000000001",
        "10000000-0000-0000-0000-000000000005",
      ]);
    });

    it("Supports cursor pagination and nextCursor computation", async () => {
      mockNotificationsStore = [
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000001",
          handoff_priority: "high",
          created_at: new Date("2026-08-28T12:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000002",
          handoff_priority: "high",
          created_at: new Date("2026-08-28T11:00:00Z"),
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000003",
          handoff_priority: "high",
          created_at: new Date("2026-08-28T10:00:00Z"),
        }),
      ];

      // Page 1: limit 2
      const page1 = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        { limit: 2 },
      );

      expect(page1.items).toHaveLength(2);
      expect(page1.items.map((i) => i.id)).toEqual([
        "10000000-0000-0000-0000-000000000001",
        "10000000-0000-0000-0000-000000000002",
      ]);
      expect(page1.nextCursor).toBeTruthy();

      // Page 2: with cursor from page 1
      const page2 = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        { limit: 2, cursor: page1.nextCursor ?? undefined },
      );

      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]?.id).toBe("10000000-0000-0000-0000-000000000003");
      expect(page2.nextCursor).toBeNull();
    });

    it("Throws BadRequestException for an invalid pagination cursor", async () => {
      await expect(
        controller.getNotifications(
          mockTenantId,
          { id: mockUserIdA, sub: mockUserIdA },
          { cursor: "invalid-non-existing-cursor" },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("2. Mark Read (PATCH /api/v1/notifications/:id/read)", () => {
    it("Mark Read: Decrements unread count upon marking read.", async () => {
      const targetId = "10000000-0000-0000-0000-000000000001";
      mockNotificationsStore = [
        createMockNotification({
          id: targetId,
          user_id: mockUserIdA,
          business_id: mockTenantId,
          read_at: null,
        }),
      ];

      // Initially unread count is 1
      const initialFeed = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        {},
      );
      expect(initialFeed.unreadCount).toBe(1);

      // Mark read
      await controller.markAsRead(targetId, mockTenantId, { id: mockUserIdA, sub: mockUserIdA });

      // Unread count is now 0
      const updatedFeed = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        {},
      );
      expect(updatedFeed.unreadCount).toBe(0);
      expect(mockNotificationsStore[0]?.read_at).toBeTruthy();
    });

    it("Per-User Mark Read: Marking a notification read updates read_at for that user only.", async () => {
      // User A and User B each have a notification row for the same event
      const notifAId = "10000000-0000-0000-0000-000000000001";
      const notifBId = "10000000-0000-0000-0000-000000000002";
      mockNotificationsStore = [
        createMockNotification({
          id: notifAId,
          user_id: mockUserIdA,
          business_id: mockTenantId,
          read_at: null,
        }),
        createMockNotification({
          id: notifBId,
          user_id: mockUserIdB,
          business_id: mockTenantId,
          read_at: null,
        }),
      ];

      // User A marks their notification read
      await controller.markAsRead(notifAId, mockTenantId, { id: mockUserIdA, sub: mockUserIdA });

      // User A sees 0 unread
      const feedA = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        {},
      );
      expect(feedA.unreadCount).toBe(0);

      // User B still has 1 unread notification (read_at is still null for User B)
      const feedB = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdB, sub: mockUserIdB },
        {},
      );
      expect(feedB.unreadCount).toBe(1);
      expect(mockNotificationsStore.find((n) => n.id === notifBId)?.read_at).toBeNull();
    });

    it("Throws NotFoundException when trying to mark read on non-existent or other user's notification", async () => {
      const foreignId = "10000000-0000-0000-0000-000000000099";
      mockNotificationsStore = [
        createMockNotification({
          id: foreignId,
          user_id: mockUserIdB,
          business_id: mockTenantId,
        }),
      ];

      await expect(
        controller.markAsRead(foreignId, mockTenantId, { id: mockUserIdA, sub: mockUserIdA }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("3. Read All (POST /api/v1/notifications/read-all)", () => {
    it("Read All: Clears unread count for calling user without impacting other tenant members.", async () => {
      mockNotificationsStore = [
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000001",
          user_id: mockUserIdA,
          business_id: mockTenantId,
          read_at: null,
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000002",
          user_id: mockUserIdA,
          business_id: mockTenantId,
          read_at: null,
        }),
        createMockNotification({
          id: "10000000-0000-0000-0000-000000000003",
          user_id: mockUserIdB,
          business_id: mockTenantId,
          read_at: null,
        }),
      ];

      await controller.markAllAsRead(mockTenantId, { id: mockUserIdA, sub: mockUserIdA });

      // User A unread count is 0
      const feedA = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdA, sub: mockUserIdA },
        {},
      );
      expect(feedA.unreadCount).toBe(0);

      // User B unread count remains 1
      const feedB = await controller.getNotifications(
        mockTenantId,
        { id: mockUserIdB, sub: mockUserIdB },
        {},
      );
      expect(feedB.unreadCount).toBe(1);
    });
  });

  describe("4. Auth Guards", () => {
    // Realtime push (notification.new) is emitted by NotificationsProcessor, not NotificationsService.
    // Coverage is in dispatcher/notifications.processor.spec.ts.
    it("Throws UnauthorizedException if user context is missing", async () => {
      await expect(controller.getNotifications(mockTenantId, undefined, {})).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(controller.markAsRead("some-id", mockTenantId, undefined)).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(controller.markAllAsRead(mockTenantId, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
