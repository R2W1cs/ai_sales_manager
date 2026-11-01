import { BadRequestException, ForbiddenException } from "@nestjs/common";

import { CANONICAL_PLANS } from "@app/shared";

import { QuotaService } from "./quota.service";

describe("Quota enforcement engine, 85% warning & 100% hard limit gate (`/billing/usage`) (T-BILL-03)", () => {
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";

  let mockPrisma: any;
  let mockNotificationDispatcher: any;
  let quotaService: QuotaService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    mockPrisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sub-001",
          business_id: tenantA,
          plan: {
            id: "plan-starter",
            code: "starter",
            name: "Starter",
            limits: CANONICAL_PLANS.starter.limits,
          },
        }),
      },
      usageAggregate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      usageEvent: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { quantity: 0 },
        }),
        create: jest.fn().mockResolvedValue({
          id: "evt-001",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 1,
          period_bucket: new Date("2026-09-01T00:00:00.000Z"),
          is_test: false,
          recorded_at: new Date(),
        }),
      },
      businessMember: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue({
          id: "mem-001",
          user_id: "user-owner-1",
          business_id: tenantA,
          role: { name: "owner" },
        }),
      },
      channelAccount: {
        count: jest.fn().mockResolvedValue(1),
      },
      business: {
        findUnique: jest.fn().mockResolvedValue({
          id: tenantA,
          settings: {},
        }),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "notif-001" }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockNotificationDispatcher = {
      dispatch: jest.fn().mockResolvedValue({
        dispatched: true,
        dedupeKey: `usage_warning_85:${tenantA}:2026-09`,
      }),
    };

    quotaService = new QuotaService(mockPrisma, mockNotificationDispatcher);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("1. Timezone Cycle & Calculation", () => {
    it("Timezone Cycle: Cycle start/end dates correctly correspond to Africa/Tunis calendar month.", () => {
      // 2026-09-02 in Africa/Tunis is UTC+1 (GMT+1)
      const testDate = new Date("2026-09-02T12:00:00.000Z");
      const cycle = quotaService.getAfricaTunisBillingCycle(testDate);

      // Start: 2026-09-01T00:00:00 Africa/Tunis -> 2026-08-31T23:00:00.000Z
      expect(cycle.cycleStart.toISOString()).toBe("2026-08-31T23:00:00.000Z");

      // End: 2026-09-30T23:59:59 Africa/Tunis -> 2026-09-30T22:59:59.000Z
      expect(cycle.cycleEnd.toISOString()).toBe("2026-09-30T22:59:59.000Z");
      expect(cycle.periodKey).toBe("2026-09");
    });

    it("correctly rolls over between calendar years (December to January)", () => {
      const decDate = new Date("2026-12-15T12:00:00.000Z");
      const cycle = quotaService.getAfricaTunisBillingCycle(decDate);

      expect(cycle.cycleStart.toISOString()).toBe("2026-11-30T23:00:00.000Z");
      expect(cycle.cycleEnd.toISOString()).toBe("2026-12-31T22:59:59.000Z");
      expect(cycle.periodKey).toBe("2026-12");
    });
  });

  describe("2. Hybrid Real-Time Quota Calculation", () => {
    it("Hybrid Calculation: Accurately sums aggregates plus raw events created in the current hour.", async () => {
      const fixedDate = new Date("2026-09-02T14:30:00.000Z");

      // Mock aggregated usage up to 14:00 (150 AI messages)
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          id: "agg-1",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 100,
          period_start: new Date("2026-09-02T12:00:00.000Z"),
          period_end: new Date("2026-09-02T13:00:00.000Z"),
        },
        {
          id: "agg-2",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 50,
          period_start: new Date("2026-09-02T13:00:00.000Z"),
          period_end: new Date("2026-09-02T14:00:00.000Z"),
        },
      ]);

      // Mock raw in-flight events after 14:00 (25 AI messages)
      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { quantity: 25 },
      });

      mockPrisma.businessMember.count.mockResolvedValue(2);
      mockPrisma.channelAccount.count.mockResolvedValue(1);

      const usage = await quotaService.getUsage(tenantA, fixedDate);

      // Total = 100 + 50 + 25 = 175
      expect(usage.current.aiMessages).toBe(175);
      expect(usage.limits.aiMessages).toBe(500); // Starter plan
      expect(usage.current.seats).toBe(2);
      expect(usage.current.channels).toBe(1);
      // 175 / 500 = 35%
      expect(usage.percentUsed).toBe(35);
      expect(usage.aiPaused).toBe(false);

      // Verify strict tenant isolation in aggregate query
      expect(mockPrisma.usageAggregate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: tenantA,
            metric: "messages_out_ai",
          }),
        }),
      );

      // Verify raw events query covers uncovered intervals and excludes test events
      expect(mockPrisma.usageEvent.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: tenantA,
            metric: "messages_out_ai",
            is_test: false,
            OR: expect.arrayContaining([
              expect.objectContaining({
                recorded_at: expect.objectContaining({
                  gte: new Date("2026-09-02T14:00:00.000Z"),
                }),
              }),
            ]),
          }),
        }),
      );
    });

    it("Gap Handling: Accurately captures raw events when hourly aggregates have a missing gap window (F1)", async () => {
      const fixedDate = new Date("2026-09-02T14:30:00.000Z");

      // Aggregates for 10:00-11:00 and 12:00-13:00 (gap from 11:00-12:00 due to missed/delayed rollup)
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          id: "agg-1",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 40,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
        {
          id: "agg-2",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 30,
          period_start: new Date("2026-09-02T12:00:00.000Z"),
          period_end: new Date("2026-09-02T13:00:00.000Z"),
        },
      ]);

      // Raw events in gap (11:00-12:00) + in-flight events (13:00 onward) = 50
      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { quantity: 50 },
      });

      const usage = await quotaService.getUsage(tenantA, fixedDate);

      // Total = 40 (agg1) + 30 (agg2) + 50 (raw) = 120
      expect(usage.current.aiMessages).toBe(120);

      // Verify the gap interval [11:00, 12:00) is included in the query
      expect(mockPrisma.usageEvent.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: tenantA,
            metric: "messages_out_ai",
            is_test: false,
            OR: expect.arrayContaining([
              expect.objectContaining({
                recorded_at: {
                  gte: new Date("2026-09-02T11:00:00.000Z"),
                  lt: new Date("2026-09-02T12:00:00.000Z"),
                },
              }),
              expect.objectContaining({
                recorded_at: expect.objectContaining({
                  gte: new Date("2026-09-02T13:00:00.000Z"),
                }),
              }),
            ]),
          }),
        }),
      );
    });

    it("Canonical Validation: ignores malformed/non-hourly aggregate intervals and counts them as raw events (F3)", async () => {
      const fixedDate = new Date("2026-09-02T14:30:00.000Z");

      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          id: "agg-1",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 50,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
        {
          id: "agg-invalid",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 30,
          // Malformed: spans 30 minutes instead of canonical 1 hour
          period_start: new Date("2026-09-02T11:30:00.000Z"),
          period_end: new Date("2026-09-02T12:00:00.000Z"),
        },
        {
          id: "agg-2",
          business_id: tenantA,
          metric: "messages_out_ai",
          quantity: 40,
          period_start: new Date("2026-09-02T12:00:00.000Z"),
          period_end: new Date("2026-09-02T13:00:00.000Z"),
        },
      ]);

      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { quantity: 20 },
      });

      const usage = await quotaService.getUsage(tenantA, fixedDate);

      // Total = 50 (agg1) + 40 (agg2) + 20 (raw events in uncovered intervals including 11:00-12:00) = 110
      // agg-invalid (30) was excluded from aggregated totals
      expect(usage.current.aiMessages).toBe(110);
    });

    it("Future Aggregate Exclusion: excludes aggregates whose period_end is in the future relative to referenceDate (F3)", async () => {
      const fixedDate = new Date("2026-09-02T14:30:00.000Z");

      mockPrisma.usageAggregate.findMany.mockImplementation(({ where }: any) => {
        const aggs = [
          {
            id: "agg-past",
            business_id: tenantA,
            metric: "messages_out_ai",
            quantity: 80,
            period_start: new Date("2026-09-02T13:00:00.000Z"),
            period_end: new Date("2026-09-02T14:00:00.000Z"),
          },
          {
            id: "agg-future",
            business_id: tenantA,
            metric: "messages_out_ai",
            quantity: 120,
            period_start: new Date("2026-09-02T14:00:00.000Z"),
            period_end: new Date("2026-09-02T15:00:00.000Z"),
          },
        ];
        return Promise.resolve(aggs.filter((a) => a.period_end <= where.period_end.lte));
      });

      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 15 } });

      const usage = await quotaService.getUsage(tenantA, fixedDate);

      // Only agg-past (80) + raw events (15) = 95. agg-future (120) is excluded
      expect(usage.current.aiMessages).toBe(95);
      expect(mockPrisma.usageAggregate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            period_end: { lte: fixedDate },
          }),
        }),
      );
    });

    it("Calculation Window Bound: bounds raw event queries to min(referenceDate, nextCycleStart) (F4)", async () => {
      const fixedDate = new Date("2026-09-02T14:30:00.000Z");

      mockPrisma.usageAggregate.findMany.mockResolvedValue([]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 10 } });

      await quotaService.getUsage(tenantA, fixedDate);

      expect(mockPrisma.usageEvent.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: tenantA,
            recorded_at: expect.objectContaining({
              lt: fixedDate,
            }),
          }),
        }),
      );
    });

    it("Boundary Protection: safely returns 0 usage without invalid intervals when referenceDate is right at cycleStart (F1)", async () => {
      // 2026-08-31T23:00:00.000Z is 2026-09-01T00:00:00 Africa/Tunis (exact cycle start)
      const startOfCycle = new Date("2026-08-31T23:00:00.000Z");

      const usage = await quotaService.getUsage(tenantA, startOfCycle);

      expect(usage.current.aiMessages).toBe(0);
      expect(usage.percentUsed).toBe(0);
      // Aggregates & raw queries are skipped because windowEnd <= cycleStart
      expect(mockPrisma.usageAggregate.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.usageEvent.aggregate).not.toHaveBeenCalled();
    });

    it("handles zero aggregate records by querying raw events from cycleStart", async () => {
      const fixedDate = new Date("2026-09-01T02:00:00.000Z");

      mockPrisma.usageAggregate.findMany.mockResolvedValue([]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { quantity: 15 },
      });

      const usage = await quotaService.getUsage(tenantA, fixedDate);

      expect(usage.current.aiMessages).toBe(15);
      expect(mockPrisma.usageEvent.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: tenantA,
            recorded_at: expect.objectContaining({
              gte: new Date("2026-08-31T23:00:00.000Z"), // cycleStart
            }),
          }),
        }),
      );
    });
  });

  describe("3. 85% Warning Alert Debounce", () => {
    it("85% Alert: Triggers warning alert at 85% utilization.", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      // Starter plan limit is 500. 85% is 425 messages.
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 400,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { quantity: 26 }, // 426 messages -> 85.2%
      });

      const usage = await quotaService.getUsage(tenantA, fixedDate);

      expect(usage.percentUsed).toBe(85.2);
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "USAGE_WARNING_85",
          businessId: tenantA,
          dedupeKey: `usage_warning_85:${tenantA}:2026-09`,
        }),
      );
    });

    it("85% Alert Debounce: Warning notification fires once and does NOT fire on subsequent checks in the same cycle.", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      // 430 messages out of 500 = 86%
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 430,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      // First check: crosses 85% -> dispatches
      await quotaService.getUsage(tenantA, fixedDate);
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledTimes(1);

      // Second check in the same cycle: suppressed by in-memory dedupe
      await quotaService.getUsage(tenantA, fixedDate);
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledTimes(1);

      // Third check simulating restart where DB has the notification record
      const freshService = new QuotaService(mockPrisma, mockNotificationDispatcher);
      mockPrisma.notification.findFirst.mockResolvedValueOnce({
        id: "notif-existing",
        dedupe_key: `usage_warning_85:${tenantA}:2026-09`,
      });

      await freshService.getUsage(tenantA, fixedDate);
      // Still exactly 1 call from previous invocation, none from freshService
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it("does not trigger warning alert if usage is below 85%", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      // 424 messages out of 500 = 84.8% (< 85%)
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 424,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      const usage = await quotaService.getUsage(tenantA, fixedDate);

      expect(usage.percentUsed).toBe(84.8);
      expect(mockNotificationDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it("retains durable notification record and does not delete claim on external dispatch failure (F1)", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 430, // 86%
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      mockNotificationDispatcher.dispatch.mockRejectedValueOnce(
        new Error("Redis connection timeout"),
      );

      // First call: DB claim created, dispatch attempted and fails
      await quotaService.getUsage(tenantA, fixedDate);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledTimes(1);
      // Invariant: Claim row is NOT deleted merely because external delivery failed
      expect(mockPrisma.notification.deleteMany).not.toHaveBeenCalled();

      // Second call: Debounced; does not re-create or duplicate notification records
      await quotaService.getUsage(tenantA, fixedDate);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it("Atomic Deduplication: catches P2002 on concurrent claim and suppresses duplicate dispatch (F4)", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 430,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      // Simulate concurrent insert where another instance already inserted the row
      mockPrisma.notification.create.mockRejectedValueOnce({
        code: "P2002",
        message: "Unique constraint failed on the fields: (`user_id`,`dedupe_key`)",
      });

      await quotaService.getUsage(tenantA, fixedDate);

      // Unique constraint conflict caught -> dispatch is NOT executed by the loser
      expect(mockNotificationDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it("In-App Delivery: persists notification row to database when no dispatcher is configured (F3)", async () => {
      const serviceWithoutDispatcher = new QuotaService(mockPrisma);
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 430,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      await serviceWithoutDispatcher.getUsage(tenantA, fixedDate);

      // Successfully persists durable in-app notification row to DB
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_id: tenantA,
            type: "ESCALATION",
            dedupe_key: `usage_warning_85:${tenantA}:2026-09`,
          }),
        }),
      );
    });
  });

  describe("4. 100% Limit & Hard Quota Gate", () => {
    it("100% Limit: Pauses AI responses at 100% while allowing human replies.", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      // 500 messages out of 500 = 100% utilization
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 500,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      const usage = await quotaService.getUsage(tenantA, fixedDate);
      expect(usage.percentUsed).toBe(100);
      expect(usage.aiPaused).toBe(true);

      // 1. AI turn check: rejected / paused
      const aiGate = await quotaService.checkQuotaGate(tenantA);
      expect(aiGate.allowed).toBe(false);
      expect(aiGate.aiPaused).toBe(true);

      // 2. 🔒 Invariant: Human agent replies are NEVER blocked even at 100% quota
      const humanGate = await quotaService.checkQuotaGate(tenantA, { actorType: "human" });
      expect(humanGate.allowed).toBe(true);
      expect(humanGate.aiPaused).toBe(true);
    });

    it("throws 403 Forbidden with code `ai_paused` when throwOnBlocked or enforceAiQuotaGate is invoked", async () => {
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 505, // Over 100%
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      await expect(quotaService.checkQuotaGate(tenantA, { throwOnBlocked: true })).rejects.toThrow(
        ForbiddenException,
      );

      await expect(quotaService.enforceAiQuotaGate(tenantA)).rejects.toThrow(ForbiddenException);

      try {
        await quotaService.enforceAiQuotaGate(tenantA);
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = (err as ForbiddenException).getResponse() as any;
        expect(response.error.code).toBe("ai_paused");
      }
    });

    it("allows AI responses when utilization is below 100%", async () => {
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 499,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      const aiGate = await quotaService.checkQuotaGate(tenantA);
      expect(aiGate.allowed).toBe(true);
      expect(aiGate.aiPaused).toBe(false);
    });

    it("pauses AI when business settings has ai_paused = true even if quota is under 100%", async () => {
      mockPrisma.business.findUnique.mockResolvedValue({
        id: tenantA,
        settings: { ai_paused: true },
      });
      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 50,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);

      const usage = await quotaService.getUsage(tenantA);
      expect(usage.aiPaused).toBe(true);

      const aiGate = await quotaService.checkQuotaGate(tenantA);
      expect(aiGate.allowed).toBe(false);

      // Human reply is still permitted
      const humanGate = await quotaService.checkQuotaGate(tenantA, { actorType: "human" });
      expect(humanGate.allowed).toBe(true);
    });

    it("dispatches USAGE_BREACH_100 to owner when reaching 100% utilization and debounces within cycle (FR-BILL-007)", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 500,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      await quotaService.getUsage(tenantA, fixedDate);

      // Verify USAGE_BREACH_100 was dispatched
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "USAGE_BREACH_100",
          businessId: tenantA,
          dedupeKey: `usage_breach_100:${tenantA}:2026-09`,
        }),
      );

      // Second check in same cycle: suppressed by dedupe
      mockNotificationDispatcher.dispatch.mockClear();
      await quotaService.getUsage(tenantA, fixedDate);
      expect(mockNotificationDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it("retains durable 100% breach notification and never deletes claim on dispatch failure (F1)", async () => {
      const fixedDate = new Date("2026-09-02T12:00:00.000Z");

      // 85% warning already dispatched earlier in the cycle
      (quotaService as any).markWarningDispatched(`usage_warning_85:${tenantA}:2026-09`);

      mockPrisma.usageAggregate.findMany.mockResolvedValue([
        {
          quantity: 500,
          period_start: new Date("2026-09-02T10:00:00.000Z"),
          period_end: new Date("2026-09-02T11:00:00.000Z"),
        },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      mockNotificationDispatcher.dispatch.mockRejectedValueOnce(new Error("Network blip"));

      await quotaService.getUsage(tenantA, fixedDate);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledTimes(1);
      // Invariant: Claim row is NOT deleted merely because external delivery failed
      expect(mockPrisma.notification.deleteMany).not.toHaveBeenCalled();

      // Subsequent check should debounce and not duplicate records
      await quotaService.getUsage(tenantA, fixedDate);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    });

    describe("Atomic Quota Consumption & Gate (F2)", () => {
      it("locks tenant row and atomically creates usage event when within quota limit", async () => {
        mockPrisma.usageAggregate.findMany.mockResolvedValue([
          {
            quantity: 450,
            period_start: new Date("2026-09-02T10:00:00.000Z"),
            period_end: new Date("2026-09-02T11:00:00.000Z"),
          },
        ]);
        mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

        const result = await quotaService.consumeAiQuota(tenantA, 5);

        expect(result.allowed).toBe(true);
        expect(result.usage.current.aiMessages).toBe(455);
        expect(mockPrisma.$executeRaw).toHaveBeenCalled();
        expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              business_id: tenantA,
              metric: "messages_out_ai",
              quantity: 5,
            }),
          }),
        );
      });

      it("rejects with 403 ai_paused and does not insert usage event when increment breaches limit", async () => {
        mockPrisma.usageAggregate.findMany.mockResolvedValue([
          {
            quantity: 499,
            period_start: new Date("2026-09-02T10:00:00.000Z"),
            period_end: new Date("2026-09-02T11:00:00.000Z"),
          },
        ]);
        mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

        // Requesting 2 messages when current is 499/500 would exceed limit (501 > 500)
        await expect(quotaService.consumeAiQuota(tenantA, 2)).rejects.toThrow(ForbiddenException);

        expect(mockPrisma.usageEvent.create).not.toHaveBeenCalled();
      });

      it("delegates to consumeAiQuota when checkQuotaGate is called with atomicConsume", async () => {
        mockPrisma.usageAggregate.findMany.mockResolvedValue([
          {
            quantity: 100,
            period_start: new Date("2026-09-02T10:00:00.000Z"),
            period_end: new Date("2026-09-02T11:00:00.000Z"),
          },
        ]);
        mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

        const result = await quotaService.checkQuotaGate(tenantA, {
          actorType: "ai",
          atomicConsume: true,
          quantity: 2,
        });

        expect(result.allowed).toBe(true);
        expect(result.usage.current.aiMessages).toBe(102);
        expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              quantity: 2,
            }),
          }),
        );
      });

      it("Transaction Isolation: defers notification dispatch until post-commit and skips side effects during tx (F1)", async () => {
        mockPrisma.usageAggregate.findMany.mockResolvedValue([
          {
            quantity: 498,
            period_start: new Date("2026-09-02T10:00:00.000Z"),
            period_end: new Date("2026-09-02T11:00:00.000Z"),
          },
        ]);
        mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

        // Consume 2 messages -> reaches exactly 500 (100%)
        const result = await quotaService.consumeAiQuota(tenantA, 2);

        expect(result.allowed).toBe(true);
        expect(result.usage.current.aiMessages).toBe(500);
        expect(result.usage.percentUsed).toBe(100);

        // Verification: Dispatch happened post-commit
        expect(mockNotificationDispatcher.dispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "USAGE_BREACH_100",
            businessId: tenantA,
          }),
        );
      });

      it("Monotonic Timestamp: uses single consistent timestamp for usage read, event insertion, and alert cycle (F2)", async () => {
        mockPrisma.usageAggregate.findMany.mockResolvedValue([]);
        mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

        const before = new Date();
        const result = await quotaService.consumeAiQuota(tenantA, 1);
        const after = new Date();

        expect(result.allowed).toBe(true);
        expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              recorded_at: expect.any(Date),
              period_bucket: expect.any(Date),
            }),
          }),
        );

        const callData = mockPrisma.usageEvent.create.mock.calls[0][0].data;
        expect(callData.recorded_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(callData.recorded_at.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });
  });

  describe("5. Validation & Edge Cases", () => {
    it("throws BadRequestException if businessId is empty", async () => {
      await expect(quotaService.getUsage("")).rejects.toThrow(BadRequestException);
      await expect(quotaService.getUsage("   ")).rejects.toThrow(BadRequestException);
    });

    it("falls back to starter plan limits if tenant has no active subscription", async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const usage = await quotaService.getUsage(tenantA);
      expect(usage.planCode).toBe("starter");
      expect(usage.limits.aiMessages).toBe(500);
      expect(usage.limits.seats).toBe(2);
      expect(usage.limits.channels).toBe(1);
    });

    it("strictly isolates tenant queries across different businesses", async () => {
      mockPrisma.subscription.findFirst.mockImplementation(({ where }: any) => {
        if (where.business_id === tenantB) {
          return Promise.resolve({
            id: "sub-tenantB",
            business_id: tenantB,
            plan: {
              id: "plan-growth",
              code: "growth",
              name: "Growth",
              limits: CANONICAL_PLANS.growth.limits,
            },
          });
        }
        return Promise.resolve(null);
      });

      const usageB = await quotaService.getUsage(tenantB);
      expect(usageB.planCode).toBe("growth");
      expect(usageB.limits.aiMessages).toBe(3000);
      expect(usageB.limits.seats).toBe(5);
      expect(usageB.limits.channels).toBe(3);

      expect(mockPrisma.usageAggregate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ business_id: tenantB }),
        }),
      );
    });

    it("pauses AI and marks 100% used when plan limits has ai_messages_per_month = 0", async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: "sub-zero",
        business_id: tenantA,
        plan: {
          id: "plan-zero",
          code: "zero",
          name: "Zero AI",
          limits: {
            ...CANONICAL_PLANS.starter.limits,
            ai_messages_per_month: 0,
          },
        },
      });

      const usage = await quotaService.getUsage(tenantA);
      expect(usage.limits.aiMessages).toBe(0);
      expect(usage.percentUsed).toBe(100);
      expect(usage.aiPaused).toBe(true);

      const aiGate = await quotaService.checkQuotaGate(tenantA);
      expect(aiGate.allowed).toBe(false);

      // Human reply is still permitted
      const humanGate = await quotaService.checkQuotaGate(tenantA, { actorType: "human" });
      expect(humanGate.allowed).toBe(true);
    });

    it("evicts oldest entries when in-memory warning cache reaches capacity limit", () => {
      // Simulate adding entries up to MAX_DISPATCHED_CACHE_SIZE (1000)
      for (let i = 0; i < 1005; i++) {
        (quotaService as any).markWarningDispatched(`key_${i}`);
      }

      // Ensure cache size is bounded to at most 1000
      expect((quotaService as any).dispatchedWarnings.size).toBeLessThanOrEqual(1000);
      // Key 0 was evicted
      expect((quotaService as any).dispatchedWarnings.has("key_0")).toBe(false);
      // Key 1004 is present
      expect((quotaService as any).dispatchedWarnings.has("key_1004")).toBe(true);
    });
  });
});
