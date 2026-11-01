import { BadRequestException, NotImplementedException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";

/**
 * Automated TDD Test Suite for T-CONV-01 — Conversations lifecycle, filtering & cursor pagination API (`/conversations`)
 */

describe("Conversations lifecycle, filtering & cursor pagination API (`/conversations`) (T-CONV-01)", () => {
  let controller: ConversationsController;
  let service: ConversationsService;
  let prismaMock: {
    conversation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    order: {
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-4111-a111-111111111111";
  const userId = "22222222-2222-4222-a222-222222222222";

  const makeConversation = (overrides: Partial<any> = {}) => ({
    id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    business_id: businessId,
    customer_id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    channel_account_id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
    source: "instagram",
    external_thread_id: "ext_123",
    status: "AI_ACTIVE",
    ai_enabled: true,
    assigned_user_id: null,
    last_intent: "pricing_query",
    escalation_reason: null,
    handoff_priority: null,
    handoff_context: null,
    handoff_at: null,
    handoff_completed_at: null,
    summary: "Customer asking for prices",
    collected_fields: null,
    snoozed_until: null,
    lead_score: 50,
    lead_temperature: "warm",
    lead_score_factors: null,
    lead_scored_at: new Date("2026-08-20T10:00:00Z"),
    last_message_at: new Date("2026-08-20T12:00:00Z"),
    last_message_preview: "Hello, how much is this?",
    staff_read_at: new Date("2026-08-20T12:05:00Z"),
    is_test: false,
    whatsapp_window_expires_at: null,
    created_at: new Date("2026-08-20T09:00:00Z"),
    updated_at: new Date("2026-08-20T12:00:00Z"),
    customer: {
      id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
      name: "John Doe",
      phone: "+21612345678",
    },
    channel_account: {
      id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
      channel: "instagram",
    },
    messages: [],
    ...overrides,
  });

  beforeEach(() => {
    prismaMock = {
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new ConversationsService(prismaMock as unknown as PrismaClient);
    controller = new ConversationsController(service);
  });

  it("Controller has @RequirePermission('inbox.read')", () => {
    const handler = Reflect.get(ConversationsController.prototype, "listConversations") as object;
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[];
    expect(permissions).toEqual(["inbox.read"]);
  });

  it("Priority Sort: Returns conversations ordered by descending `lead_score`.", async () => {
    const conv1 = makeConversation({
      id: "11111111-1111-4111-a111-000000000001",
      lead_score: 30,
      lead_temperature: "cold",
      status: "AI_ACTIVE",
      handoff_at: null,
    });
    const conv2 = makeConversation({
      id: "11111111-1111-4111-a111-000000000002",
      lead_score: 90,
      lead_temperature: "hot",
      status: "AI_ACTIVE",
      handoff_at: null,
    });
    const conv3 = makeConversation({
      id: "11111111-1111-4111-a111-000000000003",
      lead_score: 60,
      lead_temperature: "warm",
      status: "AI_ACTIVE",
      handoff_at: null,
    });
    const convHuman = makeConversation({
      id: "11111111-1111-4111-a111-000000000004",
      lead_score: 10,
      lead_temperature: "cold",
      status: "HUMAN_REQUIRED",
      handoff_priority: "critical",
      handoff_at: new Date("2026-08-20T08:00:00Z"),
    });

    prismaMock.conversation.findMany.mockResolvedValue([conv1, conv2, conv3, convHuman]);
    prismaMock.order.findMany.mockResolvedValue([]);

    const result = await controller.listConversations(
      businessId,
      { id: userId, sub: userId },
      { view: "all", sort: "sales_priority" },
    );

    // Escalation (human_needed) comes first, then hot lead (score 90), warm (60), cold (30)
    expect(result.items.map((i) => i.id)).toEqual([convHuman.id, conv2.id, conv3.id, conv1.id]);
  });

  it("Needs Me View: Filters to conversations requiring human action.", async () => {
    prismaMock.conversation.findMany.mockResolvedValue([]);

    await controller.listConversations(
      businessId,
      { id: userId, sub: userId },
      { view: "needs_me" },
    );

    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          is_test: false,
          OR: [
            { status: "HUMAN_REQUIRED" },
            { lead_temperature: "hot" },
            { messages: { some: { delivery_status: "draft" } } },
            { status: "HUMAN_HANDLING", assigned_user_id: userId },
          ],
        }),
      }),
    );
  });

  it("Cursor Pagination: Correctly traverses large datasets using cursor tokens.", async () => {
    const convA = makeConversation({
      id: "11111111-1111-4111-a111-00000000000a",
      lead_score: 80,
      lead_temperature: "hot",
    });
    const convB = makeConversation({
      id: "11111111-1111-4111-a111-00000000000b",
      lead_score: 70,
      lead_temperature: "warm",
    });
    const convC = makeConversation({
      id: "11111111-1111-4111-a111-00000000000c",
      lead_score: 60,
      lead_temperature: "warm",
    });

    prismaMock.conversation.findMany.mockResolvedValue([convA, convB, convC]);

    // Page 1 with limit = 2
    const page1 = await controller.listConversations(
      businessId,
      { id: userId, sub: userId },
      { view: "all", sort: "sales_priority", limit: 2 },
    );

    expect(page1.items.length).toBe(2);
    expect(page1.items.map((i) => i.id)).toEqual([convA.id, convB.id]);
    expect(page1.nextCursor).toBeDefined();

    // Page 2 using cursor
    const page2 = await controller.listConversations(
      businessId,
      { id: userId, sub: userId },
      { view: "all", sort: "sales_priority", limit: 2, cursor: page1.nextCursor },
    );

    expect(page2.items.length).toBe(1);
    expect(page2.items[0]?.id).toBe(convC.id);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("Test Isolation: Excludes playground test conversations.", async () => {
    prismaMock.conversation.findMany.mockResolvedValue([]);

    await controller.listConversations(businessId, { id: userId, sub: userId }, {});

    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          is_test: false,
        }),
      }),
    );
  });

  it("Status, channel, and assignee filters are passed to query", async () => {
    prismaMock.conversation.findMany.mockResolvedValue([]);

    // Test 'me' assignee and instagram channel
    await controller.listConversations(
      businessId,
      { id: userId, sub: userId },
      {
        channel: "instagram",
        assigned_to: "me",
        status: "NEW",
        temperature: "hot",
      },
    );

    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          assigned_user_id: userId,
          status: "NEW",
          lead_temperature: "hot",
        }),
      }),
    );
  });

  it("Pending order resolution attaches single and marks ambiguous pending orders", async () => {
    const conv1 = makeConversation({
      id: "11111111-1111-4111-a111-000000000001",
      lead_score: 90,
      lead_temperature: "hot",
    });
    const conv2 = makeConversation({
      id: "11111111-1111-4111-a111-000000000002",
      lead_score: 80,
      lead_temperature: "warm",
    });

    prismaMock.conversation.findMany.mockResolvedValue([conv1, conv2]);
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "oooooooo-oooo-4ooo-oooo-ooooooooooo1",
        conversation_id: conv1.id,
        status: "PENDING_CONFIRMATION",
        total: "120.500",
        currency: "TND",
        created_at: new Date("2026-08-20T10:00:00Z"),
      },
      {
        id: "oooooooo-oooo-4ooo-oooo-ooooooooooo2",
        conversation_id: conv2.id,
        status: "PENDING_CONFIRMATION",
        total: "50.000",
        currency: "TND",
        created_at: new Date("2026-08-20T09:00:00Z"),
      },
      {
        id: "oooooooo-oooo-4ooo-oooo-ooooooooooo3",
        conversation_id: conv2.id,
        status: "PENDING_CONFIRMATION",
        total: "80.000",
        currency: "TND",
        created_at: new Date("2026-08-20T10:00:00Z"),
      },
    ]);

    const result = await controller.listConversations(
      businessId,
      { id: userId, sub: userId },
      { view: "all" },
    );

    const item1 = result.items.find((i) => i.id === conv1.id);
    const item2 = result.items.find((i) => i.id === conv2.id);

    expect(item1?.pendingOrder).toEqual({
      id: "oooooooo-oooo-4ooo-oooo-ooooooooooo1",
      status: "PENDING_CONFIRMATION",
      total: "120.500",
      currency: "TND",
    });
    expect(item1?.pendingOrderAmbiguous).toBeUndefined();

    expect(item2?.pendingOrder).toEqual({
      id: "oooooooo-oooo-4ooo-oooo-ooooooooooo2",
      status: "PENDING_CONFIRMATION",
      total: "50.000",
      currency: "TND",
    });
    expect(item2?.pendingOrderAmbiguous).toBe(true);
  });

  it("Unread computation accurately marks conversations and calculates totalUnread", async () => {
    const unreadConv1 = makeConversation({
      id: "11111111-1111-4111-a111-000000000001",
      lead_score: 90,
      staff_read_at: null,
      last_message_at: new Date("2026-08-20T10:00:00Z"),
    });
    const unreadConv2 = makeConversation({
      id: "11111111-1111-4111-a111-000000000002",
      lead_score: 80,
      staff_read_at: new Date("2026-08-20T09:00:00Z"),
      last_message_at: new Date("2026-08-20T10:00:00Z"),
    });
    const readConv = makeConversation({
      id: "11111111-1111-4111-a111-000000000003",
      lead_score: 70,
      staff_read_at: new Date("2026-08-20T11:00:00Z"),
      last_message_at: new Date("2026-08-20T10:00:00Z"),
    });

    prismaMock.conversation.findMany
      .mockResolvedValueOnce([unreadConv1, unreadConv2, readConv])
      .mockResolvedValueOnce([
        { staff_read_at: null, last_message_at: new Date() },
        {
          staff_read_at: new Date("2026-08-20T09:00:00Z"),
          last_message_at: new Date("2026-08-20T10:00:00Z"),
        },
        {
          staff_read_at: new Date("2026-08-20T11:00:00Z"),
          last_message_at: new Date("2026-08-20T10:00:00Z"),
        },
      ]);

    const result = await controller.listConversations(
      businessId,
      { id: userId, sub: userId },
      { view: "all" },
    );

    const item1 = result.items.find((i) => i.id === unreadConv1.id);
    const item2 = result.items.find((i) => i.id === unreadConv2.id);
    const item3 = result.items.find((i) => i.id === readConv.id);

    expect(item1?.unread).toBe(true);
    expect(item2?.unread).toBe(true);
    expect(item3?.unread).toBe(false);
    expect(result.totalUnread).toBe(2);
  });

  it("Search query `q` throws 501 Not Implemented per FR-CONV-006", async () => {
    await expect(
      controller.listConversations(
        businessId,
        { id: userId, sub: userId },
        { q: "customer search term" },
      ),
    ).rejects.toThrow(NotImplementedException);
  });

  it("Invalid cursor token throws 400 Bad Request", async () => {
    await expect(
      controller.listConversations(
        businessId,
        { id: userId, sub: userId },
        { cursor: "not-a-valid-base64-or-json" },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
