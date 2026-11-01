import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConversationStatus, OrderStatus, Prisma, type PrismaClient } from "@prisma/client";

import { PipelineCardSchema, PipelineQuerySchema, PipelineResponseSchema } from "@app/shared";

import { PERMISSIONS_KEY, RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { PipelineController } from "./pipeline.controller";
import { PipelineService } from "./pipeline.service";

/**
 * Automated TDD Test Suite for T-CONV-07 — Sales pipeline Kanban board API (`GET /pipeline`)
 */

describe("Sales pipeline Kanban board API (`GET /pipeline`) (T-CONV-07)", () => {
  let controller: PipelineController;
  let service: PipelineService;
  let prismaMock: {
    conversation: {
      findMany: jest.Mock;
    };
    order: {
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-4111-a111-111111111111";

  beforeEach(() => {
    prismaMock = {
      conversation: {
        findMany: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
      },
    };

    service = new PipelineService(prismaMock as unknown as PrismaClient);
    controller = new PipelineController(service);
  });

  describe("1. Permissions, Guards & RBAC", () => {
    it("enforces inbox.read permission metadata on getPipeline endpoint", () => {
      const handler = Reflect.get(PipelineController.prototype, "getPipeline") as object;
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler);
      expect(permissions).toEqual(["inbox.read"]);
    });

    it("PermissionsGuard: allows access when user role contains inbox.read", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const handler = () => undefined;
      RequirePermission("inbox.read")(handler);

      const reqWithPermission = {
        membership: {
          role: {
            name: "sales_rep",
            role_permissions: [{ permission: { code: "inbox.read" } }],
          },
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => reqWithPermission,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => PipelineController,
      } as any;

      expect(await guard.canActivate(context)).toBe(true);
    });

    it("PermissionsGuard: rejects with 403 Forbidden when user lacks inbox.read", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const handler = () => undefined;
      RequirePermission("inbox.read")(handler);

      const reqWithoutPermission = {
        membership: {
          role: {
            name: "limited_viewer",
            role_permissions: [{ permission: { code: "analytics.read" } }],
          },
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => reqWithoutPermission,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => PipelineController,
      } as any;

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("2. Tenancy & Parameter Validation", () => {
    it("enforces multi-tenancy by filtering all candidate conversation and order queries by businessId", async () => {
      prismaMock.conversation.findMany.mockResolvedValue([]);
      prismaMock.order.findMany.mockResolvedValue([]);

      await controller.getPipeline(businessId, {});

      expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: businessId,
            is_test: false,
            status: {
              in: [
                ConversationStatus.NEW,
                ConversationStatus.AI_ACTIVE,
                ConversationStatus.ORDER_INTENT_DETECTED,
                ConversationStatus.ORDER_CONFIRMED,
              ],
            },
          }),
        }),
      );

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: businessId,
            is_test: false,
            status: {
              in: [OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED, OrderStatus.COMPLETED],
            },
          }),
        }),
      );
    });

    it("rejects missing, empty, or non-UUID businessId with 400 Bad Request", async () => {
      await expect(service.getPipeline("")).rejects.toThrow(BadRequestException);
      await expect(service.getPipeline("   ")).rejects.toThrow(BadRequestException);
      await expect(service.getPipeline("invalid-not-a-uuid")).rejects.toThrow(BadRequestException);
      await expect(service.getPipeline(null as any)).rejects.toThrow(BadRequestException);
      await expect(service.getPipeline(undefined as any)).rejects.toThrow(BadRequestException);
    });

    it("validates limit parameter bounds and strictly rejects floats, negatives, and NaN", async () => {
      prismaMock.conversation.findMany.mockResolvedValue([]);
      prismaMock.order.findMany.mockResolvedValue([]);

      // Valid string integer limit
      await expect(
        controller.getPipeline(businessId, { limit: "25" as any }),
      ).resolves.toBeDefined();

      // Default when empty
      await expect(controller.getPipeline(businessId, {})).resolves.toBeDefined();

      // Rejects out of bounds
      await expect(controller.getPipeline(businessId, { limit: 0 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getPipeline(businessId, { limit: 101 })).rejects.toThrow(
        BadRequestException,
      );

      // Rejects non-integers / floats
      await expect(controller.getPipeline(businessId, { limit: 0.5 as any })).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getPipeline(businessId, { limit: "12.3" as any })).rejects.toThrow(
        BadRequestException,
      );

      // Rejects negatives
      await expect(controller.getPipeline(businessId, { limit: -10 })).rejects.toThrow(
        BadRequestException,
      );

      // Rejects non-numeric strings / NaN
      await expect(controller.getPipeline(businessId, { limit: "abc" as any })).rejects.toThrow(
        BadRequestException,
      );

      // Rejects unknown query properties via .strict()
      await expect(
        controller.getPipeline(businessId, { limit: 50, unknown: "param" } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("3. 4 Canonical Columns Projection & Financial Precision", () => {
    it("correctly maps conversations and orders into 4 pipeline columns with Decimal millimes precision", async () => {
      const mockConversations = [
        // new_leads (status NEW, warm, no order)
        {
          id: "conv-1",
          business_id: businessId,
          status: ConversationStatus.NEW,
          ai_enabled: true,
          lead_temperature: "warm",
          last_intent: "product_discovery",
          summary: "Looking for hoodies",
          handoff_context: null,
          last_message_at: new Date("2026-08-25T11:00:00Z"),
          updated_at: new Date("2026-08-25T11:00:00Z"),
          created_at: new Date("2026-08-25T10:00:00Z"),
          is_test: false,
          customer: { id: "cust-1", name: "Karim S.", phone: "+21698111222" },
        },
        // new_leads (status AI_ACTIVE, cold, no order)
        {
          id: "conv-2",
          business_id: businessId,
          status: ConversationStatus.AI_ACTIVE,
          ai_enabled: true,
          lead_temperature: "cold",
          last_intent: "price_inquiry",
          summary: "Asking for price",
          handoff_context: null,
          last_message_at: new Date("2026-08-25T10:30:00Z"),
          updated_at: new Date("2026-08-25T10:30:00Z"),
          created_at: new Date("2026-08-25T09:30:00Z"),
          is_test: false,
          customer: { id: "cust-2", name: "Leila M.", phone: "+21698222333" },
        },
        // qualified (ORDER_INTENT_DETECTED with handoff products_discussed)
        {
          id: "conv-3",
          business_id: businessId,
          status: ConversationStatus.ORDER_INTENT_DETECTED,
          ai_enabled: true,
          lead_temperature: "hot",
          last_intent: "order_intent",
          summary: "Wants to buy red dress",
          handoff_context: {
            products_discussed: [
              {
                product_id: "prod-1",
                variant_id: "var-1",
                name: "Robe Rouge",
                sku: "S",
                price: 85.0,
                currency: "TND",
              },
            ],
          },
          last_message_at: new Date("2026-08-25T11:30:00Z"),
          updated_at: new Date("2026-08-25T11:30:00Z"),
          created_at: new Date("2026-08-25T08:00:00Z"),
          is_test: false,
          customer: { id: "cust-3", name: "Sonia B.", phone: "+21698333444" },
        },
        // qualified (lead_temperature hot, still AI side)
        {
          id: "conv-4",
          business_id: businessId,
          status: ConversationStatus.AI_ACTIVE,
          ai_enabled: true,
          lead_temperature: "hot",
          last_intent: "availability_check",
          summary: "Checking sneaker sizes",
          handoff_context: {
            products_discussed: [
              {
                product_id: "prod-2",
                variant_id: "var-2",
                name: "Sneakers Blanches",
                sku: "42",
                price: 160.0,
                currency: "TND",
              },
            ],
          },
          last_message_at: new Date("2026-08-25T11:45:00Z"),
          updated_at: new Date("2026-08-25T11:45:00Z"),
          created_at: new Date("2026-08-25T08:30:00Z"),
          is_test: false,
          customer: { id: "cust-4", name: "Fatma K.", phone: "+21698444555" },
        },
        // Standalone ORDER_CONFIRMED conversation (no order record)
        {
          id: "conv-5",
          business_id: businessId,
          status: ConversationStatus.ORDER_CONFIRMED,
          ai_enabled: false,
          lead_temperature: "hot",
          last_intent: "order_confirmation",
          summary: "Confirmed phone order",
          handoff_context: {
            products_discussed: [
              {
                product_id: "prod-3",
                variant_id: "var-3",
                name: "T-Shirt Basique",
                sku: "L",
                price: 45.0,
                currency: "TND",
              },
            ],
          },
          last_message_at: new Date("2026-08-25T09:00:00Z"),
          updated_at: new Date("2026-08-25T09:00:00Z"),
          created_at: new Date("2026-08-25T07:00:00Z"),
          is_test: false,
          customer: { id: "cust-5", name: "Omar D.", phone: "+21698555666" },
        },
      ];

      const mockPendingOrders = [
        {
          id: "ord-1",
          business_id: businessId,
          conversation_id: "conv-99",
          customer_id: "cust-6",
          status: OrderStatus.PENDING_CONFIRMATION,
          total: new Prisma.Decimal("127.000"),
          customer_snapshot: { name: "Ahmed Ben Ali" },
          currency: "TND",
          is_test: false,
          created_at: new Date("2026-08-25T11:50:00Z"),
          updated_at: new Date("2026-08-25T11:50:00Z"),
          customer: { id: "cust-6", name: "Ahmed Ben Ali" },
          items: [
            {
              name_snapshot: "Hoodie Noir",
              sku_snapshot: "M",
              quantity: 1,
              unit_price: new Prisma.Decimal("127.000"),
            },
          ],
        },
        {
          id: "ord-2",
          business_id: businessId,
          conversation_id: null,
          customer_id: "cust-7",
          status: OrderStatus.PENDING_CONFIRMATION,
          total: new Prisma.Decimal("195.000"),
          customer_snapshot: { name: "Yassine K." },
          currency: "TND",
          is_test: false,
          created_at: new Date("2026-08-25T10:00:00Z"),
          updated_at: new Date("2026-08-25T10:00:00Z"),
          customer: { id: "cust-7", name: "Yassine K." },
          items: [
            {
              name_snapshot: "Sneakers Blanches",
              sku_snapshot: "42",
              quantity: 1,
              unit_price: new Prisma.Decimal("195.000"),
            },
          ],
        },
      ];

      const mockSoldOrders = [
        {
          id: "ord-3",
          business_id: businessId,
          conversation_id: "conv-100",
          customer_id: "cust-8",
          status: OrderStatus.CONFIRMED,
          total: new Prisma.Decimal("140.000"),
          customer_snapshot: { name: "Meriem F." },
          currency: "TND",
          is_test: false,
          order_confirmed_at: new Date("2026-08-25T09:30:00Z"),
          created_at: new Date("2026-08-25T09:00:00Z"),
          updated_at: new Date("2026-08-25T09:30:00Z"),
          customer: { id: "cust-8", name: "Meriem F." },
          items: [
            {
              name_snapshot: "Robe Fleurie",
              sku_snapshot: "S",
              quantity: 1,
              unit_price: new Prisma.Decimal("140.000"),
            },
          ],
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValue(mockConversations);
      prismaMock.order.findMany.mockResolvedValue([...mockPendingOrders, ...mockSoldOrders]);

      const result = await controller.getPipeline(businessId, {});

      expect(result.currency).toBe("TND");
      expect(result.columns).toBeDefined();

      // Column 1: new_leads (conv-1 and conv-2)
      expect(result.columns.new_leads.count).toBe(2);
      expect(result.columns.new_leads.totalValue).toBe(0);
      expect(result.columns.new_leads.cards).toHaveLength(2);
      expect(result.columns.new_leads.cards[0]?.customerName).toBe("Karim S.");
      expect(result.columns.new_leads.cards[0]?.temperature).toBe("warm");
      expect(result.columns.new_leads.cards[0]?.value).toBe(0);
      expect(result.columns.new_leads.cards[0]?.valueType).toBe("estimated");

      // Column 2: qualified (conv-3: 85DT=85000, conv-4: 160DT=160000 -> total 245000)
      expect(result.columns.qualified.count).toBe(2);
      expect(result.columns.qualified.totalValue).toBe(245000);
      expect(result.columns.qualified.cards).toHaveLength(2);
      expect(result.columns.qualified.cards[0]?.productSnapshot).toContain("Sneakers Blanches");
      expect(result.columns.qualified.cards[0]?.valueType).toBe("estimated");
      expect(result.columns.qualified.cards[1]?.productSnapshot).toContain("Robe Rouge");

      // Column 3: payment_pending (ord-1: 127DT=127000, ord-2: 195DT=195000 -> total 322000)
      expect(result.columns.payment_pending.count).toBe(2);
      expect(result.columns.payment_pending.totalValue).toBe(322000);
      expect(result.columns.payment_pending.cards).toHaveLength(2);
      expect(result.columns.payment_pending.cards[0]?.orderId).toBe("ord-1");
      expect(result.columns.payment_pending.cards[0]?.customerName).toBe("Ahmed Ben Ali");
      expect(result.columns.payment_pending.cards[0]?.productSnapshot).toBe("Hoodie Noir (M)");
      expect(result.columns.payment_pending.cards[0]?.valueType).toBe("actual");

      // Column 4: sold (ord-3: 140DT=140000 [actual] + standalone conv-5: 45DT=45000 [estimated] -> total 185000)
      expect(result.columns.sold.count).toBe(2);
      expect(result.columns.sold.totalValue).toBe(185000);
      expect(result.columns.sold.cards).toHaveLength(2);
      expect(result.columns.sold.cards[0]?.valueType).toBe("actual");
      expect(result.columns.sold.cards[1]?.valueType).toBe("estimated");
    });

    it("respects limit parameter for cards preview while maintaining accurate full aggregate counts and totals", async () => {
      const mockConversations = [
        {
          id: "conv-1",
          business_id: businessId,
          status: ConversationStatus.NEW,
          lead_temperature: "cold",
          last_intent: null,
          summary: null,
          handoff_context: null,
          last_message_at: new Date("2026-08-25T11:00:00Z"),
          updated_at: new Date("2026-08-25T11:00:00Z"),
          created_at: new Date("2026-08-25T10:00:00Z"),
          is_test: false,
          customer: { id: "cust-1", name: "User 1", phone: null },
        },
        {
          id: "conv-2",
          business_id: businessId,
          status: ConversationStatus.NEW,
          lead_temperature: "cold",
          last_intent: null,
          summary: null,
          handoff_context: null,
          last_message_at: new Date("2026-08-25T10:00:00Z"),
          updated_at: new Date("2026-08-25T10:00:00Z"),
          created_at: new Date("2026-08-25T09:00:00Z"),
          is_test: false,
          customer: { id: "cust-2", name: "User 2", phone: null },
        },
        {
          id: "conv-3",
          business_id: businessId,
          status: ConversationStatus.NEW,
          lead_temperature: "cold",
          last_intent: null,
          summary: null,
          handoff_context: null,
          last_message_at: new Date("2026-08-25T09:00:00Z"),
          updated_at: new Date("2026-08-25T09:00:00Z"),
          created_at: new Date("2026-08-25T08:00:00Z"),
          is_test: false,
          customer: { id: "cust-3", name: "User 3", phone: null },
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValue(mockConversations);
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await controller.getPipeline(businessId, { limit: 2 });

      expect(result.columns.new_leads.count).toBe(3);
      expect(result.columns.new_leads.cards).toHaveLength(2);
      expect(result.columns.new_leads.cards[0]?.customerName).toBe("User 1");
      expect(result.columns.new_leads.cards[1]?.customerName).toBe("User 2");
    });

    it("handles multiple sold orders for the same conversation as distinct order-oriented cards", async () => {
      const mockConversations = [
        {
          id: "conv-repeat",
          business_id: businessId,
          status: ConversationStatus.ORDER_CONFIRMED,
          lead_temperature: "hot",
          last_intent: null,
          summary: null,
          handoff_context: null,
          last_message_at: new Date("2026-08-25T12:00:00Z"),
          updated_at: new Date("2026-08-25T12:00:00Z"),
          created_at: new Date("2026-08-25T08:00:00Z"),
          is_test: false,
          customer: { id: "cust-1", name: "Repeat Buyer", phone: null },
        },
      ];

      const mockSoldOrders = [
        {
          id: "ord-sold-1",
          business_id: businessId,
          conversation_id: "conv-repeat",
          customer_id: "cust-1",
          status: OrderStatus.CONFIRMED,
          total: new Prisma.Decimal("100.000"),
          customer_snapshot: { name: "Repeat Buyer" },
          currency: "TND",
          is_test: false,
          order_confirmed_at: new Date("2026-08-25T10:00:00Z"),
          created_at: new Date("2026-08-25T09:00:00Z"),
          updated_at: new Date("2026-08-25T10:00:00Z"),
          customer: { id: "cust-1", name: "Repeat Buyer" },
          items: [],
        },
        {
          id: "ord-sold-2",
          business_id: businessId,
          conversation_id: "conv-repeat",
          customer_id: "cust-1",
          status: OrderStatus.COMPLETED,
          total: new Prisma.Decimal("250.000"),
          customer_snapshot: { name: "Repeat Buyer" },
          currency: "TND",
          is_test: false,
          order_confirmed_at: new Date("2026-08-25T11:00:00Z"),
          completed_at: new Date("2026-08-25T11:30:00Z"),
          created_at: new Date("2026-08-25T10:30:00Z"),
          updated_at: new Date("2026-08-25T11:30:00Z"),
          customer: { id: "cust-1", name: "Repeat Buyer" },
          items: [],
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValue(mockConversations);
      prismaMock.order.findMany.mockResolvedValue(mockSoldOrders);

      const result = await controller.getPipeline(businessId, {});

      // Two distinct sold order cards (total 350000 millimes), standalone conversation excluded from double counting
      expect(result.columns.sold.count).toBe(2);
      expect(result.columns.sold.totalValue).toBe(350000);
      expect(result.columns.sold.cards).toHaveLength(2);
      expect(result.columns.sold.cards[0]?.orderId).toBe("ord-sold-2");
      expect(result.columns.sold.cards[1]?.orderId).toBe("ord-sold-1");
    });

    it("correctly determines latest commercial activity chronology for sold orders with completed_at", async () => {
      const confirmedDate = new Date("2026-08-20T10:00:00Z");
      const completedDate = new Date("2026-08-25T15:00:00Z");

      const mockSoldOrders = [
        {
          id: "ord-chronology",
          business_id: businessId,
          conversation_id: null,
          customer_id: "cust-1",
          status: OrderStatus.COMPLETED,
          total: new Prisma.Decimal("80.000"),
          customer_snapshot: { name: "Ali" },
          currency: "TND",
          is_test: false,
          order_confirmed_at: confirmedDate,
          completed_at: completedDate,
          created_at: confirmedDate,
          updated_at: completedDate,
          customer: { id: "cust-1", name: "Ali" },
          items: [],
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValue([]);
      prismaMock.order.findMany.mockResolvedValue(mockSoldOrders);

      const result = await controller.getPipeline(businessId, {});

      expect(result.columns.sold.cards[0]?.lastActivityAt).toBe(completedDate.toISOString());
    });

    it("resolves lead temperature and lastActivityAt for orders linked to conversations in human handling", async () => {
      const orderConfirmedDate = new Date("2026-08-25T14:00:00Z");
      const convLastMessageDate = new Date("2026-08-25T14:30:00Z");

      const mockPendingOrder = [
        {
          id: "ord-human-conv",
          business_id: businessId,
          conversation_id: "conv-human-handling",
          customer_id: "cust-hh",
          status: OrderStatus.PENDING_CONFIRMATION,
          total: new Prisma.Decimal("150.000"),
          customer_snapshot: { name: "Human Handled Customer" },
          currency: "TND",
          is_test: false,
          created_at: orderConfirmedDate,
          updated_at: orderConfirmedDate,
          customer: { id: "cust-hh", name: "Human Handled Customer" },
          items: [],
        },
      ];

      const mockHumanConv = [
        {
          id: "conv-human-handling",
          business_id: businessId,
          status: ConversationStatus.HUMAN_HANDLING,
          ai_enabled: false,
          lead_temperature: "hot",
          last_intent: "escalated_order",
          summary: "Rep assisting with checkout",
          handoff_context: null,
          last_message_at: convLastMessageDate,
          updated_at: convLastMessageDate,
          created_at: new Date("2026-08-25T10:00:00Z"),
          is_test: false,
          customer: { id: "cust-hh", name: "Human Handled Customer", phone: "+21698111999" },
        },
      ];

      // Initial active candidate query returns empty (as HUMAN_HANDLING is excluded from candidate columns)
      prismaMock.conversation.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockHumanConv); // Extra query resolving linked conversation
      prismaMock.order.findMany.mockResolvedValue(mockPendingOrder);

      const result = await controller.getPipeline(businessId, {});

      expect(result.columns.payment_pending.cards).toHaveLength(1);
      const card = result.columns.payment_pending.cards[0];
      expect(card?.orderId).toBe("ord-human-conv");
      expect(card?.conversationId).toBe("conv-human-handling");
      expect(card?.temperature).toBe("hot");
      expect(card?.lastActivityAt).toBe(convLastMessageDate.toISOString());
    });
  });

  describe("4. Table-Driven Status & Condition Matrix", () => {
    interface MatrixCase {
      description: string;
      convStatus: ConversationStatus;
      temperature: "cold" | "warm" | "hot";
      aiEnabled: boolean;
      hasPendingOrder?: boolean;
      hasSoldOrder?: boolean;
      expectedColumn: "new_leads" | "qualified" | "sold" | "excluded";
    }

    const testCases: MatrixCase[] = [
      // NEW status cases
      {
        description: "NEW, cold, ai_enabled: true, no orders -> new_leads",
        convStatus: ConversationStatus.NEW,
        temperature: "cold",
        aiEnabled: true,
        expectedColumn: "new_leads",
      },
      {
        description: "NEW, warm, ai_enabled: true, no orders -> new_leads",
        convStatus: ConversationStatus.NEW,
        temperature: "warm",
        aiEnabled: true,
        expectedColumn: "new_leads",
      },
      {
        description: "NEW, hot, ai_enabled: true, no orders -> qualified",
        convStatus: ConversationStatus.NEW,
        temperature: "hot",
        aiEnabled: true,
        expectedColumn: "qualified",
      },
      {
        description: "NEW, hot, ai_enabled: false (handed off), no orders -> excluded",
        convStatus: ConversationStatus.NEW,
        temperature: "hot",
        aiEnabled: false,
        expectedColumn: "excluded",
      },
      // AI_ACTIVE status cases
      {
        description: "AI_ACTIVE, cold, ai_enabled: true, no orders -> new_leads",
        convStatus: ConversationStatus.AI_ACTIVE,
        temperature: "cold",
        aiEnabled: true,
        expectedColumn: "new_leads",
      },
      {
        description: "AI_ACTIVE, hot, ai_enabled: true, no orders -> qualified",
        convStatus: ConversationStatus.AI_ACTIVE,
        temperature: "hot",
        aiEnabled: true,
        expectedColumn: "qualified",
      },
      // ORDER_INTENT_DETECTED status cases
      {
        description: "ORDER_INTENT_DETECTED, warm, ai_enabled: true, no orders -> qualified",
        convStatus: ConversationStatus.ORDER_INTENT_DETECTED,
        temperature: "warm",
        aiEnabled: true,
        expectedColumn: "qualified",
      },
      {
        description:
          "ORDER_INTENT_DETECTED, cold, ai_enabled: false (e.g. human assisted), no orders -> qualified",
        convStatus: ConversationStatus.ORDER_INTENT_DETECTED,
        temperature: "cold",
        aiEnabled: false,
        expectedColumn: "qualified",
      },
      // ORDER_CONFIRMED standalone status cases
      {
        description: "ORDER_CONFIRMED, no orders linked -> sold",
        convStatus: ConversationStatus.ORDER_CONFIRMED,
        temperature: "hot",
        aiEnabled: false,
        expectedColumn: "sold",
      },
      {
        description:
          "ORDER_CONFIRMED, linked to pending order -> excluded from conv sold (handled via order)",
        convStatus: ConversationStatus.ORDER_CONFIRMED,
        temperature: "hot",
        aiEnabled: false,
        hasPendingOrder: true,
        expectedColumn: "excluded",
      },
      {
        description:
          "ORDER_CONFIRMED, linked to sold order -> excluded from conv sold (handled via order)",
        convStatus: ConversationStatus.ORDER_CONFIRMED,
        temperature: "hot",
        aiEnabled: false,
        hasSoldOrder: true,
        expectedColumn: "excluded",
      },
    ];

    for (const tc of testCases) {
      it(tc.description, async () => {
        const convId = "conv-matrix-test";
        const mockConv = {
          id: convId,
          business_id: businessId,
          status: tc.convStatus,
          ai_enabled: tc.aiEnabled,
          lead_temperature: tc.temperature,
          last_intent: "intent",
          summary: "summary",
          handoff_context: null,
          last_message_at: new Date("2026-08-25T12:00:00Z"),
          updated_at: new Date("2026-08-25T12:00:00Z"),
          created_at: new Date("2026-08-25T10:00:00Z"),
          is_test: false,
          customer: { id: "cust-matrix", name: "Matrix User", phone: null },
        };

        const pendingOrders = tc.hasPendingOrder
          ? [
              {
                id: "ord-pending-matrix",
                business_id: businessId,
                conversation_id: convId,
                customer_id: "cust-matrix",
                status: OrderStatus.PENDING_CONFIRMATION,
                total: new Prisma.Decimal("50.000"),
                customer_snapshot: {},
                currency: "TND",
                is_test: false,
                created_at: new Date("2026-08-25T12:00:00Z"),
                updated_at: new Date("2026-08-25T12:00:00Z"),
                customer: { id: "cust-matrix", name: "Matrix User" },
                items: [],
              },
            ]
          : [];

        const soldOrders = tc.hasSoldOrder
          ? [
              {
                id: "ord-sold-matrix",
                business_id: businessId,
                conversation_id: convId,
                customer_id: "cust-matrix",
                status: OrderStatus.CONFIRMED,
                total: new Prisma.Decimal("50.000"),
                customer_snapshot: {},
                currency: "TND",
                is_test: false,
                order_confirmed_at: new Date("2026-08-25T12:00:00Z"),
                created_at: new Date("2026-08-25T12:00:00Z"),
                updated_at: new Date("2026-08-25T12:00:00Z"),
                customer: { id: "cust-matrix", name: "Matrix User" },
                items: [],
              },
            ]
          : [];

        prismaMock.conversation.findMany.mockResolvedValue([mockConv]);
        prismaMock.order.findMany.mockResolvedValue([...pendingOrders, ...soldOrders]);

        const result = await controller.getPipeline(businessId, {});

        if (tc.expectedColumn === "new_leads") {
          expect(result.columns.new_leads.cards.some((c) => c.conversationId === convId)).toBe(
            true,
          );
        } else if (tc.expectedColumn === "qualified") {
          expect(result.columns.qualified.cards.some((c) => c.conversationId === convId)).toBe(
            true,
          );
        } else if (tc.expectedColumn === "sold") {
          expect(
            result.columns.sold.cards.some((c) => c.conversationId === convId && !c.orderId),
          ).toBe(true);
        } else {
          // Excluded from standalone conversation cards in new_leads, qualified, sold
          expect(result.columns.new_leads.cards.some((c) => c.conversationId === convId)).toBe(
            false,
          );
          expect(result.columns.qualified.cards.some((c) => c.conversationId === convId)).toBe(
            false,
          );
          expect(
            result.columns.sold.cards.some((c) => c.conversationId === convId && !c.orderId),
          ).toBe(false);
        }
      });
    }
  });

  describe("5. Deterministic Tie-Breaking & Sanitization", () => {
    it("applies deterministic tie-breaking sort order by domain key when lastActivityAt is identical", async () => {
      const timestamp = new Date("2026-08-25T12:00:00Z");
      const mockOrders = [
        {
          id: "ord-aaa",
          business_id: businessId,
          conversation_id: "conv-1",
          customer_id: "cust-1",
          status: OrderStatus.PENDING_CONFIRMATION,
          total: new Prisma.Decimal("50.000"),
          customer_snapshot: { name: "Alice" },
          currency: "TND",
          is_test: false,
          created_at: timestamp,
          updated_at: timestamp,
          customer: { id: "cust-1", name: "Alice" },
          items: [],
        },
        {
          id: "ord-zzz",
          business_id: businessId,
          conversation_id: "conv-2",
          customer_id: "cust-2",
          status: OrderStatus.PENDING_CONFIRMATION,
          total: new Prisma.Decimal("70.000"),
          customer_snapshot: { name: "Zoe" },
          currency: "TND",
          is_test: false,
          created_at: timestamp,
          updated_at: timestamp,
          customer: { id: "cust-2", name: "Zoe" },
          items: [],
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValue([]);
      prismaMock.order.findMany.mockResolvedValue(mockOrders);

      const result = await controller.getPipeline(businessId, {});

      expect(result.columns.payment_pending.cards).toHaveLength(2);
      expect(result.columns.payment_pending.cards[0]?.orderId).toBe("ord-zzz");
      expect(result.columns.payment_pending.cards[1]?.orderId).toBe("ord-aaa");
    });

    it("safely sanitizes malformed handoff_context and omits invalid items without phantom zero values", async () => {
      const malformedConvs = [
        {
          id: "conv-malformed-1",
          business_id: businessId,
          status: ConversationStatus.ORDER_INTENT_DETECTED,
          ai_enabled: true,
          lead_temperature: "hot",
          last_intent: "order_intent",
          summary: "Malformed items",
          handoff_context: {
            products_discussed: [
              null,
              "invalid_string",
              { name: "", price: 20 }, // Empty name omitted
              { name: "Valid Item", sku: "V1", price: 42.5 },
            ],
          },
          last_message_at: new Date("2026-08-25T11:30:00Z"),
          updated_at: new Date("2026-08-25T11:30:00Z"),
          created_at: new Date("2026-08-25T08:00:00Z"),
          is_test: false,
          customer: { id: "cust-m1", name: "Test User", phone: null },
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValue(malformedConvs);
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await controller.getPipeline(businessId, {});

      expect(result.columns.qualified.count).toBe(1);
      // Valid item: 42.5 * 1000 = 42500 millimes
      expect(result.columns.qualified.totalValue).toBe(42500);
      expect(result.columns.qualified.cards[0]?.productSnapshot).toBe("Valid Item (V1)");
      expect(result.columns.qualified.cards[0]?.value).toBe(42500);
      expect(result.columns.qualified.cards[0]?.valueType).toBe("estimated");
    });

    it("verifies pipeline output strictly passes PipelineResponseSchema runtime parse", async () => {
      prismaMock.conversation.findMany.mockResolvedValue([]);
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await controller.getPipeline(businessId, {});

      expect(() => PipelineResponseSchema.parse(result)).not.toThrow();
    });
  });

  describe("6. Shared Schemas & DTO Validation", () => {
    it("validates PipelineCardSchema requires conversationId or orderId", () => {
      // Valid with conversationId only
      expect(() =>
        PipelineCardSchema.parse({
          conversationId: "conv-1",
          orderId: null,
          value: 1000,
          valueType: "estimated",
        }),
      ).not.toThrow();

      // Valid with orderId only
      expect(() =>
        PipelineCardSchema.parse({
          conversationId: null,
          orderId: "ord-1",
          value: 2000,
          valueType: "actual",
        }),
      ).not.toThrow();

      // Invalid with neither
      expect(() =>
        PipelineCardSchema.parse({
          conversationId: null,
          orderId: null,
          value: 3000,
        }),
      ).toThrow();
    });

    it("validates PipelineQuerySchema enforces integer limit bounds and defaults to 50", () => {
      // Defaults to 50 when empty
      expect(PipelineQuerySchema.parse({})).toEqual({ limit: 50 });

      // Coerces valid string numeric inputs
      expect(PipelineQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 });

      // Rejects invalid strings
      expect(() => PipelineQuerySchema.parse({ limit: "not-a-number" })).toThrow();

      // Rejects out-of-bounds limits
      expect(() => PipelineQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => PipelineQuerySchema.parse({ limit: 101 })).toThrow();

      // Rejects floats
      expect(() => PipelineQuerySchema.parse({ limit: 1.5 })).toThrow();
      expect(() => PipelineQuerySchema.parse({ limit: "1.5" })).toThrow();
    });
  });
});
