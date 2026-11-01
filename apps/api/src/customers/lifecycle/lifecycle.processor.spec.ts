import {
  LifecycleProcessor,
  ORDER_CONFIRMED_JOB,
  RECOMPUTE_LIFECYCLE_JOB,
} from "./lifecycle.processor";
import type { LifecycleService } from "./lifecycle.service";

describe("Customer lifecycle processor (LifecycleProcessor)", () => {
  let processor: LifecycleProcessor;
  let mockService: jest.Mocked<Pick<LifecycleService, "recomputeStage">>;
  let mockQueue: any;

  const mockBusinessId = "11111111-1111-4111-8111-111111111111";
  const mockCustomerId = "22222222-2222-4222-8222-222222222222";
  const mockOrderId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    mockService = {
      recomputeStage: jest.fn(),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-123" }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    processor = new LifecycleProcessor(mockService as unknown as LifecycleService, mockQueue);
  });

  describe("enqueueOrderConfirmed", () => {
    it("Enqueues an order_confirmed job with exponential backoff and correct payload.", async () => {
      const jobId = await processor.enqueueOrderConfirmed(
        mockBusinessId,
        mockCustomerId,
        mockOrderId,
      );

      expect(jobId).toBe("job-123");
      expect(mockQueue.add).toHaveBeenCalledWith(
        ORDER_CONFIRMED_JOB,
        expect.objectContaining({
          businessId: mockBusinessId,
          customerId: mockCustomerId,
          orderId: mockOrderId,
          trigger: "order_confirmed",
        }),
        expect.objectContaining({
          jobId: `lifecycle:order:${mockOrderId}`,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });
  });

  describe("enqueueRecompute", () => {
    it("Enqueues a recompute_lifecycle job with deterministic jobId for deduplication.", async () => {
      const jobId = await processor.enqueueRecompute(
        mockBusinessId,
        mockCustomerId,
        "customer_merge",
      );

      expect(jobId).toBe("job-123");
      expect(mockQueue.add).toHaveBeenCalledWith(
        RECOMPUTE_LIFECYCLE_JOB,
        expect.objectContaining({
          businessId: mockBusinessId,
          customerId: mockCustomerId,
          trigger: "customer_merge",
        }),
        expect.objectContaining({
          jobId: `lifecycle:recompute:${mockBusinessId}:${mockCustomerId}`,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });
  });

  describe("processJob", () => {
    it("Calls lifecycleService.recomputeStage and returns summary result.", async () => {
      mockService.recomputeStage = jest.fn().mockResolvedValue({
        customerId: mockCustomerId,
        businessId: mockBusinessId,
        classification: "FIRST_TIME_BUYER",
        dbStage: "customer",
        confirmedOrderCount: 1,
        lastConfirmedOrderAt: new Date(),
        isChurnRisk: false,
        daysSinceLastOrder: 0,
      });

      const mockJob: any = {
        data: {
          businessId: mockBusinessId,
          customerId: mockCustomerId,
          trigger: "order_confirmed",
        },
      };

      const result = await processor.processJob(mockJob);

      expect(mockService.recomputeStage).toHaveBeenCalledWith(mockBusinessId, mockCustomerId);
      expect(result).toEqual({
        success: true,
        customerId: mockCustomerId,
        businessId: mockBusinessId,
        classification: "FIRST_TIME_BUYER",
        lifecycleStage: "customer",
        confirmedOrderCount: 1,
        isChurnRisk: false,
      });
    });

    it("Propagates error if recomputeStage fails.", async () => {
      mockService.recomputeStage = jest
        .fn()
        .mockRejectedValue(new Error("Database connection lost"));

      const mockJob: any = {
        data: {
          businessId: mockBusinessId,
          customerId: mockCustomerId,
        },
      };

      await expect(processor.processJob(mockJob)).rejects.toThrow("Database connection lost");
    });
  });

  describe("Queue not initialised guards", () => {
    it("Throws error if enqueueOrderConfirmed is called without queue.", async () => {
      const uninitProcessor = new LifecycleProcessor(mockService as unknown as LifecycleService);
      await expect(
        uninitProcessor.enqueueOrderConfirmed(mockBusinessId, mockCustomerId, mockOrderId),
      ).rejects.toThrow("LifecycleProcessor: queue not initialised");
    });

    it("Throws error if enqueueRecompute is called without queue.", async () => {
      const uninitProcessor = new LifecycleProcessor(mockService as unknown as LifecycleService);
      await expect(
        uninitProcessor.enqueueRecompute(mockBusinessId, mockCustomerId),
      ).rejects.toThrow("LifecycleProcessor: queue not initialised");
    });
  });

  describe("Lifecycle hooks", () => {
    it("Handles module destruction cleanly.", async () => {
      await expect(processor.onModuleDestroy()).resolves.not.toThrow();
      expect(mockQueue.close).toHaveBeenCalled();
    });

    it("Handles module destruction when worker and queue are null.", async () => {
      const uninitProcessor = new LifecycleProcessor(mockService as unknown as LifecycleService);
      await expect(uninitProcessor.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
