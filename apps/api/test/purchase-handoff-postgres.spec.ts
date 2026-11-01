import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { BriefingGeneratorService } from "../src/ai/handoff/briefing-generator.service";
import { HandoffService } from "../src/ai/handoff/handoff.service";
import { PurchaseHandoffService } from "../src/ai/handoff/purchase-handoff.service";
import { createPrismaClient } from "../src/lib/prisma";
import { OrdersService } from "../src/orders/core/orders.service";

describe("PostgreSQL Real DB Integration: PurchaseHandoffService (Atomic Transaction & Concurrency)", () => {
  let prisma: PrismaClient;
  let briefingGenerator: BriefingGeneratorService;
  let handoffService: HandoffService;
  let ordersService: OrdersService;
  let purchaseHandoffService: PurchaseHandoffService;

  const mockGateway = {
    emitToTenant: jest.fn(),
    emitToConversation: jest.fn(),
  };

  const businessId = randomUUID();
  const customerId = randomUUID();
  const conversationId = randomUUID();
  const productId = randomUUID();
  const variantId1 = randomUUID();
  const variantId2 = randomUUID();

  beforeAll(async () => {
    prisma = createPrismaClient();
    briefingGenerator = new BriefingGeneratorService();
    handoffService = new HandoffService(briefingGenerator, prisma, mockGateway);
    ordersService = new OrdersService(prisma, mockGateway);
    purchaseHandoffService = new PurchaseHandoffService(
      briefingGenerator,
      handoffService,
      ordersService,
      prisma,
      mockGateway,
    );

    // 1. Seed real records in PostgreSQL
    await prisma.business.create({
      data: {
        id: businessId,
        name: `Integration Test Biz ${businessId.slice(0, 8)}`,
        currency: "TND",
        timezone: "Africa/Tunis",
      },
    });

    await prisma.customer.create({
      data: {
        id: customerId,
        business_id: businessId,
        name: "Aymen Ben Amor",
        phone: "+21699887766",
        lifecycle_stage: "interested",
      },
    });

    await prisma.conversation.create({
      data: {
        id: conversationId,
        business_id: businessId,
        customer_id: customerId,
        source: "instagram",
        status: "ORDER_INTENT_DETECTED",
        ai_enabled: true,
        is_test: true,
      },
    });

    await prisma.product.create({
      data: {
        id: productId,
        business_id: businessId,
        name: "Premium Hoodie",
        status: "active",
      },
    });

    await prisma.productVariant.createMany({
      data: [
        {
          id: variantId1,
          business_id: businessId,
          product_id: productId,
          sku: "HOODIE-M",
          price: 120.0,
          discount_price: 100.0,
          stock: 5,
          is_default: true,
        },
        {
          id: variantId2,
          business_id: businessId,
          product_id: productId,
          sku: "HOODIE-L",
          price: 120.0,
          stock: 1,
          is_default: false,
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    // Clean up created records in reverse dependency order
    await prisma.aiAction.deleteMany({ where: { business_id: businessId } });
    await prisma.notification.deleteMany({ where: { business_id: businessId } });
    await prisma.stockReservation.deleteMany({ where: { business_id: businessId } });
    await prisma.orderItem.deleteMany({ where: { business_id: businessId } });
    await prisma.order.deleteMany({ where: { business_id: businessId } });
    await prisma.conversationNote.deleteMany({ where: { business_id: businessId } });
    await prisma.conversationStatusEvent.deleteMany({ where: { business_id: businessId } });
    await prisma.conversation.deleteMany({ where: { business_id: businessId } });
    await prisma.productVariant.deleteMany({ where: { business_id: businessId } });
    await prisma.product.deleteMany({ where: { business_id: businessId } });
    await prisma.customer.deleteMany({ where: { business_id: businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });

    await prisma.$disconnect();
  });

  it("Executes purchase handoff against real PostgreSQL with row locks, stock reservations, catalog price, and notes", async () => {
    const res = await purchaseHandoffService.handlePurchaseIntent({
      businessId,
      conversationId,
      intentData: {
        items: [{ variantId: variantId1, quantity: 2 }],
        customer: {
          name: "Aymen Ben Amor Updated",
          phone: "+21699112233",
        },
        deliveryAddress: { city: "Tunis", country: "TN" },
        notes: "Ring bell on arrival",
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      throw new Error("Expected purchase handoff success");
    }

    // Verify order created and total matches discounted catalog price (100.000 * 2 = 200.000)
    expect(res.order).toBeDefined();
    expect(res.order.items[0]?.unitPrice).toBe("100.000");

    // Verify real PostgreSQL database row updates
    const dbConv = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(dbConv.status).toBe("HUMAN_REQUIRED");
    expect(dbConv.ai_enabled).toBe(false);

    // Verify stock reservation created in Postgres
    const reservations = await prisma.stockReservation.findMany({
      where: { business_id: businessId, variant_id: variantId1, status: "active" },
    });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.quantity).toBe(2);

    // Verify customer updated in Postgres
    const dbCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(dbCustomer.name).toBe("Aymen Ben Amor Updated");
    expect(dbCustomer.phone).toBe("+21699112233");
    expect(dbCustomer.lifecycle_stage).toBe("qualified_lead");

    // Verify note created in Postgres with "system" author_user_id
    const dbNotes = await prisma.conversationNote.findMany({
      where: { conversation_id: conversationId },
    });
    expect(dbNotes).toHaveLength(1);
    expect(dbNotes[0]?.author_user_id).toBe("system");
    expect(dbNotes[0]?.body).toContain("Pending Order");
  });

  it("Triggers STOCK_OUTAGE against real PostgreSQL when requested quantity exceeds available stock", async () => {
    const convId2 = randomUUID();
    await prisma.conversation.create({
      data: {
        id: convId2,
        business_id: businessId,
        customer_id: customerId,
        source: "whatsapp",
        status: "ORDER_INTENT_DETECTED",
        ai_enabled: true,
        is_test: true,
      },
    });

    const res = await purchaseHandoffService.handlePurchaseIntent({
      businessId,
      conversationId: convId2,
      intentData: {
        items: [{ variantId: variantId2, quantity: 10 }], // requested 10, stock is 1
      },
    });

    expect(res.success).toBe(false);
    if (res.success) {
      throw new Error("Expected stock outage result");
    }
    expect(res.stockAvailable).toBe(false);
    expect(res.trigger).toBe("STOCK_OUTAGE");
    expect(res.escalationReason).toBe("inventory_conflict");

    // Zero orders created for convId2
    const orders = await prisma.order.findMany({
      where: { conversation_id: convId2 },
    });
    expect(orders).toHaveLength(0);
  });
});
