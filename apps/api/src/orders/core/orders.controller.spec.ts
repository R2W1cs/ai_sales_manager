import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

interface MockPrisma {
  order: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  orderItem: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  stockReservation: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  productVariant: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  inventoryMovement: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  customer: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  business: {
    findUnique: jest.Mock;
  };
  businessRule: {
    findFirst: jest.Mock;
  };
  aiSettings: {
    findUnique: jest.Mock;
  };
  conversation: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  conversationStatusEvent: {
    create: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
}

function createMockPrisma(): MockPrisma {
  const mock: MockPrisma = {
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    orderItem: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    stockReservation: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    productVariant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    business: {
      findUnique: jest.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        currency: "TND",
      }),
    },
    businessRule: {
      findFirst: jest.fn(),
    },
    aiSettings: {
      findUnique: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    conversationStatusEvent: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    // Returns 1 by default: conditional UPDATE WHERE stock >= qty affected 1 row (F5)
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: MockPrisma) => Promise<unknown>)(mock);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return Promise.resolve(arg);
    }),
  };
  return mock;
}

describe("Orders domain layer, lifecycle & stock reservation management (`/orders`) (T-ORD-01)", () => {
  let mockPrisma: MockPrisma;
  let service: OrdersService;
  let controller: OrdersController;
  let mockRealtimeGateway: {
    emitToTenant: jest.Mock;
    emitToConversation: jest.Mock;
  };

  const businessId = "11111111-1111-4111-8111-111111111111";
  const customerId = "33333333-3333-4333-8333-333333333333";
  const variantId = "44444444-4444-4444-8444-444444444444";
  const orderId = "55555555-5555-4555-8555-555555555555";
  const reservationId = "66666666-6666-4666-8666-666666666666";

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockRealtimeGateway = {
      emitToTenant: jest.fn(),
      emitToConversation: jest.fn(),
    };
    service = new OrdersService(
      mockPrisma as unknown as ConstructorParameters<typeof OrdersService>[0],
      mockRealtimeGateway,
    );
    controller = new OrdersController(service);
  });

  it("Create Draft: Creates order in PENDING_CONFIRMATION with 30-min stock hold.", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "John Doe",
      phone: "+21698111222",
      address: { line1: "Rue 1", city: "Tunis", country: "TN" },
      is_test: false,
    });
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: "12345678-1234-1234-1234-123456789012",
        sku: "SHIRT-M",
        price: new Prisma.Decimal("50.000"),
        discount_price: null,
        stock: 10,
        attributes: { size: "M" },
        product: { name: "Silk Shirt" },
      },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });
    mockPrisma.business.findUnique.mockResolvedValue({ currency: "TND" });
    mockPrisma.businessRule.findFirst.mockResolvedValue({
      payload: { fee: 7.0 },
    });

    const createdOrderDb = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("100.000"),
      delivery_fee: new Prisma.Decimal("7.000"),
      total: new Prisma.Decimal("107.000"),
      customer_snapshot: {
        name: "John Doe",
        phone: "+21698111222",
        address: { city: "Tunis", country: "TN" },
      },
      delivery_address: { city: "Tunis", country: "TN" },
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-key-1",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "12345678-1234-1234-1234-123456789013",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 2,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt (SHIRT-M)",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: { size: "M" },
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.create.mockResolvedValue(createdOrderDb);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(createdOrderDb);

    const result = await controller.createOrder(
      businessId,
      { id: "user-1", sub: "user-1", email: "rep@shop.tn", role: "employee" },
      {
        customerId,
        items: [{ variantId, quantity: 2 }],
        deliveryAddress: { city: "Tunis", country: "TN" },
        idempotencyKey: "idem-key-1",
      },
    );

    expect(result.status).toBe("PENDING_CONFIRMATION");
    expect(result.paymentStatus).toBe("NOT_COMPLETED");
    expect(result.subtotal).toBe("100.000");
    expect(result.deliveryFee).toBe("7.000");
    expect(result.total).toBe("107.000");

    // Verify stock reservation hold was created
    expect(mockPrisma.stockReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          business_id: businessId,
          variant_id: variantId,
          order_id: orderId,
          quantity: 2,
          status: "active",
        }),
      }),
    );
  });

  it("Idempotency: Replaying exact payload returns existing order; conflicting payload throws 409 Conflict.", async () => {
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("100.000"),
      delivery_fee: new Prisma.Decimal("7.000"),
      total: new Prisma.Decimal("107.000"),
      customer_snapshot: {
        name: "John Doe",
        phone: "+21698111222",
        address: { city: "Tunis", country: "TN" },
      },
      delivery_address: { city: "Tunis", country: "TN" },
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-replay",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "12345678-1234-1234-1234-123456789013",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 2,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt (SHIRT-M)",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: { size: "M" },
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.findUnique.mockResolvedValue(existingOrder);

    // Exact replay -> returns order
    const replayResult = await controller.createOrder(
      businessId,
      { id: "user-1", sub: "user-1" },
      {
        customerId,
        items: [{ variantId, quantity: 2 }],
        deliveryAddress: { city: "Tunis", country: "TN" },
        deliveryFee: 7.0,
        idempotencyKey: "idem-replay",
      },
    );
    expect(replayResult.id).toBe(orderId);

    // Conflicting replay with different customer -> throws 409
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          items: [{ variantId, quantity: 2 }],
          deliveryAddress: { city: "Tunis", country: "TN" },
          deliveryFee: 7.0,
          idempotencyKey: "idem-replay",
        },
      ),
    ).rejects.toThrow(ConflictException);

    // Conflicting replay with different quantity -> throws 409
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 5 }],
          deliveryAddress: { city: "Tunis", country: "TN" },
          deliveryFee: 7.0,
          idempotencyKey: "idem-replay",
        },
      ),
    ).rejects.toThrow(ConflictException);

    // Conflicting replay with different delivery address -> throws 409
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 2 }],
          deliveryAddress: { city: "Sfax", country: "TN" },
          deliveryFee: 7.0,
          idempotencyKey: "idem-replay",
        },
      ),
    ).rejects.toThrow(ConflictException);

    // Conflicting replay with different delivery fee -> throws 409
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 2 }],
          deliveryAddress: { city: "Tunis", country: "TN" },
          deliveryFee: 15.0,
          idempotencyKey: "idem-replay",
        },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("Mismatched header vs body idempotency keys throws 400 Bad Request.", async () => {
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 1 }],
          idempotencyKey: "key-in-body",
        },
        "key-in-header",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Duplicate variant items in payload: Consolidates requested quantity and checks cumulative stock.", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "Customer",
      phone: "+21698111222",
      is_test: false,
    });
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: "12345678-1234-1234-1234-123456789012",
        sku: "SHIRT-M",
        price: new Prisma.Decimal("50.000"),
        discount_price: null,
        stock: 5, // total stock is 5
        product: { name: "Silk Shirt" },
      },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });

    // Requesting 3 units + 3 units = 6 units (exceeds stock of 5)
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [
            { variantId, quantity: 3 },
            { variantId, quantity: 3 },
          ],
          idempotencyKey: "idem-dup-variant",
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Confirm Order: Deducts physical stock, commits reservation, sets status = CONFIRMED, audits conversation event.", async () => {
    const convId = "77777777-7777-7777-7777-777777777777";
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: convId,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("100.000"),
      delivery_fee: new Prisma.Decimal("7.000"),
      total: new Prisma.Decimal("107.000"),
      customer_snapshot: {
        name: "John Doe",
        phone: "+21698111222",
        address: { city: "Tunis", country: "TN" },
      },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-1",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "12345678-1234-1234-1234-123456789013",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 2,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: null,
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
    mockPrisma.stockReservation.findMany
      // First call: expire past-due reservations for this order (returns empty - none expired early)
      .mockResolvedValueOnce([
        {
          id: reservationId,
          variant_id: variantId,
          quantity: 2,
          status: "active",
        },
      ])
      // Second call: other reservations check
      .mockResolvedValueOnce([]);
    // updateMany for committing: return count matching the reservation list (F4)
    mockPrisma.stockReservation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.productVariant.findFirst.mockResolvedValue({
      id: variantId,
      stock: 10,
      sku: "SHIRT-M",
    });
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: convId,
      business_id: businessId,
      status: "AI_ACTIVE",
    });

    const confirmedOrderDb = {
      ...existingOrder,
      status: "CONFIRMED",
      payment_status: "COMPLETED",
      order_confirmed_at: new Date(),
    };
    mockPrisma.order.update.mockResolvedValue(confirmedOrderDb);

    const result = await controller.updateOrderStatus(businessId, orderId, {
      status: "CONFIRMED",
      paymentStatus: "COMPLETED",
    });

    expect(result.status).toBe("CONFIRMED");
    expect(result.paymentStatus).toBe("COMPLETED");

    // Check reservation committed with full invariant predicate (F4)
    expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [reservationId] },
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          status: "active",
        }),
        data: { status: "committed" },
      }),
    );

    // Check physical stock deducted via conditional raw UPDATE (F5)
    // The unconditional productVariant.update is now replaced by $executeRaw
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    // productVariant.update should NOT be called for stock decrement anymore
    expect(mockPrisma.productVariant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: expect.anything() } } }),
    );

    // Check customer stats updated with tenant compound key
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: {
        id_business_id: {
          id: customerId,
          business_id: businessId,
        },
      },
      data: expect.objectContaining({
        confirmed_order_count: { increment: 1 },
        lifecycle_stage: "customer",
      }),
    });

    // Check conversation updated and status event audited
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: {
        id_business_id: {
          id: convId,
          business_id: businessId,
        },
      },
      data: { status: "ORDER_CONFIRMED" },
    });

    expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        business_id: businessId,
        conversation_id: convId,
        from_status: "AI_ACTIVE",
        to_status: "ORDER_CONFIRMED",
      }),
    });
  });

  it("Cancel Order: Cancels order, releases active and committed reservations, restores stock and customer count if confirmed.", async () => {
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "CONFIRMED",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("100.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("100.000"),
      customer_snapshot: {
        name: "John Doe",
        phone: "+21698111222",
        address: { city: "Tunis", country: "TN" },
      },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-1",
      is_test: false,
      order_confirmed_at: new Date(),
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "12345678-1234-1234-1234-123456789013",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 2,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: null,
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.inventoryMovement.findMany.mockImplementation(
      (args: { where?: { reason?: string } }) => {
        if (args.where?.reason === "order_confirmed") {
          return Promise.resolve([{ variant_id: variantId, delta: -2 }]);
        }
        return Promise.resolve([]);
      },
    );
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      confirmed_order_count: 2,
    });
    const cancelledOrderDb = {
      ...existingOrder,
      status: "CANCELLED",
      cancelled_at: new Date(),
    };
    mockPrisma.order.update.mockResolvedValue(cancelledOrderDb);

    const result = await controller.updateOrderStatus(businessId, orderId, {
      status: "CANCELLED",
    });

    expect(result.status).toBe("CANCELLED");

    // Stock reservations released (both active and committed)
    expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalledWith({
      where: {
        business_id: businessId,
        order_id: orderId,
        status: { in: ["active", "committed"] },
      },
      data: {
        status: "released",
      },
    });

    // Stock restored with tenant compound key
    expect(mockPrisma.productVariant.update).toHaveBeenCalledWith({
      where: {
        id_business_id: {
          id: variantId,
          business_id: businessId,
        },
      },
      data: { stock: { increment: 2 } },
    });

    // Customer confirmed order count decremented and recomputed
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: {
        id_business_id: {
          id: customerId,
          business_id: businessId,
        },
      },
      data: {
        confirmed_order_count: 1,
        last_confirmed_order_at: null,
        lifecycle_stage: "customer",
      },
    });
  });

  it("Tenancy Isolation (404): Accessing an order not belonging to tenant returns 404 Not Found without leaking existence.", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);

    await expect(controller.getOrder(businessId, orderId)).rejects.toThrow(NotFoundException);
    await expect(
      controller.updateOrderStatus(businessId, orderId, { status: "CONFIRMED" }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.updateOrderStatus(businessId, orderId, { status: "CANCELLED" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("List Orders: Validates query, sorts with tie-breaker, maps P2025 to 400 Bad Request.", async () => {
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany.mockResolvedValue([]);

    const result = await controller.listOrders(businessId, {
      status: "PENDING_CONFIRMATION",
      limit: 10,
    });

    expect(result.items).toEqual([]);
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      }),
    );

    // Invalid status -> validation error
    await expect(
      controller.listOrders(businessId, {
        status: "INVALID_STATUS" as any,
      }),
    ).rejects.toThrow(BadRequestException);

    // Invalid date range (from > to) -> validation error
    await expect(
      controller.listOrders(businessId, {
        from: "2026-08-30T10:00:00Z",
        to: "2026-08-01T10:00:00Z",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("Rejects order creation when Idempotency-Key is missing.", async () => {
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 1 }],
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Confirm Order: Rejects confirmation if variant stock is insufficient.", async () => {
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("100.000"),
      delivery_fee: new Prisma.Decimal("7.000"),
      total: new Prisma.Decimal("107.000"),
      customer_snapshot: {
        name: "John Doe",
        phone: "+21698111222",
        address: { city: "Tunis", country: "TN" },
      },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-1",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "12345678-1234-1234-1234-123456789013",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 10,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: null,
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
    mockPrisma.stockReservation.findFirst.mockResolvedValue(null);
    mockPrisma.productVariant.findFirst.mockResolvedValue({
      id: variantId,
      stock: 2, // only 2 in stock, but 10 requested
      sku: "SHIRT-M",
    });

    await expect(
      controller.updateOrderStatus(businessId, orderId, { status: "CONFIRMED" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("Confirm Order: Rejects confirmation if order is not in PENDING_CONFIRMATION state.", async () => {
    const cancelledOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      status: "CANCELLED",
      payment_status: "NOT_COMPLETED",
      items: [],
    };
    mockPrisma.order.findFirst.mockResolvedValue(cancelledOrder);

    await expect(
      controller.updateOrderStatus(businessId, orderId, { status: "CONFIRMED" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("Cancel Order: Rejects cancellation if order is already COMPLETED.", async () => {
    const completedOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      status: "COMPLETED",
      payment_status: "COMPLETED",
      items: [],
    };
    mockPrisma.order.findFirst.mockResolvedValue(completedOrder);

    await expect(
      controller.updateOrderStatus(businessId, orderId, { status: "CANCELLED" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("Returns 404 for non-existent order.", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await expect(
      controller.getOrder(businessId, "99999999-9999-4999-8999-999999999999"),
    ).rejects.toThrow(NotFoundException);
  });

  it("Supports updateOrderStatus canonical PATCH endpoint.", async () => {
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "CONFIRMED",
      payment_status: "COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("100.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("100.000"),
      customer_snapshot: {
        name: "John Doe",
        phone: "+21698111222",
        address: { city: "Tunis", country: "TN" },
      },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-1",
      is_test: false,
      order_confirmed_at: new Date(),
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    };

    mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
    mockPrisma.order.update.mockResolvedValue({
      ...existingOrder,
      status: "COMPLETED",
      completed_at: new Date(),
    });

    const result = await controller.updateOrderStatus(businessId, orderId, {
      status: "COMPLETED",
    });

    expect(result.status).toBe("COMPLETED");
  });

  it("Rejects CreateOrder when currency does not match business configured currency.", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "John Doe",
      is_test: false,
    });
    mockPrisma.business.findUnique.mockResolvedValue({ currency: "TND" });

    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 1 }],
          currency: "USD",
          idempotencyKey: "idem-curr-mismatch",
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Rejects CreateOrder when deliveryAddress and shippingAddress conflict.", async () => {
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 1 }],
          deliveryAddress: { city: "Tunis", country: "TN" },
          shippingAddress: { city: "Sousse", country: "TN" },
          idempotencyKey: "idem-addr-conflict",
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("ListOrdersQuerySchema: Parses comma-separated status list and boolean flags.", async () => {
    mockPrisma.order.count.mockResolvedValue(2);
    mockPrisma.order.findMany.mockResolvedValue([]);

    const result = await controller.listOrders(businessId, {
      status: "PENDING_CONFIRMATION,CONFIRMED" as any,
      is_test: "false" as any,
      from: "2026-08-01",
      to: "2026-08-30",
      limit: 25,
    });

    expect(result.total).toBe(2);
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] },
          is_test: false,
        }),
      }),
    );
  });

  it("Confirm Order: Fails with reservation_expired and marks past-due active reservations as expired.", async () => {
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("50.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("50.000"),
      customer_snapshot: { name: "John Doe", phone: "+21698111222", address: null },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-expired-res",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "item-expired-1",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 1,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: null,
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.productVariant.findFirst.mockResolvedValue({
      id: variantId,
      stock: 5,
      sku: "SHIRT-M",
    });

    await expect(
      controller.updateOrderStatus(businessId, orderId, { status: "CONFIRMED" }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        business_id: businessId,
        order_id: orderId,
        status: "active",
      }),
      data: { status: "expired" },
    });
  });

  it("Cancel Order: Reverts customer lifecycle_stage to 'lead' when confirmed count reaches 0.", async () => {
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "CONFIRMED",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("50.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("50.000"),
      customer_snapshot: { name: "John Doe", phone: "+21698111222", address: null },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-lead-revert",
      is_test: false,
      order_confirmed_at: new Date(),
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "12345678-1234-1234-1234-123456789013",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 1,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: null,
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      confirmed_order_count: 1,
    });
    mockPrisma.order.update.mockResolvedValue({
      ...existingOrder,
      status: "CANCELLED",
      cancelled_at: new Date(),
    });

    await controller.updateOrderStatus(businessId, orderId, { status: "CANCELLED" });

    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: {
        id_business_id: {
          id: customerId,
          business_id: businessId,
        },
      },
      data: {
        confirmed_order_count: 0,
        last_confirmed_order_at: null,
        lifecycle_stage: "qualified_lead",
      },
    });
  });

  it("ListOrdersQuerySchema: Rejects unknown query keys and malformed UUIDs.", async () => {
    await expect(
      controller.listOrders(businessId, {
        unknown_key: "value",
      } as any),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.listOrders(businessId, {
        customerId: "not-a-uuid",
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("Accepts semantically equal deliveryAddress and shippingAddress with different key order.", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "John Doe",
      phone: "+21698111222",
      is_test: false,
    });
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: "12345678-1234-1234-1234-123456789012",
        sku: "SHIRT-M",
        price: new Prisma.Decimal("50.000"),
        discount_price: null,
        stock: 10,
        attributes: null,
        product: { name: "Silk Shirt" },
      },
    ]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });
    mockPrisma.business.findUnique.mockResolvedValue({ currency: "TND" });

    const createdOrderDb = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("50.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("50.000"),
      customer_snapshot: { name: "John Doe", phone: "+21698111222", address: null },
      delivery_address: { line1: "123 Rue A", city: "Tunis", country: "TN" },
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-semantic-addr",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    };
    mockPrisma.order.create.mockResolvedValue(createdOrderDb);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(createdOrderDb);

    const result = await controller.createOrder(
      businessId,
      { id: "user-1", sub: "user-1" },
      {
        customerId,
        items: [{ variantId, quantity: 1 }],
        deliveryAddress: { line1: "123 Rue A", city: "Tunis", country: "TN" },
        shippingAddress: { country: "TN", city: "Tunis", line1: "123 Rue A" },
        idempotencyKey: "idem-semantic-addr",
      },
    );

    expect(result.id).toBe(orderId);
  });

  it("Rejects deliveryFee when given NaN or Infinity or negative string.", async () => {
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 1 }],
          deliveryFee: Infinity as any,
          idempotencyKey: "idem-inf",
        },
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 1 }],
          deliveryFee: -5 as any,
          idempotencyKey: "idem-neg",
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Rejects invalid country string that is not a 2-letter ISO code.", async () => {
    await expect(
      controller.createOrder(
        businessId,
        { id: "user-1", sub: "user-1" },
        {
          customerId,
          items: [{ variantId, quantity: 1 }],
          deliveryAddress: { city: "Tunis", country: "TUNISIA" },
          idempotencyKey: "idem-country",
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Cancel Order: Preserves 'customer' lifecycle stage if customer has prior COMPLETED order.", async () => {
    const existingOrder = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: null,
      status: "CONFIRMED",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("50.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("50.000"),
      customer_snapshot: { name: "John Doe", phone: "+21698111222", address: null },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "idem-completed-keep",
      is_test: false,
      order_confirmed_at: new Date(),
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: "12345678-1234-1234-1234-123456789013",
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 1,
          unit_price: new Prisma.Decimal("50.000"),
          name_snapshot: "Silk Shirt",
          sku_snapshot: "SHIRT-M",
          attributes_snapshot: null,
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: "completed-order-id",
        order_confirmed_at: new Date("2026-08-01T10:00:00Z"),
        status: "COMPLETED",
      },
    ]);
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      confirmed_order_count: 2,
    });
    mockPrisma.order.update.mockResolvedValue({
      ...existingOrder,
      status: "CANCELLED",
      cancelled_at: new Date(),
    });

    await controller.updateOrderStatus(businessId, orderId, { status: "CANCELLED" });

    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: {
        id_business_id: {
          id: customerId,
          business_id: businessId,
        },
      },
      data: {
        confirmed_order_count: 1,
        last_confirmed_order_at: expect.any(Date),
        lifecycle_stage: "customer",
      },
    });
  });
});

describe("Orders query API, filtering & detail view (`GET /orders`) (T-ORD-03)", () => {
  let mockPrisma: MockPrisma;
  let service: OrdersService;
  let controller: OrdersController;

  const businessId = "11111111-1111-4111-8111-111111111111";
  const customerId = "33333333-3333-4333-8333-333333333333";
  const convId = "77777777-7777-4777-8777-777777777777";
  const order1Id = "55555555-5555-4555-8555-555555555551";
  const order2Id = "55555555-5555-4555-8555-555555555552";
  const order3Id = "55555555-5555-4555-8555-555555555553";

  const makeRawOrder = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    business_id: businessId,
    customer_id: customerId,
    conversation_id: convId,
    status: "CONFIRMED",
    payment_status: "NOT_COMPLETED",
    currency: "TND",
    subtotal: new Prisma.Decimal("50.000"),
    delivery_fee: new Prisma.Decimal("7.000"),
    total: new Prisma.Decimal("57.000"),
    customer_snapshot: {
      name: "Jane Doe",
      phone: "+21698765432",
      address: { city: "Tunis", country: "TN" },
    },
    delivery_address: { city: "Tunis", country: "TN" },
    created_by_type: "user",
    created_by_user_id: "user-1",
    idempotency_key: `idem-${id}`,
    is_test: false,
    order_confirmed_at: new Date("2026-08-15T12:00:00Z"),
    cancelled_at: null,
    completed_at: null,
    created_at: new Date("2026-08-15T10:00:00Z"),
    updated_at: new Date("2026-08-15T12:00:00Z"),
    items: [
      {
        id: `item-${id}`,
        business_id: businessId,
        order_id: id,
        variant_id: "44444444-4444-4444-8444-444444444444",
        quantity: 1,
        unit_price: new Prisma.Decimal("50.000"),
        name_snapshot: "Dress",
        sku_snapshot: "DR-01",
        attributes_snapshot: null,
        created_at: new Date("2026-08-15T10:00:00Z"),
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new OrdersService(
      mockPrisma as unknown as ConstructorParameters<typeof OrdersService>[0],
    );
    controller = new OrdersController(service);
  });

  it("Filter by Status: Correctly filters orders by CONFIRMED / PENDING.", async () => {
    const orderConfirmed = makeRawOrder(order1Id, { status: "CONFIRMED" });
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany.mockResolvedValue([orderConfirmed]);

    // Query single status
    const res = await controller.listOrders(businessId, { status: "CONFIRMED" });
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.status).toBe("CONFIRMED");
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          status: "CONFIRMED",
        }),
      }),
    );

    // Query multi-status comma-separated
    const orderPending = makeRawOrder(order2Id, { status: "PENDING_CONFIRMATION" });
    mockPrisma.order.count.mockResolvedValue(2);
    mockPrisma.order.findMany.mockResolvedValue([orderConfirmed, orderPending]);

    const multiRes = await controller.listOrders(businessId, {
      status: "CONFIRMED,PENDING_CONFIRMATION" as any,
    });
    expect(multiRes.total).toBe(2);
    expect(multiRes.items).toHaveLength(2);
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          status: { in: ["CONFIRMED", "PENDING_CONFIRMATION"] },
        }),
      }),
    );
  });

  it("Date Range Filter: Limits results within specified date range.", async () => {
    const order = makeRawOrder(order1Id, { created_at: new Date("2026-08-10T08:00:00Z") });
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany.mockResolvedValue([order]);

    // Date only strings
    const res = await controller.listOrders(businessId, {
      from: "2026-08-01",
      to: "2026-08-20",
    });

    expect(res.total).toBe(1);
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          created_at: {
            gte: new Date("2026-08-01T00:00:00.000Z"),
            lte: new Date("2026-08-20T23:59:59.999Z"),
          },
        }),
      }),
    );

    // ISO date strings with timestamp
    await controller.listOrders(businessId, {
      from: "2026-08-01T06:00:00Z",
      to: "2026-08-20T18:00:00Z",
    });

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          created_at: {
            gte: new Date("2026-08-01T06:00:00Z"),
            lte: new Date("2026-08-20T18:00:00Z"),
          },
        }),
      }),
    );
  });

  it("Filter by customerId, conversationId, createdBy, and isTest.", async () => {
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany.mockResolvedValue([makeRawOrder(order1Id)]);

    await controller.listOrders(businessId, {
      customerId,
      conversationId: convId,
      createdBy: "ai",
      isTest: false,
    });

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: businessId,
          customer_id: customerId,
          conversation_id: convId,
          created_by_type: "ai",
          is_test: false,
        }),
      }),
    );
  });

  it("Cursor Pagination: Handles take=limit+1, nextCursor calculation, and cursor navigation.", async () => {
    const o1 = makeRawOrder(order1Id);
    const o2 = makeRawOrder(order2Id);
    const o3 = makeRawOrder(order3Id);

    // Limit = 2, total = 3, returned = 3 items (more pages exist)
    mockPrisma.order.count.mockResolvedValue(3);
    mockPrisma.order.findMany.mockResolvedValue([o1, o2, o3]);

    const page1 = await controller.listOrders(businessId, { limit: 2 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]?.id).toBe(order1Id);
    expect(page1.items[1]?.id).toBe(order2Id);
    const nextCursor1 = page1.nextCursor;
    expect(nextCursor1).toBeDefined();
    if (!nextCursor1) {
      throw new Error("Expected nextCursor to be defined");
    }
    const decoded = JSON.parse(Buffer.from(nextCursor1, "base64url").toString("utf-8")) as {
      id: string;
      t: string;
    };
    expect(decoded.id).toBe(order2Id);
    expect(decoded.t).toBeDefined();

    // Second page with base64url cursor
    mockPrisma.order.findMany.mockResolvedValue([o3]);
    const page2 = await controller.listOrders(businessId, { limit: 2, cursor: nextCursor1 });
    expect(page2.total).toBe(3);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.id).toBe(order3Id);
    expect(page2.nextCursor).toBeNull();

    // Also supports direct UUID cursor fallback
    mockPrisma.order.findMany.mockResolvedValue([o3]);
    const pageDirect = await controller.listOrders(businessId, { limit: 2, cursor: order2Id });
    expect(pageDirect.items).toHaveLength(1);
  });

  it("Handles invalid cursor gracefully with 400 Bad Request.", async () => {
    mockPrisma.order.count.mockResolvedValue(10);
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Record to use in cursor not found",
      {
        code: "P2025",
        clientVersion: "5.0.0",
      },
    );
    mockPrisma.order.findMany.mockRejectedValue(prismaError);

    await expect(
      controller.listOrders(businessId, { cursor: "99999999-9999-4999-8999-999999999999" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("GET /orders/:id returns full order detail and respects tenant boundary.", async () => {
    const order = makeRawOrder(order1Id);
    mockPrisma.order.findFirst.mockResolvedValue(order);

    const res = await controller.getOrder(businessId, order1Id);
    expect(res.id).toBe(order1Id);
    expect(res.businessId).toBe(businessId);
    expect(res.total).toBe("57.000");
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.nameSnapshot).toBe("Dress");

    // Cross-tenant access check
    mockPrisma.order.findFirst.mockResolvedValue(null);

    await expect(controller.getOrder(businessId, order1Id)).rejects.toThrow(NotFoundException);
  });
});

describe("Manual order draft creation from inbox conversation drawer (T-ORD-04)", () => {
  let mockPrisma: MockPrisma;
  let service: OrdersService;
  let controller: OrdersController;
  let mockRealtimeGateway: {
    emitToTenant: jest.Mock;
    emitToConversation: jest.Mock;
  };

  const businessId = "11111111-1111-4111-8111-111111111111";
  const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const customerId = "33333333-3333-4333-8333-333333333333";
  const variantId = "44444444-4444-4444-8444-444444444444";
  const productId = "99999999-9999-4999-8999-999999999999";
  const itemId = "88888888-8888-4888-8888-888888888888";
  const orderId = "55555555-5555-4555-8555-555555555555";
  const reservationId = "66666666-6666-4666-8666-666666666666";
  const currentUser = {
    id: "user-1",
    sub: "user-1",
    email: "rep@shop.tn",
    role: "employee" as const,
  };

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockRealtimeGateway = {
      emitToTenant: jest.fn(),
      emitToConversation: jest.fn(),
    };
    service = new OrdersService(
      mockPrisma as unknown as ConstructorParameters<typeof OrdersService>[0],
      mockRealtimeGateway,
    );
    controller = new OrdersController(service);
  });

  it("Draft from Inbox: Creates draft order linked to conversation thread.", async () => {
    // 1. Setup conversation & customer in tenant
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      business_id: businessId,
      customer_id: customerId,
      is_test: false,
    });
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "Alice Smith",
      phone: "+21698765432",
      address: { city: "Sousse", country: "TN" },
      is_test: false,
    });
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: productId,
        sku: "JEANS-32",
        price: new Prisma.Decimal("80.000"),
        discount_price: null,
        stock: 5,
        attributes: { size: "32" },
        product: { name: "Slim Jeans" },
      },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });
    mockPrisma.business.findUnique.mockResolvedValue({ currency: "TND" });
    mockPrisma.businessRule.findFirst.mockResolvedValue({
      payload: { fee: 7.0 },
    });

    const createdDraftOrderDb = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: conversationId,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("80.000"),
      delivery_fee: new Prisma.Decimal("7.000"),
      total: new Prisma.Decimal("87.000"),
      customer_snapshot: {
        name: "Alice Smith",
        phone: "+21698765432",
        address: { city: "Sousse", country: "TN" },
      },
      delivery_address: { city: "Sousse", country: "TN" },
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "draft-idem-key-1",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: itemId,
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 1,
          unit_price: new Prisma.Decimal("80.000"),
          name_snapshot: "Slim Jeans (JEANS-32)",
          sku_snapshot: "JEANS-32",
          attributes_snapshot: { size: "32" },
          created_at: new Date(),
        },
      ],
    };

    mockPrisma.order.create.mockResolvedValue(createdDraftOrderDb);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(createdDraftOrderDb);

    const result = await controller.createDraftOrder(
      businessId,
      currentUser,
      conversationId,
      {
        items: [{ variantId, quantity: 1 }],
      },
      "draft-idem-key-1",
    );

    expect(result.id).toBe(orderId);
    expect(result.conversationId).toBe(conversationId);
    expect(result.customerId).toBe(customerId);
    expect(result.status).toBe("PENDING_CONFIRMATION");
    expect(result.total).toBe("87.000");
    expect(result.items).toHaveLength(1);

    // Verify stock reservation was created with active hold
    expect(mockPrisma.stockReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          business_id: businessId,
          order_id: orderId,
          conversation_id: conversationId,
          variant_id: variantId,
          quantity: 1,
          status: "active",
        }),
      }),
    );
  });

  it("Draft from Inbox: Allows explicit customerId matching conversation customer.", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      business_id: businessId,
      customer_id: customerId,
      is_test: false,
    });
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "Matching Customer",
      phone: "+21699999999",
      address: null,
      is_test: false,
    });
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: productId,
        sku: "JEANS-32",
        price: new Prisma.Decimal("80.000"),
        discount_price: null,
        stock: 5,
        attributes: null,
        product: { name: "Slim Jeans" },
      },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });
    mockPrisma.businessRule.findFirst.mockResolvedValue(null);

    const createdDraftDb = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: conversationId,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("80.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("80.000"),
      customer_snapshot: { name: "Matching Customer", phone: "+21699999999", address: null },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "draft-key-matching",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    };
    mockPrisma.order.create.mockResolvedValue(createdDraftDb);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(createdDraftDb);

    const res = await controller.createDraftOrder(
      businessId,
      currentUser,
      conversationId,
      {
        customerId,
        items: [{ variantId, quantity: 1 }],
      },
      "draft-key-matching",
    );

    expect(res.customerId).toBe(customerId);
  });

  it("Draft from Inbox: Rejects customer mismatch with 400 Bad Request.", async () => {
    const mismatchedCustomerId = "77777777-7777-4777-8777-777777777777";
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      business_id: businessId,
      customer_id: customerId,
      is_test: false,
    });

    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          customerId: mismatchedCustomerId,
          items: [{ variantId, quantity: 1 }],
        },
        "draft-key-mismatch",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Draft from Inbox: Validates CreateDraftOrderSchema (rejects duplicate variants and conflicting addresses).", async () => {
    // 1. Duplicate variants
    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [
            { variantId, quantity: 1 },
            { variantId, quantity: 2 },
          ],
        },
        "draft-dup-variants",
      ),
    ).rejects.toThrow(BadRequestException);

    // 2. Conflicting addresses
    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [{ variantId, quantity: 1 }],
          deliveryAddress: { city: "Tunis", country: "TN" },
          shippingAddress: { city: "Sousse", country: "TN" },
        },
        "draft-conflicting-address",
      ),
    ).rejects.toThrow(BadRequestException);

    // 3. Malformed delivery fee
    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [{ variantId, quantity: 1 }],
          deliveryFee: -10 as any,
        },
        "draft-negative-fee",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Draft from Inbox: Forces isTest to true when conversation is_test is true.", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      business_id: businessId,
      customer_id: customerId,
      is_test: true,
    });
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "Test Customer",
      phone: "+21698000000",
      is_test: false,
    });
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: productId,
        sku: "JEANS-32",
        price: new Prisma.Decimal("80.000"),
        discount_price: null,
        stock: 5,
        attributes: null,
        product: { name: "Slim Jeans" },
      },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });
    mockPrisma.businessRule.findFirst.mockResolvedValue(null);

    const testDraftDb = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: conversationId,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("80.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("80.000"),
      customer_snapshot: { name: "Test Customer", phone: "+21698000000", address: null },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "draft-test-prop",
      is_test: true,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    };
    mockPrisma.order.create.mockResolvedValue(testDraftDb);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(testDraftDb);

    const result = await controller.createDraftOrder(
      businessId,
      currentUser,
      conversationId,
      {
        items: [{ variantId, quantity: 1 }],
        isTest: false, // Explicitly false in body, but conversation is_test is true
      },
      "draft-test-prop",
    );

    expect(result.isTest).toBe(true);
  });

  it("Draft from Inbox: Requires Idempotency-Key header or body parameter.", async () => {
    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [{ variantId, quantity: 1 }],
        },
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Draft from Inbox: Throws 400 when header and body idempotency keys mismatch.", async () => {
    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [{ variantId, quantity: 1 }],
          idempotencyKey: "body-key",
        },
        "header-key",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Draft from Inbox: Tenant Isolation - Throws 404 when conversation not found.", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [{ variantId, quantity: 1 }],
        },
        "draft-key-1",
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("Draft from Inbox: Rejects isTest: true when conversation is_test is false.", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      business_id: businessId,
      customer_id: customerId,
      is_test: false,
    });
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "Prod Customer",
      phone: "+21698000000",
      is_test: false,
    });

    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [{ variantId, quantity: 1 }],
          isTest: true,
        },
        "draft-test-reject",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Draft from Inbox: Links customer to conversation if conversation customer_id is null.", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      business_id: businessId,
      customer_id: null,
      is_test: false,
    });
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "New Customer",
      phone: "+21698000000",
      address: null,
      is_test: false,
    });
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: productId,
        sku: "JEANS-32",
        price: new Prisma.Decimal("80.000"),
        discount_price: null,
        stock: 5,
        attributes: null,
        product: { name: "Slim Jeans" },
      },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });
    mockPrisma.businessRule.findFirst.mockResolvedValue(null);

    const createdDraftDb = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: conversationId,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("80.000"),
      delivery_fee: new Prisma.Decimal("0.000"),
      total: new Prisma.Decimal("80.000"),
      customer_snapshot: { name: "New Customer", phone: "+21698000000", address: null },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "draft-link-customer",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    };
    mockPrisma.order.create.mockResolvedValue(createdDraftDb);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(createdDraftDb);

    await controller.createDraftOrder(
      businessId,
      currentUser,
      conversationId,
      {
        customerId,
        items: [{ variantId, quantity: 1 }],
      },
      "draft-link-customer",
    );

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_business_id: {
            id: conversationId,
            business_id: businessId,
          },
        },
        data: { customer_id: customerId },
      }),
    );
  });

  it("Draft from Inbox: Accepts string float deliveryFee and normalizes it.", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      business_id: businessId,
      customer_id: customerId,
      is_test: false,
    });
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: customerId,
      business_id: businessId,
      name: "Alice Smith",
      phone: "+21698765432",
      address: null,
      is_test: false,
    });
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: variantId,
        business_id: businessId,
        product_id: productId,
        sku: "JEANS-32",
        price: new Prisma.Decimal("80.000"),
        discount_price: null,
        stock: 5,
        attributes: null,
        product: { name: "Slim Jeans" },
      },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    mockPrisma.aiSettings.findUnique.mockResolvedValue({ reservation_ttl_minutes: 30 });
    mockPrisma.businessRule.findFirst.mockResolvedValue(null);

    const createdDraftDb = {
      id: orderId,
      business_id: businessId,
      customer_id: customerId,
      conversation_id: conversationId,
      status: "PENDING_CONFIRMATION",
      payment_status: "NOT_COMPLETED",
      currency: "TND",
      subtotal: new Prisma.Decimal("80.000"),
      delivery_fee: new Prisma.Decimal("7.500"),
      total: new Prisma.Decimal("87.500"),
      customer_snapshot: { name: "Alice Smith", phone: "+21698765432", address: null },
      delivery_address: null,
      created_by_type: "user",
      created_by_user_id: "user-1",
      idempotency_key: "draft-str-fee",
      is_test: false,
      order_confirmed_at: null,
      cancelled_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    };
    mockPrisma.order.create.mockResolvedValue(createdDraftDb);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(createdDraftDb);

    const result = await controller.createDraftOrder(
      businessId,
      currentUser,
      conversationId,
      {
        items: [{ variantId, quantity: 1 }],
        deliveryFee: "7.5" as unknown as number,
      },
      "draft-str-fee",
    );

    expect(result.deliveryFee).toBe("7.500");
  });

  it("Draft from Inbox: Rejects idempotency keys longer than 255 chars.", async () => {
    const longKey = "a".repeat(256);
    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        conversationId,
        {
          items: [{ variantId, quantity: 1 }],
        },
        longKey,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("Draft from Inbox: Throws 400 when missing conversationId or invalid UUID.", async () => {
    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        "",
        {
          items: [{ variantId, quantity: 1 }],
        },
        "draft-key-1",
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.createDraftOrder(
        businessId,
        currentUser,
        "not-a-valid-uuid",
        {
          items: [{ variantId, quantity: 1 }],
        },
        "draft-key-1",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  describe("Confirm Conversation Order Alias (POST /conversations/:id/confirm-order)", () => {
    it("Confirms single pending order for conversation using bounded query.", async () => {
      const pendingOrder = {
        id: orderId,
        business_id: businessId,
        customer_id: customerId,
        conversation_id: conversationId,
        status: "PENDING_CONFIRMATION",
        payment_status: "NOT_COMPLETED",
        currency: "TND",
        subtotal: new Prisma.Decimal("80.000"),
        delivery_fee: new Prisma.Decimal("0.000"),
        total: new Prisma.Decimal("80.000"),
        customer_snapshot: { name: "Alice Smith", phone: null, address: null },
        delivery_address: null,
        created_by_type: "user",
        created_by_user_id: "user-1",
        idempotency_key: "k-confirm-conv",
        is_test: false,
        order_confirmed_at: null,
        cancelled_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        items: [
          {
            id: itemId,
            business_id: businessId,
            order_id: orderId,
            variant_id: variantId,
            quantity: 1,
            unit_price: new Prisma.Decimal("80.000"),
            name_snapshot: "Slim Jeans",
            sku_snapshot: "JEANS-32",
            attributes_snapshot: null,
            created_at: new Date(),
          },
        ],
      };
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ id: orderId }]);
      mockPrisma.order.findFirst.mockResolvedValue(pendingOrder);
      mockPrisma.order.findUniqueOrThrow.mockResolvedValue({
        ...pendingOrder,
        status: "CONFIRMED",
        payment_status: "COMPLETED",
        order_confirmed_at: new Date(),
      });
      mockPrisma.stockReservation.findMany.mockResolvedValue([
        {
          id: reservationId,
          business_id: businessId,
          order_id: orderId,
          variant_id: variantId,
          quantity: 1,
          status: "active",
          expires_at: new Date(Date.now() + 60000),
        },
      ]);
      mockPrisma.stockReservation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.productVariant.findFirst.mockResolvedValue({
        id: variantId,
        stock: 10,
        sku: "JEANS-32",
      });
      mockPrisma.order.update.mockResolvedValue({
        ...pendingOrder,
        status: "CONFIRMED",
        payment_status: "COMPLETED",
        order_confirmed_at: new Date(),
      });

      const res = await controller.confirmConversationOrder(businessId, conversationId, {
        paymentStatus: "COMPLETED",
      });

      expect(res.status).toBe("CONFIRMED");
      expect(res.paymentStatus).toBe("COMPLETED");
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          select: { id: true },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
        }),
      );
    });

    it("Throws 404 Not Found when conversation does not exist.", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(controller.confirmConversationOrder(businessId, conversationId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("Throws 404 Not Found when no pending order exists for conversation.", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(controller.confirmConversationOrder(businessId, conversationId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("Throws 409 Conflict when multiple pending orders exist for conversation.", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });
      mockPrisma.order.findMany.mockResolvedValue([
        { id: "55555555-5555-4555-8555-555555555551" },
        { id: "55555555-5555-4555-8555-555555555552" },
      ]);

      await expect(controller.confirmConversationOrder(businessId, conversationId)).rejects.toThrow(
        ConflictException,
      );
    });

    it("Throws 400 Bad Request when conversationId is empty or malformed.", async () => {
      await expect(controller.confirmConversationOrder(businessId, "")).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        controller.confirmConversationOrder(businessId, "invalid-uuid-format"),
      ).rejects.toThrow(BadRequestException);
    });

    it("Rejects invalid paymentStatus body with 400 Bad Request.", async () => {
      await expect(
        controller.confirmConversationOrder(businessId, conversationId, {
          paymentStatus: "INVALID_STATUS" as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Throws 400 when reservation hold for pending order has expired.", async () => {
      const pendingOrder = {
        id: orderId,
        business_id: businessId,
        customer_id: customerId,
        conversation_id: conversationId,
        status: "PENDING_CONFIRMATION",
        payment_status: "NOT_COMPLETED",
        currency: "TND",
        subtotal: new Prisma.Decimal("80.000"),
        delivery_fee: new Prisma.Decimal("0.000"),
        total: new Prisma.Decimal("80.000"),
        customer_snapshot: { name: "Alice", phone: null, address: null },
        delivery_address: null,
        created_by_type: "user",
        created_by_user_id: "user-1",
        idempotency_key: "k-expired",
        is_test: false,
        order_confirmed_at: null,
        cancelled_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        items: [
          {
            id: itemId,
            business_id: businessId,
            order_id: orderId,
            variant_id: variantId,
            quantity: 1,
            unit_price: new Prisma.Decimal("80.000"),
            name_snapshot: "Slim Jeans",
            sku_snapshot: "JEANS-32",
            attributes_snapshot: null,
            created_at: new Date(),
          },
        ],
      };
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ id: orderId }]);
      mockPrisma.order.findFirst.mockResolvedValue(pendingOrder);
      mockPrisma.stockReservation.findMany.mockResolvedValue([]); // No active reservation
      mockPrisma.productVariant.findFirst.mockResolvedValue({
        id: variantId,
        stock: 10,
        sku: "JEANS-32",
      });

      await expect(controller.confirmConversationOrder(businessId, conversationId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("Throws 400 when pending order is in CANCELLED state.", async () => {
      const cancelledOrder = {
        id: orderId,
        business_id: businessId,
        customer_id: customerId,
        conversation_id: conversationId,
        status: "CANCELLED",
        payment_status: "NOT_COMPLETED",
        currency: "TND",
        subtotal: new Prisma.Decimal("80.000"),
        delivery_fee: new Prisma.Decimal("0.000"),
        total: new Prisma.Decimal("80.000"),
        customer_snapshot: { name: "Alice", phone: null, address: null },
        delivery_address: null,
        created_by_type: "user",
        created_by_user_id: "user-1",
        idempotency_key: "k-cancelled",
        is_test: false,
        order_confirmed_at: null,
        cancelled_at: new Date(),
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        items: [],
      };
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ id: orderId }]);
      mockPrisma.order.findFirst.mockResolvedValue(cancelledOrder);

      await expect(controller.confirmConversationOrder(businessId, conversationId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("Idempotently returns already confirmed order when pending order count is zero.", async () => {
      const confirmedOrder = {
        id: orderId,
        business_id: businessId,
        customer_id: customerId,
        conversation_id: conversationId,
        status: "CONFIRMED",
        payment_status: "NOT_COMPLETED",
        currency: "TND",
        subtotal: new Prisma.Decimal("80.000"),
        delivery_fee: new Prisma.Decimal("0.000"),
        total: new Prisma.Decimal("80.000"),
        customer_snapshot: { name: "Alice", phone: null, address: null },
        delivery_address: null,
        created_by_type: "user",
        created_by_user_id: "user-1",
        idempotency_key: "k-already-confirmed",
        is_test: false,
        order_confirmed_at: new Date(),
        cancelled_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        items: [],
      };
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
      });
      mockPrisma.order.findMany.mockResolvedValue([]); // 0 pending
      mockPrisma.order.findFirst.mockResolvedValue(confirmedOrder); // found confirmed
      mockPrisma.order.update.mockResolvedValue({ ...confirmedOrder, payment_status: "COMPLETED" });

      const res = await controller.confirmConversationOrder(businessId, conversationId, {
        paymentStatus: "COMPLETED",
      });
      expect(res.status).toBe("CONFIRMED");
      expect(res.paymentStatus).toBe("COMPLETED");
    });
  });

  describe("Transaction propagation and currency configuration guards", () => {
    it("throws BadRequestException when business currency is not configured", async () => {
      mockPrisma.business.findUnique.mockResolvedValueOnce({
        id: businessId,
        currency: null,
      });

      await expect(
        service.createOrder(businessId, "user-1", {
          customerId,
          items: [{ variantId, quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rethrows P2002 error directly without root-client recovery when outer tx is provided", async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError("Unique constraint violation", {
        code: "P2002",
        clientVersion: "5.0.0",
      });

      const mockTx = {
        ...mockPrisma,
        order: {
          ...mockPrisma.order,
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(p2002Error),
        },
        customer: {
          findFirst: jest.fn().mockResolvedValue({ id: customerId, is_test: false }),
        },
        productVariant: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: variantId,
              stock: 10,
              price: new Prisma.Decimal("50.000"),
              discount_price: null,
              product: { name: "Silk Shirt" },
            },
          ]),
        },
        stockReservation: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: reservationId }),
        },
        aiSettings: {
          findUnique: jest.fn().mockResolvedValue({ reservation_ttl_minutes: 30 }),
        },
        businessRule: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        orderItem: {
          create: jest.fn().mockResolvedValue({ id: "item-1" }),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
      };

      await expect(
        service.createOrder(
          businessId,
          "user-1",
          {
            customerId,
            items: [{ variantId, quantity: 1 }],
          },
          "user",
          "test-key",
          mockTx as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(p2002Error);
    });
  });
});
