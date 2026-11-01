import { BadRequestException } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";

import { REALTIME_EVENTS } from "@app/shared";

import { PRISMA_CLIENT } from "../../platform/core/prisma.token";
import { RealtimeGateway } from "../../realtime";
import {
  ReservationSweeperProcessor,
  MAINTENANCE_QUEUE,
  EXPIRE_RESERVATIONS_JOB,
  EXPIRE_RESERVATIONS_REPEAT_JOB_ID,
} from "./reservation-sweeper.processor";
import { ReservationSweeperService, type SweepResult } from "./reservation-sweeper.service";

// Mock BullMQ
jest.mock("../../lib/queue.js", () => ({
  connection: {},
}));

jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation((name: string) => ({
      name,
      add: jest.fn().mockResolvedValue({ id: "job-123" }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    Worker: jest.fn().mockImplementation((name: string, processorFn: any) => ({
      name,
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      processFn: processorFn,
    })),
  };
});

interface MockPrisma {
  stockReservation: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  order: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  productVariant: {
    findFirst: jest.Mock;
  };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
}

function createMockPrisma(): MockPrisma {
  const mock: MockPrisma = {
    stockReservation: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productVariant: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // Sweeper uses FOR UPDATE via $queryRaw to lock order rows (F1/F6/F7)
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((arg: unknown, _options?: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: MockPrisma) => Promise<unknown>)(mock);
      }
      return Promise.resolve(arg);
    }),
  };
  return mock;
}

describe("Stock reservation TTL worker & automated expiration sweeper (T-ORD-02)", () => {
  const tenantA = "11111111-1111-4111-a111-111111111111";
  const tenantB = "22222222-2222-4222-a222-222222222222";
  const variantId1 = "aaaa0001-0000-4000-a000-000000000001";
  const variantId2 = "aaaa0002-0000-4000-a000-000000000002";
  const orderId1 = "bbbb0001-0000-4000-a000-000000000001";
  const conversationId1 = "cccc0001-0000-4000-a000-000000000001";

  let mockPrisma: MockPrisma;
  let mockRealtime: {
    emitToTenant: jest.Mock;
    emitToConversation: jest.Mock;
  };
  let sweeperService: ReservationSweeperService;
  let sweeperProcessor: ReservationSweeperProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockRealtime = {
      emitToTenant: jest.fn(),
      emitToConversation: jest.fn(),
    };
    sweeperService = new ReservationSweeperService(mockPrisma as any, mockRealtime);
    sweeperProcessor = new ReservationSweeperProcessor(sweeperService);
  });

  describe("1. Acceptance Scenarios & Core Functionality", () => {
    it("Automated Expiry: Expired holds transition to EXPIRED status.", async () => {
      const now = new Date("2026-08-30T12:00:00Z");
      const expiredPastTime = new Date("2026-08-30T11:30:00Z");

      const expiredRes1 = {
        id: "res-1",
        business_id: tenantA,
        variant_id: variantId1,
        order_id: orderId1,
        conversation_id: conversationId1,
        quantity: 2,
        status: "active",
        expires_at: expiredPastTime,
      };
      const expiredRes2 = {
        id: "res-2",
        business_id: tenantA,
        variant_id: variantId2,
        order_id: null,
        conversation_id: null,
        quantity: 1,
        status: "active",
        expires_at: expiredPastTime,
      };

      // Mock finding expired active reservations
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([expiredRes1, expiredRes2]);
      // Mock finding linked pending order
      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: orderId1,
          business_id: tenantA,
          conversation_id: conversationId1,
          status: "PENDING_CONFIRMATION",
        },
      ]);
      // Second findMany is for remaining active holds across pending orders -> empty
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([]);

      mockPrisma.stockReservation.updateMany.mockResolvedValueOnce({ count: 2 });
      mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 1 });

      const result: SweepResult = await sweeperService.sweepExpiredReservations(tenantA, now);

      // Verify reservations transitioned to expired
      expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["res-1", "res-2"] },
          status: "active",
        },
        data: {
          status: "expired",
        },
      });

      // Verify linked order in PENDING_CONFIRMATION transitioned to CANCELLED
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: orderId1,
          business_id: tenantA,
          status: "PENDING_CONFIRMATION",
        },
        data: {
          status: "CANCELLED",
          cancelled_at: expect.any(Date),
        },
      });

      // Verify realtime event was emitted for the cancelled order's conversation
      expect(mockRealtime.emitToConversation).toHaveBeenCalledWith(
        conversationId1,
        REALTIME_EVENTS.ORDER_CANCELLED,
        expect.objectContaining({
          businessId: tenantA,
          orderId: orderId1,
          conversationId: conversationId1,
          reason: "EXPIRED_RESERVATION",
        }),
      );

      expect(result).toEqual({
        sweptCount: 2,
        cancelledOrderCount: 1,
        expiredReservationIds: ["res-1", "res-2"],
        cancelledOrderIds: [orderId1],
      });
    });

    it("Inventory Restoration: Sweeping transitions expired holds to EXPIRED, freeing up inventory", async () => {
      const now = new Date("2026-08-30T12:00:00Z");
      const expiredHold = {
        id: "res-expired-hold",
        business_id: tenantA,
        variant_id: variantId1,
        order_id: null,
        conversation_id: null,
        quantity: 5,
        status: "active",
        expires_at: new Date("2026-08-30T11:00:00Z"),
      };

      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([expiredHold]);
      mockPrisma.stockReservation.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await sweeperService.sweepExpiredReservations(tenantA, now);

      expect(result.sweptCount).toBe(1);
      expect(result.expiredReservationIds).toEqual(["res-expired-hold"]);
      expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["res-expired-hold"] },
          status: "active",
        },
        data: {
          status: "expired",
        },
      });
    });
  });

  describe("2. Idempotency & Safety Guardrails", () => {
    it("🔒 Idempotent Sweeper: Running sweeper multiple times produces identical results without double-restoring stock", async () => {
      const now = new Date("2026-08-30T12:00:00Z");

      // Pass 1: returns empty because all reservations have already been swept or are active
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([]);

      const pass1 = await sweeperService.sweepExpiredReservations(tenantA, now);
      expect(pass1).toEqual({
        sweptCount: 0,
        cancelledOrderCount: 0,
        expiredReservationIds: [],
        cancelledOrderIds: [],
      });
      expect(mockPrisma.stockReservation.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();

      // Pass 2: subsequent run produces identical zero-op result safely
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([]);
      const pass2 = await sweeperService.sweepExpiredReservations(tenantA, now);
      expect(pass2).toEqual({
        sweptCount: 0,
        cancelledOrderCount: 0,
        expiredReservationIds: [],
        cancelledOrderIds: [],
      });
    });

    it("Only cancels orders in PENDING_CONFIRMATION status, leaving CONFIRMED or COMPLETED orders untouched", async () => {
      const now = new Date("2026-08-30T12:00:00Z");
      const res = {
        id: "res-confirmed",
        business_id: tenantA,
        variant_id: variantId1,
        order_id: orderId1,
        conversation_id: conversationId1,
        quantity: 1,
        status: "active",
        expires_at: new Date("2026-08-30T11:00:00Z"),
      };

      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([res]);
      // The order is not PENDING_CONFIRMATION (e.g. already confirmed)
      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: orderId1,
          business_id: tenantA,
          conversation_id: conversationId1,
          status: "CONFIRMED",
        },
      ]);
      mockPrisma.stockReservation.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await sweeperService.sweepExpiredReservations(tenantA, now);

      expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["res-confirmed"] },
          status: "active",
        },
        data: {
          status: "expired",
        },
      });
      // No orders updated because it was not in PENDING_CONFIRMATION
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
      expect(result.cancelledOrderCount).toBe(0);
      expect(result.cancelledOrderIds).toEqual([]);
    });

    it("Respects tenant isolation when businessId is supplied", async () => {
      const now = new Date("2026-08-30T12:00:00Z");
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([]);

      await sweeperService.sweepExpiredReservations(tenantB, now);

      expect(mockPrisma.stockReservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: "active",
            expires_at: { lte: now },
            business_id: tenantB,
          },
          take: 500,
          orderBy: [{ expires_at: "asc" }, { id: "asc" }],
        }),
      );
    });

    it("Applies batch size limit and transaction options safely", async () => {
      const now = new Date("2026-08-30T12:00:00Z");
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([]);

      await sweeperService.sweepExpiredReservations(tenantA, now, 100);

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 10000,
        maxWait: 5000,
      });

      expect(mockPrisma.stockReservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          orderBy: [{ expires_at: "asc" }, { id: "asc" }],
        }),
      );
    });

    it("Defensively preserves pending order if it still has active non-expired reservations", async () => {
      const now = new Date("2026-08-30T12:00:00Z");
      const expiredRes = {
        id: "res-expired-partial",
        business_id: tenantA,
        variant_id: variantId1,
        order_id: orderId1,
        conversation_id: conversationId1,
        quantity: 1,
        status: "active",
        expires_at: new Date("2026-08-30T11:00:00Z"),
      };

      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([expiredRes]);
      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: orderId1,
          business_id: tenantA,
          conversation_id: conversationId1,
          status: "PENDING_CONFIRMATION",
        },
      ]);
      // Order has 1 remaining active hold (returned in single-query remaining active holds findMany)
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([{ order_id: orderId1 }]);
      mockPrisma.stockReservation.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await sweeperService.sweepExpiredReservations(tenantA, now);

      // Expired reservation is marked expired
      expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["res-expired-partial"] },
          status: "active",
        },
        data: {
          status: "expired",
        },
      });

      // Order is NOT cancelled because it still has active reservation
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
      expect(result.cancelledOrderCount).toBe(0);
      expect(result.cancelledOrderIds).toEqual([]);
    });

    it("Emits tenant-level cancellation event in addition to conversation status", async () => {
      const now = new Date("2026-08-30T12:00:00Z");
      const expiredRes = {
        id: "res-1",
        business_id: tenantA,
        variant_id: variantId1,
        order_id: orderId1,
        conversation_id: conversationId1,
        quantity: 2,
        status: "active",
        expires_at: new Date("2026-08-30T11:00:00Z"),
      };

      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([expiredRes]);
      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: orderId1,
          business_id: tenantA,
          conversation_id: conversationId1,
          status: "PENDING_CONFIRMATION",
        },
      ]);
      mockPrisma.stockReservation.findMany.mockResolvedValueOnce([]); // No remaining active holds
      mockPrisma.stockReservation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 1 });

      await sweeperService.sweepExpiredReservations(tenantA, now);

      expect(mockRealtime.emitToTenant).toHaveBeenCalledWith(
        tenantA,
        REALTIME_EVENTS.ORDER_CANCELLED,
        expect.objectContaining({
          businessId: tenantA,
          orderId: orderId1,
          conversationId: conversationId1,
          reason: "EXPIRED_RESERVATION",
        }),
      );
    });

    it("Validates inputs strictly and rejects invalid batchSize, referenceTime, or businessId", async () => {
      await expect(sweeperService.sweepExpiredReservations("invalid-uuid")).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        sweeperService.sweepExpiredReservations(tenantA, new Date("invalid-date")),
      ).rejects.toThrow(BadRequestException);

      await expect(sweeperService.sweepExpiredReservations(tenantA, new Date(), 0)).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        sweeperService.sweepExpiredReservations(tenantA, new Date(), -5),
      ).rejects.toThrow(BadRequestException);

      await expect(
        sweeperService.sweepExpiredReservations(tenantA, new Date(), 1001),
      ).rejects.toThrow(BadRequestException);
    });

    it("Does not emit realtime events if the database transaction rolls back", async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(new Error("Transaction deadlock"));

      await expect(sweeperService.sweepExpiredReservations(tenantA, new Date())).rejects.toThrow(
        "Transaction deadlock",
      );

      expect(mockRealtime.emitToConversation).not.toHaveBeenCalled();
      expect(mockRealtime.emitToTenant).not.toHaveBeenCalled();
    });
  });

  describe("3. BullMQ Processor, Worker & Scheduler", () => {
    it("Initializes queue, registers 1-minute repeatable cron job, and worker onModuleInit", async () => {
      const mockQueue = {
        name: MAINTENANCE_QUEUE,
        getJobSchedulers: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue({ id: "repeatable-job" }),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const processor = new ReservationSweeperProcessor(sweeperService, mockQueue as any);

      await processor.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPIRE_RESERVATIONS_JOB,
        expect.any(Object),
        expect.objectContaining({
          jobId: EXPIRE_RESERVATIONS_REPEAT_JOB_ID,
          repeat: {
            pattern: "* * * * *",
          },
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });

    it("Skips repeatable job registration if it is already scheduled", async () => {
      const mockQueue = {
        name: MAINTENANCE_QUEUE,
        getJobSchedulers: jest.fn().mockResolvedValue([
          {
            key: EXPIRE_RESERVATIONS_REPEAT_JOB_ID,
            name: EXPIRE_RESERVATIONS_JOB,
          },
        ]),
        add: jest.fn(),
        close: jest.fn(),
      };
      const processor = new ReservationSweeperProcessor(sweeperService, mockQueue as any);

      await processor.onModuleInit();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("Triggers ad-hoc sweep job via triggerSweep with UUID validation", async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: "job-adhoc" }),
        close: jest.fn(),
      };
      const processor = new ReservationSweeperProcessor(sweeperService, mockQueue as any);

      const job = await processor.triggerSweep(tenantA);
      expect(job).toEqual({ id: "job-adhoc" });
      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPIRE_RESERVATIONS_JOB,
        expect.objectContaining({
          businessId: tenantA,
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: true,
        }),
      );

      // Rejects invalid UUID — now throws BadRequestException (F18)
      await expect(processor.triggerSweep("not-a-valid-uuid")).rejects.toThrow(BadRequestException);
    });

    it("Processes job from queue successfully and drains multiple batches if needed", async () => {
      // Use a near-past timestamp (5 minutes ago) to pass the F17 operational window check
      const now = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const sweepSpy = jest
        .spyOn(sweeperService, "sweepExpiredReservations")

        // Batch 1: returns full batch (500 items actually transitioned)
        .mockResolvedValueOnce({
          sweptCount: 500,
          cancelledOrderCount: 10,
          expiredReservationIds: Array(500).fill("res-id"),
          cancelledOrderIds: ["o1"],
        })
        // Batch 2: returns partial batch (5 items) -> drains loop
        .mockResolvedValueOnce({
          sweptCount: 5,
          cancelledOrderCount: 1,
          expiredReservationIds: ["res-final-1", "res-final-2"],
          cancelledOrderIds: ["o2"],
        });

      const mockJob = {
        id: "job-test-1",
        name: EXPIRE_RESERVATIONS_JOB,
        data: {
          businessId: tenantA,
          referenceTime: now,
        },
      } as unknown as Job;

      const result = await sweeperProcessor.processJob(mockJob as any);

      expect(sweepSpy).toHaveBeenCalledTimes(2);
      // F9: loop drains based on sweptCount not candidate array length
      // F10: hasMore:false when loop drained naturally (partial batch)
      expect(result).toEqual({
        success: true,
        sweptCount: 505,
        cancelledOrderCount: 11,
        expiredReservationIds: expect.any(Array),
        cancelledOrderIds: ["o1", "o2"],
        pagesProcessed: 2,
        hasMore: false,
      });
    });

    it("F10: Sets hasMore=true when MAX_SWEEP_PAGES is reached with a full batch", async () => {
      // Use a near-past timestamp (5 minutes ago) to pass the F17 operational window check
      const now = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      // Every page returns a full batch — simulates an enormous backlog
      jest.spyOn(sweeperService, "sweepExpiredReservations").mockResolvedValue({
        sweptCount: 500,
        cancelledOrderCount: 0,
        expiredReservationIds: Array(500).fill("res-id"),
        cancelledOrderIds: [],
      });

      const mockJob = {
        id: "job-truncated",
        name: EXPIRE_RESERVATIONS_JOB,
        data: { businessId: tenantA, referenceTime: now },
      } as unknown as Job;

      const result = await sweeperProcessor.processJob(mockJob as any);

      expect(result.hasMore).toBe(true);
      expect(result.pagesProcessed).toBe(10); // MAX_SWEEP_PAGES
      expect(result.success).toBe(true);
    });

    it("F17: Rejects referenceTime that is more than 24 hours in the past", async () => {
      const farPast = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const mockJob = {
        id: "job-far-past",
        name: EXPIRE_RESERVATIONS_JOB,
        data: { referenceTime: farPast },
      } as unknown as Job;

      await expect(sweeperProcessor.processJob(mockJob as any)).rejects.toThrow(
        /outside the acceptable operational window/,
      );
    });

    it("F17: Rejects referenceTime that is more than 60 seconds in the future", async () => {
      const farFuture = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const mockJob = {
        id: "job-far-future",
        name: EXPIRE_RESERVATIONS_JOB,
        data: { referenceTime: farFuture },
      } as unknown as Job;

      await expect(sweeperProcessor.processJob(mockJob as any)).rejects.toThrow(
        /outside the acceptable operational window/,
      );
    });

    it("Rejects malformed job payloads and invalid dates", async () => {
      const mockJobInvalidUuid = {
        id: "job-invalid-uuid",
        name: EXPIRE_RESERVATIONS_JOB,
        data: {
          businessId: "invalid-uuid-format",
        },
      } as unknown as Job;

      await expect(sweeperProcessor.processJob(mockJobInvalidUuid as any)).rejects.toThrow(
        /Invalid job data/,
      );

      const mockJobInvalidDate = {
        id: "job-invalid-date",
        name: EXPIRE_RESERVATIONS_JOB,
        data: {
          referenceTime: "not-a-date",
        },
      } as unknown as Job;

      await expect(sweeperProcessor.processJob(mockJobInvalidDate as any)).rejects.toThrow(
        /Invalid job data/,
      );
    });

    it("F18: triggerSweep throws BadRequestException for invalid UUID (not a plain Error)", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: "job-adhoc" }),
        close: jest.fn(),
      };
      const processor = new ReservationSweeperProcessor(sweeperService, mockQueue as any);

      await expect(processor.triggerSweep("not-a-valid-uuid")).rejects.toThrow(BadRequestException);
    });

    it("Propagates error so BullMQ marks job as failed", async () => {
      jest
        .spyOn(sweeperService, "sweepExpiredReservations")
        .mockRejectedValueOnce(new Error("Database connection timeout"));

      const mockJob = {
        id: "job-test-fail",
        name: EXPIRE_RESERVATIONS_JOB,
        data: {},
      } as unknown as Job;

      await expect(sweeperProcessor.processJob(mockJob as any)).rejects.toThrow(
        "Database connection timeout",
      );
    });

    it("Closes worker and queue cleanly on onModuleDestroy", async () => {
      const mockQueue = {
        add: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const processor = new ReservationSweeperProcessor(sweeperService, mockQueue as any);

      await processor.onModuleDestroy();
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });

  describe("4. Module Isolation & Boundary Checks", () => {
    it("OrdersModule only exports OrdersService, keeping internal maintenance workers unexported", async () => {
      const { OrdersModule } = await import("../orders.module");
      const { OrdersService } = await import("../core/orders.service");
      const exports = Reflect.getMetadata("exports", OrdersModule);
      expect(exports).toEqual([OrdersService]);
    });

    it("Compiles full NestJS testing module and injects dependencies cleanly", async () => {
      const { RESERVATION_SWEEPER_QUEUE: Q_TOKEN } =
        await import("./reservation-sweeper.processor");

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ReservationSweeperService,
          ReservationSweeperProcessor,
          {
            provide: PRISMA_CLIENT,
            useValue: mockPrisma,
          },
          {
            provide: RealtimeGateway,
            useValue: mockRealtime,
          },
          {
            provide: Q_TOKEN,
            useValue: {
              add: jest.fn(),
              close: jest.fn(),
            },
          },
        ],
      }).compile();

      const service = module.get<ReservationSweeperService>(ReservationSweeperService);
      const processor = module.get<ReservationSweeperProcessor>(ReservationSweeperProcessor);

      expect(service).toBeDefined();
      expect(processor).toBeDefined();
    });
  });

  describe("5. Manual Cancellation Realtime Events (F22)", () => {
    it("cancelOrder emits ORDER_CANCELLED realtime event to conversation and tenant after commit", async () => {
      // This tests the manual cancel path to ensure parity with sweeper events.
      // We invoke the service directly with a mocked Prisma.
      const cancelledAt = new Date("2026-08-30T12:00:00Z");
      const cancelledOrder = {
        id: orderId1,
        business_id: tenantA,
        customer_id: "cust-0001-0000-4000-a000-000000000001",
        conversation_id: conversationId1,
        status: "CANCELLED",
        payment_status: "NOT_COMPLETED",
        currency: "TND",
        subtotal: { toFixed: () => "0.000", equals: () => true },
        delivery_fee: { toFixed: () => "0.000", equals: () => true },
        total: { toFixed: () => "0.000", equals: () => true },
        customer_snapshot: {},
        delivery_address: null,
        created_by_type: "ai",
        created_by_user_id: null,
        idempotency_key: "idem-key-1",
        is_test: false,
        order_confirmed_at: null,
        cancelled_at: cancelledAt,
        completed_at: null,
        created_at: cancelledAt,
        updated_at: cancelledAt,
        items: [],
      };

      // Re-use the OrdersService with mocked Prisma for cancel flow
      const { OrdersService } = await import("../core/orders.service");
      const cancelPrisma = createMockPrisma() as any;

      // Mock FOR UPDATE query (findOrderOrThrow)
      cancelPrisma.$queryRaw = jest.fn().mockResolvedValue([]);
      cancelPrisma.order = {
        findFirst: jest.fn().mockResolvedValue({
          ...cancelledOrder,
          status: "PENDING_CONFIRMATION",
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(cancelledOrder),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      cancelPrisma.stockReservation = {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      cancelPrisma.$transaction = jest.fn((arg: unknown) => {
        if (typeof arg === "function") {
          return (arg as (tx: unknown) => Promise<unknown>)(cancelPrisma);
        }
        return Promise.resolve(arg);
      });

      const cancelRealtime = {
        emitToTenant: jest.fn(),
        emitToConversation: jest.fn(),
      };

      const svc = new OrdersService(cancelPrisma, cancelRealtime);
      await svc.cancelOrder(tenantA, orderId1);

      // After transaction commit, realtime events should fire
      expect(cancelRealtime.emitToConversation).toHaveBeenCalledWith(
        conversationId1,
        REALTIME_EVENTS.ORDER_CANCELLED,
        expect.objectContaining({
          businessId: tenantA,
          orderId: orderId1,
          reason: "MANUAL_CANCEL",
        }),
      );
      expect(cancelRealtime.emitToTenant).toHaveBeenCalledWith(
        tenantA,
        REALTIME_EVENTS.ORDER_CANCELLED,
        expect.objectContaining({
          businessId: tenantA,
          orderId: orderId1,
          reason: "MANUAL_CANCEL",
        }),
      );
    });
  });
});
