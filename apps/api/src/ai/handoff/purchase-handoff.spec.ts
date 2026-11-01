import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma, type PrismaClient } from "@prisma/client";

import { OrdersService } from "../../orders/core/orders.service";
import { BriefingGeneratorService } from "./briefing-generator.service";
import { HandoffService } from "./handoff.service";
import {
  PurchaseHandoffService,
  doOrderItemsMatchIntent,
  type PurchaseIntentData,
} from "./purchase-handoff.service";

describe("Purchase intent handoff & order draft flow (T-HAND-02)", () => {
  let purchaseHandoffService: PurchaseHandoffService;

  const mockBusinessId = "55555555-6666-4555-a555-555555555555";
  const mockConversationId = "11111111-1111-4111-a111-111111111111";
  const mockCustomerId = "44444444-5555-4444-a444-444444444444";
  const mockVariantId1 = "11111111-2222-4111-a111-111111111111";
  const mockVariantId2 = "22222222-3333-4222-a222-222222222222";
  const mockProductId1 = "66666666-1111-4666-a666-111111111111";
  const mockProductId2 = "77777777-2222-4777-a777-222222222222";
  const mockOrderId = "33333333-4444-4333-a333-333333333333";

  const mockCustomer = {
    id: mockCustomerId,
    business_id: mockBusinessId,
    name: "Aymen",
    phone: "+21699999999",
    channel: "instagram",
    lifecycle_stage: "interested",
    address: null,
    is_test: false,
    confirmed_order_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockConversation = {
    id: mockConversationId,
    business_id: mockBusinessId,
    customer_id: mockCustomerId,
    channel_account_id: null,
    source: "instagram",
    status: "ORDER_INTENT_DETECTED",
    ai_enabled: true,
    last_intent: "purchase_intent",
    last_message_preview: "nheb nechri el hoodie noir M",
    is_test: false,
    customer: mockCustomer,
    channel_account: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockVariant1 = {
    id: mockVariantId1,
    business_id: mockBusinessId,
    product_id: mockProductId1,
    sku: "HOODIE-BLK-M",
    price: new Prisma.Decimal("120.000"),
    discount_price: null,
    stock: 10,
    attributes: { size: "M", color: "Black" },
    product: {
      id: mockProductId1,
      name: "Black Hoodie",
    },
  };

  const mockVariant2 = {
    id: mockVariantId2,
    business_id: mockBusinessId,
    product_id: mockProductId2,
    sku: "CAP-NAVY",
    price: new Prisma.Decimal("35.000"),
    discount_price: null,
    stock: 2,
    attributes: { color: "Navy" },
    product: {
      id: mockProductId2,
      name: "Navy Cap",
    },
  };

  const mockCreatedOrderResponse = {
    id: mockOrderId,
    businessId: mockBusinessId,
    customerId: mockCustomerId,
    conversationId: mockConversationId,
    status: "PENDING_CONFIRMATION" as const,
    paymentStatus: "NOT_COMPLETED" as const,
    currency: "TND",
    subtotal: "120.000",
    deliveryFee: "7.000",
    total: "127.000",
    customerSnapshot: {
      name: "Aymen",
      phone: "+21699999999",
      address: { city: "Tunis", country: "TN" },
    },
    deliveryAddress: { city: "Tunis", country: "TN" },
    createdByType: "ai",
    createdByUserId: null,
    idempotencyKey: "test_key",
    isTest: false,
    orderConfirmedAt: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: "88888888-1111-4888-a888-111111111111",
        businessId: mockBusinessId,
        orderId: mockOrderId,
        variantId: mockVariantId1,
        quantity: 1,
        unitPrice: "120.000",
        nameSnapshot: "Black Hoodie (HOODIE-BLK-M)",
        skuSnapshot: "HOODIE-BLK-M",
        attributesSnapshot: { size: "M", color: "Black" },
        createdAt: new Date().toISOString(),
      },
    ],
  };

  interface MockPrisma {
    business: {
      findUnique: jest.Mock;
    };
    conversation: {
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    customer: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    productVariant: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    stockReservation: {
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    order: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };

    conversationStatusEvent: {
      create: jest.Mock;
    };
    conversationNote: {
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    aiAction: {
      create: jest.Mock;
    };
    aiDecisionTrace: {
      create: jest.Mock;
    };
    message: {
      findFirst: jest.Mock;
    };
    businessMember: {
      findMany: jest.Mock;
    };
    notification: {
      upsert: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  }

  const mockPrisma: MockPrisma = {
    business: {
      findUnique: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    productVariant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    stockReservation: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },

    conversationStatusEvent: {
      create: jest.fn(),
    },
    conversationNote: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    aiAction: {
      create: jest.fn(),
    },
    aiDecisionTrace: {
      create: jest.fn(),
    },
    message: {
      findFirst: jest.fn(),
    },
    businessMember: {
      findMany: jest.fn(),
    },
    notification: {
      upsert: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    }),
  };

  const mockRealtimeGateway = {
    emitToTenant: jest.fn(),
    emitToConversation: jest.fn(),
  };

  const mockOrdersService = {
    createOrder: jest.fn(),
    cancelOrder: jest.fn().mockResolvedValue({ id: mockOrderId, status: "CANCELLED" }),
    getOrder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.business.findUnique.mockResolvedValue({
      id: mockBusinessId,
      currency: "TND",
    });

    mockPrisma.conversation.findFirst.mockResolvedValue({
      ...mockConversation,
      customer: { ...mockCustomer },
    });
    mockPrisma.conversation.findFirstOrThrow.mockResolvedValue({
      ...mockConversation,
      customer: { ...mockCustomer },
    });
    mockPrisma.conversation.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...mockConversation,
          ...data,
        }),
    );
    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.customer.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...mockCustomer,
        ...data,
      }),
    );
    mockPrisma.conversationStatusEvent.create.mockResolvedValue({
      id: "99999999-eeee-4999-a999-eeeeeeeeeeee",
      business_id: mockBusinessId,
      conversation_id: mockConversationId,
      to_status: "HUMAN_REQUIRED",
    });
    mockPrisma.conversationNote.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "aaaaaaaa-nnnn-4aaa-aaaa-nnnnnnnnnnnn",
          ...data,
          created_at: new Date(),
        }),
    );
    mockPrisma.aiAction.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "bbbbbbbb-aaaa-4bbb-bbbb-aaaaaaaaaaaa",
        ...data,
        created_at: new Date(),
      }),
    );
    mockPrisma.businessMember.findMany.mockResolvedValue([
      { user_id: "admin-user-1" },
      { user_id: "admin-user-1" }, // duplicate test
    ]);
    mockPrisma.notification.upsert.mockResolvedValue({ id: "notif-1" });

    // Stock defaults
    mockPrisma.productVariant.findMany.mockResolvedValue([mockVariant1, mockVariant2]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.order.findMany.mockResolvedValue([]);

    // Orders service mock
    mockOrdersService.createOrder.mockResolvedValue(mockCreatedOrderResponse);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BriefingGeneratorService,
        {
          provide: HandoffService,
          useFactory: (bg: BriefingGeneratorService) =>
            new HandoffService(bg, mockPrisma as unknown as PrismaClient, mockRealtimeGateway),
          inject: [BriefingGeneratorService],
        },
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
        {
          provide: PurchaseHandoffService,
          useFactory: (bg: BriefingGeneratorService, hs: HandoffService, os: OrdersService) =>
            new PurchaseHandoffService(
              bg,
              hs,
              os,
              mockPrisma as unknown as PrismaClient,
              mockRealtimeGateway,
            ),
          inject: [BriefingGeneratorService, HandoffService, OrdersService],
        },
      ],
    }).compile();

    purchaseHandoffService = module.get<PurchaseHandoffService>(PurchaseHandoffService);
  });

  describe("1. Acceptance Criterion 1: Happy Purchase Flow", () => {
    it("Inbound purchase intent creates draft order, reserves stock, pauses AI, and generates staff briefing note", async () => {
      const intentData: PurchaseIntentData = {
        items: [{ variantId: mockVariantId1, quantity: 1 }],
        customer: {
          name: "Aymen Ben Amor",
          phone: "+21698765432",
          address: { city: "Tunis", country: "TN" },
        },
        deliveryAddress: { city: "Tunis", country: "TN" },
        deliveryFee: 7,
        currency: "TND",
        collectedFields: ["name", "phone", "address", "quantity"],
        confidence: 0.96,
        confidenceSource: "llm",
        lastMessage: "nheb nechri el black hoodie M adresse Tunis",
      };

      const result = await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        intentData,
        mockBusinessId,
      );

      // Verify overall result contract
      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error("Expected success result");
      }
      expect(result.stockAvailable).toBe(true);
      expect(result.handoffTriggered).toBe(true);
      expect(result.escalationReason).toBe("purchase_handoff");
      expect(result.priority).toBe("high");
      expect(result.order).toBeDefined();
      expect(result.order.id).toBe(mockOrderId);
      expect(result.order.status).toBe("PENDING_CONFIRMATION");
      expect(result.order.paymentStatus).toBe("NOT_COMPLETED");

      // Verify OrdersService was called to create order and reserve stock
      expect(mockOrdersService.createOrder).toHaveBeenCalledTimes(1);
      expect(mockOrdersService.createOrder).toHaveBeenCalledWith(
        mockBusinessId,
        null,
        expect.objectContaining({
          customerId: mockCustomerId,
          conversationId: mockConversationId,
          items: [{ variantId: mockVariantId1, quantity: 1 }],
          deliveryFee: 7,
          currency: "TND",
        }),
        "ai",
        expect.any(String),
        expect.anything(),
      );

      // Verify product_id in briefing is mapped to real product_id (mockProductId1), not variantId
      const productsDiscussed = result.briefing.products_discussed;
      expect(productsDiscussed.length).toBeGreaterThan(0);
      const firstProduct = productsDiscussed[0];
      expect(firstProduct).toBeDefined();
      if (firstProduct) {
        expect(firstProduct.product_id).toBe(mockProductId1);
        expect(firstProduct.variant_id).toBe(mockVariantId1);
      }

      // Verify customer record updated with collected fields
      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: {
          id_business_id: {
            id: mockCustomerId,
            business_id: mockBusinessId,
          },
        },
        data: expect.objectContaining({
          name: "Aymen Ben Amor",
          phone: "+21698765432",
          lifecycle_stage: "qualified_lead",
        }),
      });

      // Verify conversation transitioned to HUMAN_REQUIRED with ai_enabled = false
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: {
          id_business_id: {
            id: mockConversationId,
            business_id: mockBusinessId,
          },
        },
        data: expect.objectContaining({
          ai_enabled: false,
          status: "HUMAN_REQUIRED",
          escalation_reason: "purchase_handoff",
          handoff_priority: "high",
          handoff_context: expect.objectContaining({
            schema_version: 1,
            escalation_reason: "purchase_handoff",
            handoff_priority: "high",
            pending_order: {
              id: mockOrderId,
              amount: 127,
              currency: "TND",
              item_count: 1,
            },
            action_required: "Confirm payment and delivery; mark order CONFIRMED or CANCELLED",
          }),
        }),
      });

      // Verify ConversationStatusEvent created
      expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: mockBusinessId,
          conversation_id: mockConversationId,
          from_status: "ORDER_INTENT_DETECTED",
          to_status: "HUMAN_REQUIRED",
          escalation_reason: "purchase_handoff",
          actor_type: "ai",
        }),
      });

      // Verify ConversationNote (system briefing note) created
      expect(mockPrisma.conversationNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: mockBusinessId,
          conversation_id: mockConversationId,
          author_user_id: "system",
          body: expect.stringContaining("AI-to-Human Handoff Briefing"),
        }),
      });
      expect(result.note?.body).toContain(mockOrderId);
      expect(result.note?.body).toContain("Pending Order");

      // Verify in-app ORDER_REQUEST notification created for admins and deduplicated
      expect(mockPrisma.notification.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            business_id: mockBusinessId,
            type: "ORDER_REQUEST",
            handoff_priority: "high",
            title: "New Order Request",
            entity_type: "conversation",
            entity_id: mockConversationId,
          }),
        }),
      );

      // Verify realtime events emitted
      expect(mockRealtimeGateway.emitToTenant).toHaveBeenCalledWith(
        mockBusinessId,
        "conversation.handoff_triggered",
        expect.objectContaining({
          conversationId: mockConversationId,
          escalationReason: "purchase_handoff",
          priority: "high",
        }),
      );
      expect(mockRealtimeGateway.emitToTenant).toHaveBeenCalledWith(
        mockBusinessId,
        "order.created",
        mockCreatedOrderResponse,
      );
    });

    it("supports HandlePurchaseIntentParams object signature", async () => {
      const result = await purchaseHandoffService.handlePurchaseIntent({
        businessId: mockBusinessId,
        conversationId: mockConversationId,
        intentData: {
          items: [{ variantId: mockVariantId1, quantity: 2 }],
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error("Expected success result");
      }
      expect(result.order).toBeDefined();
    });

    it("preserves null confidence when confidence is missing", async () => {
      const result = await purchaseHandoffService.handlePurchaseIntent({
        businessId: mockBusinessId,
        conversationId: mockConversationId,
        intentData: {
          items: [{ variantId: mockVariantId1, quantity: 1 }],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.briefing.confidence).toBeNull();
        expect(result.briefing.confidence_source).toBeNull();
      }
    });
  });

  describe("2. Acceptance Criterion 2: Insufficient Stock Flow", () => {
    it("If stock is insufficient, triggers STOCK_OUTAGE handoff instead of drafting order", async () => {
      // Mock active reservations consuming available stock
      mockPrisma.stockReservation.findMany.mockResolvedValue([
        { variant_id: mockVariantId2, quantity: 2 }, // Variant 2 has stock=2, reserved=2 -> available=0
      ]);

      const intentData: PurchaseIntentData = {
        items: [{ variantId: mockVariantId2, quantity: 1 }], // requested 1, available 0
        lastMessage: "nheb nechri el cap navy",
      };

      const result = await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        intentData,
        mockBusinessId,
      );

      // Verify stock outage result contract
      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected stock outage result");
      }
      expect(result.stockAvailable).toBe(false);
      expect(result.handoffTriggered).toBe(true);
      expect(result.trigger).toBe("STOCK_OUTAGE");
      expect(result.escalationReason).toBe("inventory_conflict");
      expect(result.priority).toBe("high");
      expect(result.order).toBeNull();
      expect(result.stockError).toContain("Insufficient stock");

      // 🔒 Stock Hold Guarantee: Never create order if stock check fails
      expect(mockOrdersService.createOrder).not.toHaveBeenCalled();

      // Verify conversation transitioned to HUMAN_REQUIRED with STOCK_OUTAGE
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockConversationId,
          business_id: mockBusinessId,
          status: { not: "HUMAN_REQUIRED" },
        },
        data: expect.objectContaining({
          ai_enabled: false,
          status: "HUMAN_REQUIRED",
          escalation_reason: "inventory_conflict",
          handoff_priority: "high",
        }),
      });

      // Verify briefing note generated for STOCK_OUTAGE without pending order
      expect(result.briefing.pending_order).toBeNull();
      expect(result.briefing.action_required).toBe(
        "Resolve stock; customer may still want the original variant",
      );
    });

    it("Triggers STOCK_OUTAGE if requested quantity exceeds total variant catalog stock", async () => {
      const intentData: PurchaseIntentData = {
        items: [{ variantId: mockVariantId2, quantity: 99 }], // requested 99, stock is 2
      };

      const result = await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        intentData,
        mockBusinessId,
      );

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected stock outage result");
      }
      expect(result.stockAvailable).toBe(false);
      expect(result.trigger).toBe("STOCK_OUTAGE");
      expect(result.escalationReason).toBe("inventory_conflict");
      expect(mockOrdersService.createOrder).not.toHaveBeenCalled();
    });

    it("Catches concurrent stock reservation failure during order creation and falls back to STOCK_OUTAGE", async () => {
      // Pre-flight check passes, but during order creation another transaction took the stock
      mockOrdersService.createOrder.mockRejectedValueOnce(
        new BadRequestException({
          error: {
            code: "insufficient_stock",
            message: "Insufficient stock for variant HOODIE-BLK-M",
          },
        }),
      );

      const intentData: PurchaseIntentData = {
        items: [{ variantId: mockVariantId1, quantity: 1 }],
      };

      const result = await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        intentData,
        mockBusinessId,
      );

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected stock outage result");
      }
      expect(result.stockAvailable).toBe(false);
      expect(result.trigger).toBe("STOCK_OUTAGE");
      expect(result.escalationReason).toBe("inventory_conflict");
      expect(result.order).toBeNull();
    });
  });

  describe("3. Input Validation & Error Handling", () => {
    it("throws BadRequestException if businessId is missing", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [{ variantId: mockVariantId1, quantity: 1 }] },
          undefined as unknown as string,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if items array is empty", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [] },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if item variantId is not a valid UUID", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [{ variantId: "not-a-uuid", quantity: 1 }] },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if quantity is non-positive", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [{ variantId: mockVariantId1, quantity: 0 }] },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if deliveryAddress is invalid", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            deliveryAddress: { city: "" } as any, // invalid empty city
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if deliveryAddress and shippingAddress conflict", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            deliveryAddress: { city: "Tunis", country: "TN" },
            shippingAddress: { city: "Sousse", country: "TN" },
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if customer.id does not match conversation customer", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            customer: { id: "99999999-0000-4999-a999-000000000000" },
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException if conversation does not exist", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          "99999999-9999-4999-a999-999999999999",
          { items: [{ variantId: mockVariantId1, quantity: 1 }] },
          mockBusinessId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("falls back to STOCK_OUTAGE if requested variant does not exist in tenant catalog", async () => {
      mockPrisma.productVariant.findMany.mockResolvedValueOnce([]); // No variants found

      const result = await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        { items: [{ variantId: mockVariantId1, quantity: 1 }] },
        mockBusinessId,
      );

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected stock outage result");
      }
      expect(result.trigger).toBe("STOCK_OUTAGE");
      expect(mockOrdersService.createOrder).not.toHaveBeenCalled();
    });
    it("throws BadRequestException if items array contains duplicate variantId", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [
              { variantId: mockVariantId1, quantity: 1 },
              { variantId: mockVariantId1, quantity: 2 },
            ],
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if item quantity exceeds 1000", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [{ variantId: mockVariantId1, quantity: 1001 }] },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if decisionTraceId is not a valid UUID", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            decisionTraceId: "not-a-uuid",
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException on currency mismatch", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            currency: "USD", // Business is TND
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("preserves notes in briefing summary", async () => {
      const result = await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        {
          items: [{ variantId: mockVariantId1, quantity: 1 }],
          notes: "Please call before delivery",
        },
        mockBusinessId,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.briefing.summary).toContain("Please call before delivery");
      }
    });

    it("defaults confidenceSource to unknown when confidence is scored without explicit source", async () => {
      const result = await purchaseHandoffService.handlePurchaseIntent({
        businessId: mockBusinessId,
        conversationId: mockConversationId,
        intentData: {
          items: [{ variantId: mockVariantId1, quantity: 1 }],
          confidence: 0.88,
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.briefing.confidence).toBe(0.88);
        expect(result.briefing.confidence_source).toBe("unknown");
      }
    });

    it.each(["RESOLVED", "ORDER_CONFIRMED", "HUMAN_HANDLING"])(
      "throws BadRequestException if conversation is already in non-actionable status (%s)",
      async (status) => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({
          ...mockConversation,
          status,
          customer: { ...mockCustomer },
        });

        await expect(
          purchaseHandoffService.handlePurchaseIntent(
            mockConversationId,
            { items: [{ variantId: mockVariantId1, quantity: 1 }] },
            mockBusinessId,
          ),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it("idempotently returns existing draft order if conversation is already in HUMAN_REQUIRED with matching pending order", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...mockConversation,
        status: "HUMAN_REQUIRED",
        customer: { ...mockCustomer, name: "Fresh Name" },
      });

      mockOrdersService.getOrder.mockResolvedValueOnce({
        id: "12345678-order-4123-a123-123456789012",
        customerId: mockCustomerId,
        conversationId: mockConversationId,
        status: "PENDING_CONFIRMATION",
        paymentStatus: "NOT_PAID",
        currency: "TND",
        subtotal: "120.000",
        deliveryFee: "7.000",
        total: "127.000",
        customerSnapshot: { name: "Aymen Ben Amor" },
        deliveryAddress: { city: "Tunis" },
        createdByType: "ai",
        createdByUserId: null,
        isTest: false,
        orderConfirmedAt: null,
        cancelledAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        items: [
          {
            variantId: mockVariantId1,
            quantity: 1,
            unitPrice: "120.000",
            nameSnapshot: "Premium Hoodie",
            skuSnapshot: "HOODIE-BLK-M",
          },
        ],
      });

      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: "12345678-order-4123-a123-123456789012",
          business_id: mockBusinessId,
          customer_id: mockCustomerId,
          conversation_id: mockConversationId,
          status: "PENDING_CONFIRMATION",
          payment_status: "NOT_PAID",
          currency: "TND",
          subtotal: "120.000",
          delivery_fee: "7.000",
          total: "127.000",
          customer_snapshot: { name: "Aymen Ben Amor" },
          delivery_address: { city: "Tunis" },
          created_by_type: "ai",
          created_by_user_id: null,
          is_test: false,
          idempotency_key: "my_custom_key",
          items: [
            {
              id: "item-1",
              order_id: "12345678-order-4123-a123-123456789012",
              variant_id: mockVariantId1,
              quantity: 1,
              unit_price: "120.000",
              name_snapshot: "Premium Hoodie",
              sku_snapshot: "HOODIE-BLK-M",
            },
          ],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        {
          items: [{ variantId: mockVariantId1, quantity: 1 }],
          idempotencyKey: "my_custom_key",
        },
        mockBusinessId,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.order.id).toBe("12345678-order-4123-a123-123456789012");
        expect(result.escalationReason).toBe("purchase_handoff");
        expect(result.briefing.customer.name).toBe("Fresh Name");
      }
    });

    it("throws BadRequestException with order_intent_conflict if existing pending order has different items", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...mockConversation,
        status: "HUMAN_REQUIRED",
        customer: { ...mockCustomer },
      });

      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: "12345678-order-4123-a123-123456789012",
          business_id: mockBusinessId,
          customer_id: mockCustomerId,
          conversation_id: mockConversationId,
          status: "PENDING_CONFIRMATION",
          currency: "TND",
          idempotency_key: "my_custom_key",
          items: [
            {
              id: "item-1",
              variant_id: mockVariantId2, // Different variant!
              quantity: 1,
            },
          ],
        },
      ]);

      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            idempotencyKey: "my_custom_key",
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException with order_intent_conflict if existing pending order has different quantity", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...mockConversation,
        status: "HUMAN_REQUIRED",
        customer: { ...mockCustomer },
      });

      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: "12345678-order-4123-a123-123456789012",
          business_id: mockBusinessId,
          customer_id: mockCustomerId,
          conversation_id: mockConversationId,
          status: "PENDING_CONFIRMATION",
          currency: "TND",
          idempotency_key: "my_custom_key",
          items: [
            {
              id: "item-1",
              variant_id: mockVariantId1,
              quantity: 5, // Requested 1, but existing is 5!
            },
          ],
        },
      ]);

      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            idempotencyKey: "my_custom_key",
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException if businessId is omitted to prevent multi-tenant authorization bypass", async () => {
      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [{ variantId: mockVariantId1, quantity: 1 }] },
          "" as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws ConflictException (fail closed) if multiple active pending confirmation orders exist", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: mockConversationId,
        business_id: mockBusinessId,
        customer_id: mockCustomerId,
        status: "HUMAN_REQUIRED",
        source: "instagram",
        is_test: false,
        customer: {
          id: mockCustomerId,
          name: "John Doe",
          phone: "+21698111222",
          lifecycle_stage: "customer",
        },
      });

      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: "99999999-order-4999-a999-999999999991",
          business_id: mockBusinessId,
          conversation_id: mockConversationId,
          status: "PENDING_CONFIRMATION",
          idempotency_key: "key_1",
          items: [{ id: "item-1", variant_id: mockVariantId1, quantity: 1 }],
        },
        {
          id: "99999999-order-4999-a999-999999999992",
          business_id: mockBusinessId,
          conversation_id: mockConversationId,
          status: "PENDING_CONFIRMATION",
          idempotency_key: "key_2",
          items: [{ id: "item-2", variant_id: mockVariantId1, quantity: 1 }],
        },
      ]);

      try {
        await purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [{ variantId: mockVariantId1, quantity: 1 }] },
          mockBusinessId,
        );
        throw new Error("Should have thrown ConflictException");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const resp = (err as ConflictException).getResponse() as { error: { code: string } };
        expect(resp.error.code).toBe("ambiguous_pending_order");
      }
    });

    it("throws BadRequestException if an active pending order exists with a different idempotency key", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: mockConversationId,
        business_id: mockBusinessId,
        customer_id: mockCustomerId,
        status: "HUMAN_REQUIRED",
        source: "instagram",
        is_test: false,
        customer: {
          id: mockCustomerId,
          name: "John Doe",
          phone: "+21698111222",
          lifecycle_stage: "customer",
        },
      });

      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: "99999999-order-4999-a999-999999999999",
          business_id: mockBusinessId,
          conversation_id: mockConversationId,
          status: "PENDING_CONFIRMATION",
          idempotency_key: "different_idempotency_key",
          items: [
            {
              id: "item-1",
              variant_id: mockVariantId1,
              quantity: 1,
            },
          ],
        },
      ]);

      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          {
            items: [{ variantId: mockVariantId1, quantity: 1 }],
            idempotencyKey: "new_explicit_key",
          },
          mockBusinessId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("4. Multi-Tenant Isolation & Atomic Transaction Guarantee", () => {
    it("queries conversation strictly within the caller tenant businessId", async () => {
      await purchaseHandoffService.handlePurchaseIntent(
        mockConversationId,
        { items: [{ variantId: mockVariantId1, quantity: 1 }] },
        mockBusinessId,
      );

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: mockConversationId,
            business_id: mockBusinessId,
          }),
        }),
      );
    });

    it("executes all operations in a single atomic transaction and propagates transaction errors", async () => {
      mockPrisma.conversation.update.mockRejectedValueOnce(
        new Error("Database transaction deadlock"),
      );

      await expect(
        purchaseHandoffService.handlePurchaseIntent(
          mockConversationId,
          { items: [{ variantId: mockVariantId1, quantity: 1 }] },
          mockBusinessId,
        ),
      ).rejects.toThrow("Database transaction deadlock");

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("5. Pure helper: doOrderItemsMatchIntent", () => {
    it("matches items independent of array ordering", () => {
      const existing = [
        { variant_id: "var-1", quantity: 2 },
        { variant_id: "var-2", quantity: 1 },
      ];
      const requested = [
        { variantId: "var-2", quantity: 1 },
        { variantId: "var-1", quantity: 2 },
      ];
      expect(doOrderItemsMatchIntent(existing, requested)).toBe(true);
    });

    it("matches aggregated duplicate variants", () => {
      const existing = [{ variant_id: "var-1", quantity: 3 }];
      const requested = [
        { variantId: "var-1", quantity: 1 },
        { variantId: "var-1", quantity: 2 },
      ];
      expect(doOrderItemsMatchIntent(existing, requested)).toBe(true);
    });

    it("handles empty arrays correctly", () => {
      expect(doOrderItemsMatchIntent([], [])).toBe(true);
      expect(doOrderItemsMatchIntent([{ variant_id: "var-1", quantity: 1 }], [])).toBe(false);
      expect(doOrderItemsMatchIntent([], [{ variantId: "var-1", quantity: 1 }])).toBe(false);
    });

    it("rejects malformed inputs and non-integer/negative quantities", () => {
      expect(
        doOrderItemsMatchIntent(
          [{ variant_id: "var-1", quantity: -1 }],
          [{ variantId: "var-1", quantity: -1 }],
        ),
      ).toBe(false);
      expect(
        doOrderItemsMatchIntent(
          [{ variant_id: "var-1", quantity: 1.5 }],
          [{ variantId: "var-1", quantity: 1.5 }],
        ),
      ).toBe(false);
      expect(
        doOrderItemsMatchIntent(
          [{ variant_id: "", quantity: 1 }],
          [{ variantId: "", quantity: 1 }],
        ),
      ).toBe(false);
      expect(doOrderItemsMatchIntent(null as any, [] as any)).toBe(false);
    });
  });
});
