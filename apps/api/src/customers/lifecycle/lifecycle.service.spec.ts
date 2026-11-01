import { NotFoundException } from "@nestjs/common";

import { LifecycleService, CHURN_THRESHOLD_DAYS } from "./lifecycle.service";

describe("Customer lifecycle stage automated classification (T-CUST-04)", () => {
  let service: LifecycleService;
  let mockPrisma: any;

  const mockBusinessId = "11111111-1111-4111-8111-111111111111";
  const mockCustomerId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(mockPrisma),
      ),
      customer: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        aggregate: jest.fn(),
      },
    };

    service = new LifecycleService(mockPrisma);
  });

  describe("Pure classification logic (classifyStage)", () => {
    it("First Order: Transitions customer to FIRST_TIME_BUYER when 1 confirmed order within 90 days.", () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const orderDate = new Date("2026-08-20T12:00:00Z"); // 12 days ago

      const result = service.classifyStage({
        confirmedOrderCount: 1,
        lastConfirmedOrderAt: orderDate,
        now,
      });

      expect(result.classification).toBe("FIRST_TIME_BUYER");
      expect(result.dbStage).toBe("customer");
      expect(result.isChurnRisk).toBe(false);
      expect(result.daysSinceLastOrder).toBe(12);
    });

    it("Repeat Order: Transitions customer to RETURNING_CUSTOMER when >= 2 confirmed orders within 90 days.", () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const orderDate = new Date("2026-08-30T12:00:00Z"); // 2 days ago

      const result = service.classifyStage({
        confirmedOrderCount: 2,
        lastConfirmedOrderAt: orderDate,
        now,
      });

      expect(result.classification).toBe("RETURNING_CUSTOMER");
      expect(result.dbStage).toBe("returning_customer");
      expect(result.isChurnRisk).toBe(false);
      expect(result.daysSinceLastOrder).toBe(2);

      // 5 orders
      const resultMany = service.classifyStage({
        confirmedOrderCount: 5,
        lastConfirmedOrderAt: orderDate,
        now,
      });
      expect(resultMany.classification).toBe("RETURNING_CUSTOMER");
      expect(resultMany.dbStage).toBe("returning_customer");
    });

    it("Churn Risk: Classifies customer as CHURN_RISK if last confirmed order >90 days ago.", () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const orderDate = new Date("2026-05-01T12:00:00Z"); // 123 days ago (> 90 days)

      // 1 order older than 90 days
      const result1 = service.classifyStage({
        confirmedOrderCount: 1,
        lastConfirmedOrderAt: orderDate,
        now,
      });
      expect(result1.classification).toBe("CHURN_RISK");
      expect(result1.dbStage).toBe("customer");
      expect(result1.isChurnRisk).toBe(true);
      expect(result1.daysSinceLastOrder).toBe(123);

      // 3 orders with last order older than 90 days
      const result2 = service.classifyStage({
        confirmedOrderCount: 3,
        lastConfirmedOrderAt: orderDate,
        now,
      });
      expect(result2.classification).toBe("CHURN_RISK");
      expect(result2.dbStage).toBe("returning_customer");
      expect(result2.isChurnRisk).toBe(true);
    });

    it("Prospect: Classifies customer with 0 confirmed orders as PROSPECT.", () => {
      const result = service.classifyStage({
        confirmedOrderCount: 0,
        lastConfirmedOrderAt: null,
      });

      expect(result.classification).toBe("PROSPECT");
      expect(result.dbStage).toBe("unknown_visitor");
      expect(result.isChurnRisk).toBe(false);
      expect(result.daysSinceLastOrder).toBeNull();
    });

    it("Prospect with VIP: Classifies customer with 0 confirmed orders but VIP tag as VIP dbStage.", () => {
      const result = service.classifyStage({
        confirmedOrderCount: 0,
        lastConfirmedOrderAt: null,
        hasVipTag: true,
      });

      expect(result.classification).toBe("PROSPECT");
      expect(result.dbStage).toBe("vip");
    });

    it("Prospect with interested/qualified_lead/order_pending retains current dbStage.", () => {
      const resultInterested = service.classifyStage({
        confirmedOrderCount: 0,
        currentStage: "interested",
      });
      expect(resultInterested.dbStage).toBe("interested");

      const resultQualified = service.classifyStage({
        confirmedOrderCount: 0,
        currentStage: "qualified_lead",
      });
      expect(resultQualified.dbStage).toBe("qualified_lead");

      const resultOrderPending = service.classifyStage({
        confirmedOrderCount: 0,
        currentStage: "order_pending",
      });
      expect(resultOrderPending.dbStage).toBe("order_pending");
    });

    it("Preserves VIP status when VIP tag or VIP stage exists.", () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const recentOrder = new Date("2026-08-25T12:00:00Z");

      const result = service.classifyStage({
        confirmedOrderCount: 2,
        lastConfirmedOrderAt: recentOrder,
        now,
        hasVipTag: true,
      });

      expect(result.classification).toBe("RETURNING_CUSTOMER");
      expect(result.dbStage).toBe("vip");
    });
  });

  describe("Asynchronous DB recomputation (recomputeStage)", () => {
    it("First Order: Transitions customer to FIRST_TIME_BUYER upon 1st order confirmation and excludes test orders.", async () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const orderConfirmedAt = new Date("2026-08-28T12:00:00Z");

      mockPrisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        business_id: mockBusinessId,
        lifecycle_stage: "unknown_visitor",
        confirmed_order_count: 0,
        last_confirmed_order_at: null,
        tags: [],
        erased_at: null,
        merged_into_customer_id: null,
      });

      mockPrisma.order.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _max: { order_confirmed_at: orderConfirmedAt },
      });

      mockPrisma.customer.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.recomputeStage(mockBusinessId, mockCustomerId, undefined, now);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockCustomerId,
          business_id: mockBusinessId,
          erased_at: null,
          merged_into_customer_id: null,
        },
        include: {
          tags: { select: { tag: true } },
        },
      });

      expect(mockPrisma.order.aggregate).toHaveBeenCalledWith({
        where: {
          business_id: mockBusinessId,
          customer_id: mockCustomerId,
          status: { in: ["CONFIRMED", "COMPLETED"] },
          is_test: false,
        },
        _count: { _all: true },
        _max: { order_confirmed_at: true },
      });

      expect(mockPrisma.customer.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockCustomerId,
          business_id: mockBusinessId,
          erased_at: null,
          merged_into_customer_id: null,
        },
        data: {
          confirmed_order_count: 1,
          last_confirmed_order_at: orderConfirmedAt,
          lifecycle_stage: "customer",
        },
      });

      expect(result.classification).toBe("FIRST_TIME_BUYER");
      expect(result.dbStage).toBe("customer");
      expect(result.confirmedOrderCount).toBe(1);
      expect(result.lastConfirmedOrderAt).toEqual(orderConfirmedAt);
      expect(result.isChurnRisk).toBe(false);
    });

    it("Repeat Order: Transitions customer to RETURNING_CUSTOMER upon 2nd order confirmation.", async () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const orderConfirmedAt = new Date("2026-08-31T12:00:00Z");

      mockPrisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        business_id: mockBusinessId,
        lifecycle_stage: "customer",
        confirmed_order_count: 1,
        last_confirmed_order_at: new Date("2026-08-01T12:00:00Z"),
        tags: [],
        erased_at: null,
        merged_into_customer_id: null,
      });

      mockPrisma.order.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _max: { order_confirmed_at: orderConfirmedAt },
      });

      mockPrisma.customer.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.recomputeStage(mockBusinessId, mockCustomerId, undefined, now);

      expect(result.classification).toBe("RETURNING_CUSTOMER");
      expect(result.dbStage).toBe("returning_customer");
      expect(result.confirmedOrderCount).toBe(2);
      expect(result.lastConfirmedOrderAt).toEqual(orderConfirmedAt);
    });

    it("Churn Risk: Classifies customer as CHURN_RISK if last confirmed order >90 days ago.", async () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const oldOrderDate = new Date("2026-04-15T12:00:00Z"); // ~139 days ago

      mockPrisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        business_id: mockBusinessId,
        lifecycle_stage: "customer",
        confirmed_order_count: 1,
        last_confirmed_order_at: oldOrderDate,
        tags: [],
        erased_at: null,
        merged_into_customer_id: null,
      });

      mockPrisma.order.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _max: { order_confirmed_at: oldOrderDate },
      });

      mockPrisma.customer.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.recomputeStage(mockBusinessId, mockCustomerId, undefined, now);

      expect(result.classification).toBe("CHURN_RISK");
      expect(result.isChurnRisk).toBe(true);
      expect(result.daysSinceLastOrder).toBeGreaterThan(CHURN_THRESHOLD_DAYS);
    });

    it("Tenancy Boundary: Throws NotFoundException if customer does not exist in the tenant.", async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.recomputeStage(mockBusinessId, mockCustomerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("Concurrency Guard: Throws NotFoundException if customer was erased or merged concurrently before update.", async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        business_id: mockBusinessId,
        lifecycle_stage: "unknown_visitor",
        confirmed_order_count: 0,
        last_confirmed_order_at: null,
        tags: [],
        erased_at: null,
        merged_into_customer_id: null,
      });

      mockPrisma.order.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _max: { order_confirmed_at: new Date() },
      });

      mockPrisma.customer.updateMany.mockResolvedValue({ count: 0 }); // Concurrently modified

      await expect(service.recomputeStage(mockBusinessId, mockCustomerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("Supports transaction client parameter.", async () => {
      const mockTx: any = {
        customer: {
          findFirst: jest.fn().mockResolvedValue({
            id: mockCustomerId,
            business_id: mockBusinessId,
            lifecycle_stage: "unknown_visitor",
            confirmed_order_count: 0,
            last_confirmed_order_at: null,
            tags: [],
            erased_at: null,
            merged_into_customer_id: null,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        order: {
          aggregate: jest.fn().mockResolvedValue({
            _count: { _all: 1 },
            _max: { order_confirmed_at: new Date() },
          }),
        },
      };

      const result = await service.recomputeStage(mockBusinessId, mockCustomerId, mockTx);

      expect(mockTx.customer.findFirst).toHaveBeenCalled();
      expect(mockTx.order.aggregate).toHaveBeenCalled();
      expect(mockTx.customer.updateMany).toHaveBeenCalled();
      expect(mockPrisma.customer.findFirst).not.toHaveBeenCalled();
      expect(result.classification).toBe("FIRST_TIME_BUYER");
    });
  });
});
