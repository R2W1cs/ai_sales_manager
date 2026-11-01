import { BadRequestException } from "@nestjs/common";
import type { UsageEvent, UsageMetric } from "@prisma/client";
import { type Job, UnrecoverableError } from "bullmq";

import type { SyncUsageAggregatesJobData } from "@app/shared";

import { MeteringProcessor, SYNC_USAGE_AGGREGATES_JOB } from "./metering.processor";
import { MeteringService } from "./metering.service";

describe("Usage events metering pipeline & hourly aggregation worker (T-BILL-02)", () => {
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";

  let mockPrisma: any;
  let meteringService: MeteringService;
  let mockQueue: any;
  let meteringProcessor: MeteringProcessor;

  beforeEach(() => {
    mockPrisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
      usageEvent: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: "evt-001",
            ...data,
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      usageAggregate: {
        upsert: jest
          .fn()
          .mockImplementation(
            ({
              create,
              update,
            }: {
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) =>
              Promise.resolve({
                id: "agg-001",
                ...create,
                ...update,
                updated_at: new Date(),
              }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    meteringService = new MeteringService(mockPrisma);

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-123" }),
      upsertJobScheduler: jest.fn().mockResolvedValue({}),
      getJobSchedulers: jest.fn().mockResolvedValue([]),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    };

    meteringProcessor = new MeteringProcessor(meteringService, mockQueue);
  });

  describe("MeteringService.recordUsage()", () => {
    it("records a raw usage event with positional arguments and defaults", async () => {
      const fixedDate = new Date("2026-09-02T10:00:00.000Z");
      const result = await meteringService.recordUsage(tenantA, "messages_in", 1, false, fixedDate);

      expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith({
        data: {
          business_id: tenantA,
          metric: "messages_in",
          quantity: 1,
          period_bucket: new Date("2026-09-02T00:00:00.000Z"),
          is_test: false,
          recorded_at: fixedDate,
        },
      });
      expect(result.id).toBe("evt-001");
      expect(result.business_id).toBe(tenantA);
    });

    it("records a raw usage event using options DTO", async () => {
      const fixedDate = new Date("2026-09-02T15:30:00.000Z");
      const result = await meteringService.recordUsage({
        businessId: tenantA,
        metric: "messages_out_ai" as UsageMetric,
        quantity: 5,
        isTest: true,
        recordedAt: fixedDate,
      });

      expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith({
        data: {
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 5,
          period_bucket: new Date("2026-09-02T00:00:00.000Z"),
          is_test: true,
          recorded_at: fixedDate,
        },
      });
      expect(result.quantity).toBe(5);
      expect(result.is_test).toBe(true);
    });

    it("Timezone Bucketing: Period bucket matches Africa/Tunis calendar date (UTC+1)", () => {
      // 2026-09-02 at 23:30:00 UTC is 2026-09-03 at 00:30:00 in Africa/Tunis
      const lateUtc = new Date("2026-09-02T23:30:00.000Z");
      const bucket = meteringService.getAfricaTunisDate(lateUtc);
      expect(bucket.toISOString()).toBe("2026-09-03T00:00:00.000Z");

      const dateStr = meteringService.getAfricaTunisDateString(lateUtc);
      expect(dateStr).toBe("2026-09-03");

      // 2026-09-02 at 01:00:00 UTC is 2026-09-02 at 02:00:00 in Africa/Tunis
      const morningUtc = new Date("2026-09-02T01:00:00.000Z");
      const morningBucket = meteringService.getAfricaTunisDate(morningUtc);
      expect(morningBucket.toISOString()).toBe("2026-09-02T00:00:00.000Z");
    });

    it("rejects invalid businessId (non-UUID)", async () => {
      await expect(meteringService.recordUsage("invalid-uuid", "messages_in", 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects invalid quantity (<= 0 or non-integer)", async () => {
      await expect(meteringService.recordUsage(tenantA, "messages_in", 0)).rejects.toThrow(
        BadRequestException,
      );

      await expect(meteringService.recordUsage(tenantA, "messages_in", -5)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects invalid usage metric", async () => {
      await expect(
        meteringService.recordUsage(tenantA, "unknown_metric" as any, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("MeteringService.getRawUsageEvents()", () => {
    it("strictly isolates queries by tenant business_id", async () => {
      const mockEvents: Partial<UsageEvent>[] = [
        {
          id: "evt-1",
          business_id: tenantA,
          metric: "messages_in",
          quantity: 1,
          recorded_at: new Date(),
        },
      ];
      mockPrisma.usageEvent.findMany.mockResolvedValue(mockEvents);

      const events = await meteringService.getRawUsageEvents(tenantA, {
        metric: "messages_in" as UsageMetric,
        isTest: false,
      });

      expect(mockPrisma.usageEvent.findMany).toHaveBeenCalledWith({
        where: {
          business_id: tenantA,
          metric: "messages_in",
          is_test: false,
        },
        orderBy: [{ recorded_at: "asc" }],
      });
      expect(events).toEqual(mockEvents);
    });

    it("rejects missing businessId", async () => {
      await expect(meteringService.getRawUsageEvents("")).rejects.toThrow(BadRequestException);
    });
  });

  describe("MeteringService.aggregateUsage()", () => {
    it("groups and sums quantities for a tenant, excluding test events by default", async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValue([
        { metric: "messages_in", _sum: { quantity: 42 } },
        { metric: "messages_out_ai", _sum: { quantity: 38 } },
      ]);

      const periodStart = new Date("2026-09-01T00:00:00.000Z");
      const periodEnd = new Date("2026-09-02T00:00:00.000Z");

      const totals = await meteringService.aggregateUsage(tenantA, periodStart, periodEnd);

      expect(mockPrisma.usageEvent.groupBy).toHaveBeenCalledWith({
        by: ["metric"],
        where: {
          business_id: tenantA,
          recorded_at: {
            gte: periodStart,
            lt: periodEnd,
          },
          is_test: false,
        },
        _sum: {
          quantity: true,
        },
      });

      expect(totals).toEqual({
        messages_in: 42,
        messages_out_ai: 38,
      });
    });
  });

  describe("Usage Aggregation & syncUsageAggregates()", () => {
    it("Usage Aggregation: Aggregates match exact sum of raw usage events", async () => {
      const periodStart = new Date("2026-09-02T13:00:00.000Z");
      const periodEnd = new Date("2026-09-02T14:00:00.000Z");

      mockPrisma.usageEvent.groupBy.mockResolvedValue([
        { business_id: tenantA, metric: "messages_in", _sum: { quantity: 15 } },
        { business_id: tenantA, metric: "messages_out_ai", _sum: { quantity: 12 } },
        { business_id: tenantB, metric: "orders_created", _sum: { quantity: 3 } },
      ]);

      const result = await meteringService.syncUsageAggregates({
        periodStart,
        periodEnd,
      });

      expect(mockPrisma.usageEvent.groupBy).toHaveBeenCalledWith({
        by: ["business_id", "metric"],
        where: {
          recorded_at: {
            gte: periodStart,
            lt: periodEnd,
          },
          is_test: false,
        },
        _sum: {
          quantity: true,
        },
      });

      expect(mockPrisma.usageAggregate.upsert).toHaveBeenCalledTimes(3);
      expect(result.syncedCount).toBe(3);

      // Verify upsert parameters for Tenant A messages_in
      expect(mockPrisma.usageAggregate.upsert).toHaveBeenCalledWith({
        where: {
          business_id_period_start_metric: {
            business_id: tenantA,
            period_start: periodStart,
            metric: "messages_in",
          },
        },
        create: {
          business_id: tenantA,
          period_start: periodStart,
          period_end: periodEnd,
          metric: "messages_in",
          quantity: 15,
        },
        update: {
          period_end: periodEnd,
          quantity: 15,
        },
      });
    });

    it("filters by businessId when specified", async () => {
      const periodStart = new Date("2026-09-02T13:00:00.000Z");
      const periodEnd = new Date("2026-09-02T14:00:00.000Z");

      mockPrisma.usageEvent.groupBy.mockResolvedValue([
        { business_id: tenantA, metric: "messages_in", _sum: { quantity: 5 } },
      ]);

      await meteringService.syncUsageAggregates({
        periodStart,
        periodEnd,
        businessId: tenantA,
      });

      expect(mockPrisma.usageEvent.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: tenantA,
            is_test: false,
          }),
        }),
      );
    });
  });

  describe("MeteringProcessor BullMQ Worker", () => {
    it("processes a sync job with explicit periodStart and periodEnd", async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValue([
        { business_id: tenantA, metric: "messages_in", _sum: { quantity: 10 } },
      ]);

      const mockJob = {
        id: "job-1",
        name: SYNC_USAGE_AGGREGATES_JOB,
        data: {
          businessId: tenantA,
          periodStart: "2026-09-02T10:00:00.000Z",
          periodEnd: "2026-09-02T11:00:00.000Z",
        },
      } as unknown as Job<SyncUsageAggregatesJobData>;

      const result = await meteringProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(1);
      expect(result.periodStart).toBe("2026-09-02T10:00:00.000Z");
      expect(result.periodEnd).toBe("2026-09-02T11:00:00.000Z");
    });

    it("processes a sync job with referenceTime", async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValue([]);

      const mockJob = {
        id: "job-2",
        name: SYNC_USAGE_AGGREGATES_JOB,
        data: {
          referenceTime: "2026-09-02T14:25:30.000Z",
        },
      } as unknown as Job<SyncUsageAggregatesJobData>;

      const result = await meteringProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.periodStart).toBe("2026-09-02T14:00:00.000Z");
      expect(result.periodEnd).toBe("2026-09-02T15:00:00.000Z");
    });

    it("processes a sync job with hour string", async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValue([]);

      const mockJob = {
        id: "job-hour",
        name: SYNC_USAGE_AGGREGATES_JOB,
        data: {
          hour: "2026-09-02T16",
        },
      } as unknown as Job<SyncUsageAggregatesJobData>;

      const result = await meteringProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.periodStart).toBe("2026-09-02T16:00:00.000Z");
      expect(result.periodEnd).toBe("2026-09-02T17:00:00.000Z");
    });

    it("processes a sync job with default previous hour window when no time is given", async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValue([]);

      const mockJob = {
        id: "job-3",
        name: SYNC_USAGE_AGGREGATES_JOB,
        data: {},
      } as unknown as Job<SyncUsageAggregatesJobData>;

      const result = await meteringProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      const start = new Date(result.periodStart);
      const end = new Date(result.periodEnd);
      expect(end.getTime() - start.getTime()).toBe(3600 * 1000); // exactly 1 hour
    });

    it("pins time window to job.timestamp on retried/delayed manual-trigger execution", async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValue([]);

      // Manual triggerSync fired at 14:00:00 (window 13:00-14:00), worker executes at 16:30:00
      const scheduledTimeMs = new Date("2026-09-02T14:00:00.000Z").getTime();
      const mockJob = {
        id: "job-delayed",
        name: SYNC_USAGE_AGGREGATES_JOB,
        timestamp: scheduledTimeMs,
        // triggerSync payloads carry enqueuedAt; job.timestamp is also set to the enqueue time
        data: {
          enqueuedAt: scheduledTimeMs,
        },
      } as unknown as Job<SyncUsageAggregatesJobData>;

      const result = await meteringProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.periodStart).toBe("2026-09-02T13:00:00.000Z");
      expect(result.periodEnd).toBe("2026-09-02T14:00:00.000Z");
    });

    it("uses job.timestamp (not a stale boot-time enqueuedAt) for cron-produced scheduler ticks", async () => {
      // Regression guard for the frozen-window bug:
      // BullMQ copies the scheduler template data onto every tick. If enqueuedAt were baked
      // into the template at boot (e.g. 10:30), every later tick would produce the 09:00-10:00
      // window. The fix: templates carry no enqueuedAt; processJob must use job.timestamp.
      mockPrisma.usageEvent.groupBy.mockResolvedValue([]);

      // Simulate two successive hourly scheduler ticks. Neither carries enqueuedAt.
      const tick1Ms = new Date("2026-09-02T15:00:00.000Z").getTime(); // should yield 14:00-15:00
      const tick2Ms = new Date("2026-09-02T16:00:00.000Z").getTime(); // should yield 15:00-16:00

      for (const [tickMs, expectedStart, expectedEnd] of [
        [tick1Ms, "2026-09-02T14:00:00.000Z", "2026-09-02T15:00:00.000Z"],
        [tick2Ms, "2026-09-02T15:00:00.000Z", "2026-09-02T16:00:00.000Z"],
      ] as [number, string, string][]) {
        const mockJob = {
          id: `job-tick-${tickMs}`,
          name: SYNC_USAGE_AGGREGATES_JOB,
          timestamp: tickMs,
          data: {}, // No enqueuedAt — mirrors what BullMQ produces from the scheduler template
        } as unknown as Job<SyncUsageAggregatesJobData>;

        const result = await meteringProcessor.processJob(mockJob);

        expect(result.success).toBe(true);
        expect(result.periodStart).toBe(expectedStart);
        expect(result.periodEnd).toBe(expectedEnd);
      }
    });

    it("throws UnrecoverableError for invalid job payload (Finding 3)", async () => {
      const mockJob = {
        id: "job-invalid",
        name: SYNC_USAGE_AGGREGATES_JOB,
        data: {
          businessId: "not-a-valid-uuid",
        },
      } as unknown as Job<SyncUsageAggregatesJobData>;

      await expect(meteringProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);
    });

    it("throws UnrecoverableError when periodStart >= periodEnd (Finding 3)", async () => {
      const mockJob = {
        id: "job-invalid-dates",
        name: SYNC_USAGE_AGGREGATES_JOB,
        data: {
          periodStart: "2026-09-02T12:00:00.000Z",
          periodEnd: "2026-09-02T11:00:00.000Z",
        },
      } as unknown as Job<SyncUsageAggregatesJobData>;

      await expect(meteringProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);
    });

    it("throws UnrecoverableError for unexpected job names on the billing queue", async () => {
      // The billing queue carries only sync_usage_aggregates (spec 14 §7).
      // Any other job name is a misconfiguration; it must fail hard (not be silently
      // acknowledged and discarded as a successful no-op).
      const mockJob = {
        id: "job-other",
        name: "other_job_name",
        data: {},
      } as unknown as Job<SyncUsageAggregatesJobData>;

      await expect(meteringProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);
      await expect(meteringProcessor.processJob(mockJob)).rejects.toThrow(
        /Unexpected job 'other_job_name' on billing queue/,
      );
    });

    it("triggerSync enqueues a job with validated payload, pinned window, and matching jobId (Finding 2 & 5)", async () => {
      const res = await meteringProcessor.triggerSync({
        businessId: tenantA,
        periodStart: "2026-09-02T10:00:00.000Z",
        periodEnd: "2026-09-02T11:00:00.000Z",
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        SYNC_USAGE_AGGREGATES_JOB,
        expect.objectContaining({
          businessId: tenantA,
          periodStart: "2026-09-02T10:00:00.000Z",
          periodEnd: "2026-09-02T11:00:00.000Z",
        }),
        expect.objectContaining({
          jobId: `${tenantA}:sync:2026-09-02T10`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }),
      );
      expect(res).toEqual({ id: "job-123" });
    });

    it("triggerSync rejects invalid parameters (non-UUID, non-datetime, or unpaired periodStart) (Finding 5)", async () => {
      await expect(
        meteringProcessor.triggerSync({
          businessId: "invalid-uuid",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        meteringProcessor.triggerSync({
          periodStart: "not-a-date",
          periodEnd: "2026-09-02T11:00:00.000Z",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        meteringProcessor.triggerSync({
          periodStart: "2026-09-02T10:00:00.000Z", // missing periodEnd
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("handles lifecycle init and destroy cleanly (Finding 4)", async () => {
      await expect(meteringProcessor.onModuleInit()).resolves.not.toThrow();
      await expect(meteringProcessor.onModuleDestroy()).resolves.not.toThrow();
      expect(mockQueue.close).toHaveBeenCalled();
    });

    it("rethrows scheduler setup failure during bootstrap in production (Finding 1)", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const failingQueue = {
        ...mockQueue,
        upsertJobScheduler: jest.fn().mockRejectedValue(new Error("Redis connection lost")),
      };
      const failingProcessor = new MeteringProcessor(meteringService, failingQueue);

      await expect(failingProcessor.onModuleInit()).rejects.toThrow("Redis connection lost");

      process.env.NODE_ENV = originalEnv;
    });
  });
});
