import { NotFoundException } from "@nestjs/common";
import { MessageDirection, SenderType, Prisma, OrderStatus } from "@prisma/client";
import { type Job, UnrecoverableError } from "bullmq";

import {
  DailyRollupProcessor,
  ROLLUP_DAILY_JOB,
  type RollupDailyJobData,
} from "./daily-rollup.processor";
import {
  DailyRollupService,
  getTimezoneDayBounds,
  getYesterdayStringInTimezone,
} from "./daily-rollup.service";

describe("Daily analytics aggregation worker & materialization pipeline (T-ANL-01)", () => {
  const businessId = "11111111-1111-4111-8111-111111111111";
  const businessTimezone = "Africa/Tunis";
  const targetDay = "2026-08-27";

  let mockPrisma: any;
  let service: DailyRollupService;
  let mockQueue: any;
  let processor: DailyRollupProcessor;

  beforeEach(() => {
    mockPrisma = {
      business: {
        findUnique: jest.fn().mockResolvedValue({
          id: businessId,
          timezone: businessTimezone,
        }),
        findMany: jest.fn().mockResolvedValue([{ id: businessId, timezone: businessTimezone }]),
      },
      order: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
      conversationStatusEvent: {
        findMany: jest.fn(),
      },
      analyticsDaily: {
        upsert: jest.fn().mockImplementation(({ create, update }) =>
          Promise.resolve({
            business_id: businessId,
            day: new Date(`${targetDay}T00:00:00.000Z`),
            ...create,
            ...update,
            updated_at: new Date(),
          }),
        ),
        findUnique: jest.fn(),
      },
    };

    service = new DailyRollupService(mockPrisma);

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-001" }),
      addBulk: jest.fn().mockResolvedValue([{ id: "job-001" }, { id: "job-002" }]),
      upsertJobScheduler: jest.fn().mockResolvedValue({}),
      getJobSchedulers: jest.fn().mockResolvedValue([]),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    };

    processor = new DailyRollupProcessor(service, mockQueue);
  });

  describe("Timezone Day Bounds", () => {
    it("correctly maps Africa/Tunis calendar day to UTC bounds (UTC+1)", () => {
      const { start, end } = getTimezoneDayBounds("2026-08-27", "Africa/Tunis");

      // In Africa/Tunis (UTC+1), 2026-08-27 00:00 is 2026-08-26 23:00 UTC
      expect(start.toISOString()).toBe("2026-08-26T23:00:00.000Z");
      expect(end.toISOString()).toBe("2026-08-27T23:00:00.000Z");
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it("correctly handles daylight-saving spring-forward transition (23-hour day)", () => {
      // America/New_York transitions on 2026-03-08 (spring forward at 02:00 local time)
      // At local midnight, offset is UTC-5 -> 05:00 UTC. Next day local midnight is UTC-4 -> 04:00 UTC.
      const { start, end } = getTimezoneDayBounds("2026-03-08", "America/New_York");

      expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
      expect(end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
      expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
    });

    it("correctly handles daylight-saving fall-back transition (25-hour day)", () => {
      // America/New_York transitions on 2026-11-01 (fall back at 02:00 local time)
      // At local midnight, offset is UTC-4 -> 04:00 UTC. Next day local midnight is UTC-5 -> 05:00 UTC.
      const { start, end } = getTimezoneDayBounds("2026-11-01", "America/New_York");

      expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
      expect(end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
      expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
    });

    it("throws an error when date string is not in YYYY-MM-DD format", () => {
      expect(() => getTimezoneDayBounds("invalid-date", "Africa/Tunis")).toThrow(
        /Invalid date format: expected YYYY-MM-DD/,
      );
    });

    it("throws an error for syntactically valid but semantically invalid dates", () => {
      expect(() => getTimezoneDayBounds("2026-02-31", "Africa/Tunis")).toThrow(
        /Invalid calendar date: '2026-02-31' does not exist in Gregorian calendar/,
      );
      expect(() => getTimezoneDayBounds("2026-13-01", "Africa/Tunis")).toThrow(
        /Invalid calendar date: '2026-13-01' does not exist in Gregorian calendar/,
      );
      expect(() => getTimezoneDayBounds("2026-00-00", "Africa/Tunis")).toThrow(
        /Invalid calendar date: '2026-00-00' does not exist in Gregorian calendar/,
      );
    });

    it("verifies exact local midnight 00:00:00 across standard, fractional, and DST timezones", () => {
      const testCases = [
        { tz: "Africa/Tunis", date: "2026-08-27" }, // UTC+1
        { tz: "Asia/Kolkata", date: "2026-08-27" }, // UTC+5:30
        { tz: "Asia/Kathmandu", date: "2026-08-27" }, // UTC+5:45
        { tz: "America/New_York", date: "2026-03-08" }, // DST spring forward (23h)
        { tz: "America/New_York", date: "2026-11-01" }, // DST fall back (25h)
        { tz: "Europe/London", date: "2026-03-29" }, // DST spring forward (23h)
      ];

      for (const { tz, date } of testCases) {
        const { start, end } = getTimezoneDayBounds(date, tz);

        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });

        const formatParts = (d: Date) => {
          const parts = formatter.formatToParts(d);
          const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";
          const rawHour = getPart("hour");
          const hour = rawHour === "24" ? "00" : rawHour;
          return `${hour}:${getPart("minute")}:${getPart("second")}`;
        };

        expect(formatParts(start)).toBe("00:00:00");
        expect(formatParts(end)).toBe("00:00:00");
        expect(start.getTime()).toBeLessThan(end.getTime());
      }
    });

    it("rejects unsupported years outside 1970-2100", () => {
      expect(() => getTimezoneDayBounds("0001-01-01", "Africa/Tunis")).toThrow(
        /Unsupported year '1' in date '0001-01-01': must be between 1970 and 2100/,
      );
      expect(() => getTimezoneDayBounds("2101-01-01", "Africa/Tunis")).toThrow(
        /Unsupported year '2101' in date '2101-01-01': must be between 1970 and 2100/,
      );
    });

    it("computes yesterday date string in Africa/Tunis timezone", () => {
      // 2026-08-28 00:05 UTC is 2026-08-28 01:05 Tunis -> yesterday is 2026-08-27
      const now = new Date("2026-08-28T00:05:00.000Z");
      const yesterday = getYesterdayStringInTimezone(now, "Africa/Tunis");
      expect(yesterday).toBe("2026-08-27");
    });

    it("throws an error when getYesterdayStringInTimezone receives an invalid timezone", () => {
      expect(() => getYesterdayStringInTimezone(new Date(), "Invalid/Unknown_Zone")).toThrow();
    });
  });

  describe("Rollup Math & Metrics Calculation", () => {
    it("Rollup Math: Correctly calculates GMV, order count, and AI resolution percentage.", async () => {
      const { start, end } = getTimezoneDayBounds(targetDay, businessTimezone);
      mockPrisma.order.count.mockImplementation((args: any) => {
        if (args.where.created_by_type === "ai") {
          expect(args.where.business_id).toBe(businessId);
          expect(args.where.is_test).toBe(false);
          expect(args.where.created_at).toEqual({ gte: start, lt: end });
          if (args.where.order_confirmed_at) {
            expect(args.where.order_confirmed_at).toEqual({ gte: start, lt: end });
            // conversionConfirmed: AI created and confirmed in period (per 01 §15 line 93)
            return Promise.resolve(1);
          }
          // conversionAiPending: AI created in pending confirmation
          return Promise.resolve(2);
        }
        // ordersCreated
        return Promise.resolve(3);
      });

      // Confirmed/Completed non-test orders reaching confirmation on target day
      // Order 1: 15.000 TND = 15,000 millimes (CONFIRMED, created by AI)
      // Order 2: 25.500 TND = 25,500 millimes (COMPLETED, created by human)
      // Strictly excludes CANCELLED, PENDING_CONFIRMATION, and test orders
      mockPrisma.order.findMany.mockResolvedValue([{ total: "15.000" }, { total: "25.500" }]);

      // 2. Mock Messages
      // Inbound customer messages across 2 conversations: conv-1, conv-2
      mockPrisma.message.findMany.mockImplementation((args: any) => {
        if (args.where.direction === MessageDirection.inbound) {
          return Promise.resolve([
            { id: "msg-in-1", conversation_id: "conv-1" },
            { id: "msg-in-2", conversation_id: "conv-1" },
            { id: "msg-in-3", conversation_id: "conv-2" },
          ]);
        }
        if (args.where.direction === MessageDirection.outbound) {
          // Outbound messages: 2 AI replies, 1 human reply
          return Promise.resolve([
            {
              sender_type: SenderType.ai,
              ai_metadata: { latency_ms: 600 },
            },
            {
              sender_type: SenderType.ai,
              ai_metadata: { latency_ms: 800 },
            },
            {
              sender_type: SenderType.human,
              ai_metadata: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      // 3. Mock Conversation Status Events (Handoffs)
      // 1 handoff event on conv-2 with reason purchase_handoff
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([
        {
          conversation_id: "conv-2",
          escalation_reason: "purchase_handoff",
        },
      ]);

      const result = await service.rollupBusiness(businessId, targetDay);

      // Verify Commercial GMV & Orders Math
      // Total GMV = 15,000 + 25,500 = 40,500 millimes
      expect(result.revenue).toBe(40500);
      expect(result.ordersCount).toBe(2);
      expect(result.orders_created).toBe(3);

      // Verify Conversation & Messaging Volume
      expect(result.messages_handled).toBe(3);
      expect(result.messages_ai).toBe(2);
      expect(result.messages_human).toBe(1);
      expect(result.conversationsCount).toBe(2);

      // Verify AI Latency & Performance Math
      // Avg latency = (600 + 800) / 2 = 700 ms
      expect(result.avgResponseTimeMs).toBe(700);

      // Verify Handoffs & Escalation Breakdown
      expect(result.handoffs_total).toBe(1);
      expect(result.handoffs_by_reason).toEqual({
        purchase_handoff: 1,
      });

      // Verify AI Resolution Rate
      // Active convs: conv-1, conv-2. conv-2 escalated, conv-1 resolved by AI.
      // aiResolutionRate = 1 / 2 = 0.5 (50%)
      expect(result.aiHandledCount).toBe(1);
      expect(result.aiResolutionRate).toBe(0.5);

      // Verify Conversion Rate
      // conversion_confirmed = 1, conversion_ai_pending = 2 -> 1 / 2 = 0.5
      expect(result.conversion_confirmed).toBe(1);
      expect(result.conversion_ai_pending).toBe(2);
      expect(result.conversionRate).toBe(0.5);

      // Verify Database Upsert
      expect(mockPrisma.analyticsDaily.upsert).toHaveBeenCalledWith({
        where: {
          business_id_day: {
            business_id: businessId,
            day: new Date(`${targetDay}T00:00:00.000Z`),
          },
        },
        create: expect.objectContaining({
          business_id: businessId,
          messages_handled: 3,
          messages_ai: 2,
          messages_human: 1,
          orders_created: 3,
          handoffs_total: 1,
          handoffs_by_reason: { purchase_handoff: 1 },
          conversion_confirmed: 1,
          conversion_ai_pending: 2,
        }),
        update: expect.objectContaining({
          messages_handled: 3,
          messages_ai: 2,
          messages_human: 1,
          orders_created: 3,
          handoffs_total: 1,
          handoffs_by_reason: { purchase_handoff: 1 },
          conversion_confirmed: 1,
          conversion_ai_pending: 2,
        }),
      });
    });

    it("handles zero activity day gracefully without division-by-zero errors", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      const result = await service.rollupBusiness(businessId, targetDay);

      expect(result.revenue).toBe(0);
      expect(result.ordersCount).toBe(0);
      expect(result.messages_handled).toBe(0);
      expect(result.messages_ai).toBe(0);
      expect(result.messages_human).toBe(0);
      expect(result.conversationsCount).toBe(0);
      expect(result.aiResolutionRate).toBeNull();
      expect(result.conversionRate).toBeNull();
      expect(result.avgResponseTimeMs).toBe(0);
      expect(result.handoffs_total).toBe(0);
      expect(result.handoffs_by_reason).toEqual({});
    });

    it("calculates revenue with exact Decimal precision avoiding floating-point drift", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      // 0.001 TND = 1 millime, 19.999 TND = 19999 millimes, 12345.678 TND = 12345678 millimes
      mockPrisma.order.findMany.mockResolvedValue([
        { total: new Prisma.Decimal("0.001") },
        { total: new Prisma.Decimal("19.999") },
        { total: new Prisma.Decimal("12345.678") },
      ]);

      const result = await service.rollupBusiness(businessId, targetDay);

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
        where: {
          business_id: businessId,
          is_test: false,
          status: { in: [OrderStatus.CONFIRMED, OrderStatus.COMPLETED] },
          OR: [
            { order_confirmed_at: { gte: expect.any(Date), lt: expect.any(Date) } },
            {
              order_confirmed_at: null,
              created_at: { gte: expect.any(Date), lt: expect.any(Date) },
            },
          ],
        },
        select: {
          total: true,
        },
      });

      expect(result.ordersCount).toBe(3);
      // 1 + 19999 + 12345678 = 12365678 millimes
      expect(result.revenue).toBe(12365678);
    });

    it("rejects rollup when an order has a negative total", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([{ total: new Prisma.Decimal("-15.000") }]);

      await expect(service.rollupBusiness(businessId, targetDay)).rejects.toThrow(
        /Invalid order total: value must be finite and non-negative/,
      );
    });

    it("rejects rollup when an order total is NaN or non-finite", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([{ total: new Prisma.Decimal("NaN") }]);

      await expect(service.rollupBusiness(businessId, targetDay)).rejects.toThrow(
        /Invalid order total: value must be finite and non-negative/,
      );
    });

    it("rejects rollup when order total overflows safe integer millimes", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);
      // 1e16 TND -> 1e19 millimes which exceeds Number.MAX_SAFE_INTEGER (9e15)
      mockPrisma.order.findMany.mockResolvedValue([
        { total: new Prisma.Decimal("10000000000000000") },
      ]);

      await expect(service.rollupBusiness(businessId, targetDay)).rejects.toThrow(
        /Revenue overflow: aggregate millimes exceeds safe integer limits/,
      );
    });

    it("handles very large valid order totals with exact Decimal precision", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);
      // 9,007,199,254.740 TND -> 9,007,199,254,740 millimes (< MAX_SAFE_INTEGER 9,007,199,254,740,991)
      mockPrisma.order.findMany.mockResolvedValue([
        { total: new Prisma.Decimal("9007199254.740") },
      ]);

      const result = await service.rollupBusiness(businessId, targetDay);
      expect(result.revenue).toBe(9007199254740);
    });

    it("ensures conversionConfirmedCount strictly requires order_confirmed_at within [start, end)", async () => {
      const { start, end } = getTimezoneDayBounds(targetDay, businessTimezone);

      mockPrisma.order.count.mockImplementation((args: any) => {
        if (args.where.created_by_type === "ai") {
          if (args.where.order_confirmed_at) {
            // Numerator: orders created by AI in period reaching confirmed in period
            expect(args.where.business_id).toBe(businessId);
            expect(args.where.is_test).toBe(false);
            expect(args.where.created_at).toEqual({ gte: start, lt: end });
            expect(args.where.order_confirmed_at).toEqual({ gte: start, lt: end });
            expect(args.where.OR).toBeUndefined();
            return Promise.resolve(1);
          }
          // Denominator: orders created by AI in period
          expect(args.where.business_id).toBe(businessId);
          expect(args.where.is_test).toBe(false);
          expect(args.where.created_at).toEqual({ gte: start, lt: end });
          return Promise.resolve(2);
        }
        return Promise.resolve(2);
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      const result = await service.rollupBusiness(businessId, targetDay);
      expect(result.conversionRate).toBe(0.5);
      expect(result.conversion_confirmed).toBe(1);
      expect(result.conversion_ai_pending).toBe(2);
      expect(result.conversion_confirmed).toBeLessThanOrEqual(result.conversion_ai_pending);
    });

    it("does not count orders confirmed outside the reporting period in conversionConfirmedCount", async () => {
      const { start, end } = getTimezoneDayBounds(targetDay, businessTimezone);

      mockPrisma.order.count.mockImplementation((args: any) => {
        if (args.where.created_by_type === "ai") {
          if (args.where.order_confirmed_at) {
            // Confirm exact filter verification
            expect(args.where).toEqual({
              business_id: businessId,
              is_test: false,
              created_by_type: "ai",
              created_at: { gte: start, lt: end },
              order_confirmed_at: { gte: start, lt: end },
            });
            // 0 orders confirmed within [start, end) (e.g. confirmation occurred on the next day)
            return Promise.resolve(0);
          }
          // 2 orders created in period
          return Promise.resolve(2);
        }
        return Promise.resolve(2);
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      const result = await service.rollupBusiness(businessId, targetDay);
      expect(result.conversionRate).toBe(0);
      expect(result.conversion_confirmed).toBe(0);
      expect(result.conversion_ai_pending).toBe(2);
    });

    it("fails rollup when an unrecognized outbound message sender_type is encountered", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      mockPrisma.message.findMany.mockImplementation((args: any) => {
        if (args.where.direction === MessageDirection.outbound) {
          return Promise.resolve([
            {
              sender_type: "unknown_sender" as any,
              ai_metadata: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      await expect(service.rollupBusiness(businessId, targetDay)).rejects.toThrow(
        /Unrecognized outbound message sender_type 'unknown_sender'/,
      );
    });

    it("correctly ignores SenderType.system outbound messages from AI vs human handled breakdown", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      mockPrisma.message.findMany.mockImplementation((args: any) => {
        if (args.where.direction === MessageDirection.outbound) {
          return Promise.resolve([
            {
              sender_type: SenderType.system,
              ai_metadata: null,
            },
            {
              sender_type: SenderType.ai,
              ai_metadata: { latency_ms: 300 },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.rollupBusiness(businessId, targetDay);
      expect(result.messages_ai).toBe(1);
      expect(result.messages_human).toBe(0);
    });

    it("rejects timestamps and strings with trailing characters in dayInput", async () => {
      await expect(service.rollupBusiness(businessId, "2026-08-27T23:59:00Z")).rejects.toThrow(
        /Invalid day input: expected YYYY-MM-DD/,
      );
      await expect(service.rollupBusiness(businessId, "2026-08-27garbage")).rejects.toThrow(
        /Invalid day input: expected YYYY-MM-DD/,
      );
      await expect(service.rollupBusiness(businessId, new Date("invalid"))).rejects.toThrow(
        /Invalid day input: Date instance is invalid/,
      );
    });

    it("includes handoffs from conversations with no inbound message in the conversation cohort and resolution rate", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);

      // 1 inbound message in conv-1 (resolved by AI)
      mockPrisma.message.findMany.mockImplementation((args: any) => {
        if (args.where.direction === MessageDirection.inbound) {
          return Promise.resolve([{ id: "msg-1", conversation_id: "conv-1" }]);
        }
        return Promise.resolve([]);
      });

      // Handoff event occurred on conv-2, which had NO inbound message today
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([
        {
          conversation_id: "conv-2",
          escalation_reason: "human_request",
        },
      ]);

      const result = await service.rollupBusiness(businessId, targetDay);

      // Total affected conversations: conv-1 (inbound) + conv-2 (escalated) = 2
      expect(result.conversationsCount).toBe(2);
      // Only conv-1 was resolved by AI (not escalated)
      expect(result.aiHandledCount).toBe(1);
      expect(result.handoffs_total).toBe(1);
      // Resolution rate = 1 / 2 = 0.5000 (not 1 / 1 = 1.0000)
      expect(result.aiResolutionRate).toBe(0.5);
    });

    it("throws NotFoundException when business does not exist", async () => {
      mockPrisma.business.findUnique.mockResolvedValue(null);

      await expect(service.rollupBusiness("non-existent-id", targetDay)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("attributes approved AI draft suggestion sent by human to messages_ai (01 §15)", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      mockPrisma.message.findMany.mockImplementation((args: any) => {
        if (args.where.direction === MessageDirection.inbound) {
          return Promise.resolve([{ id: "in-1", conversation_id: "c-1" }]);
        }
        if (args.where.direction === MessageDirection.outbound) {
          // Human approved an AI draft suggestion
          return Promise.resolve([
            {
              sender_type: SenderType.human,
              ai_metadata: { isSuggestion: true, latency_ms: 250 },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.rollupBusiness(businessId, targetDay);

      expect(result.messages_handled).toBe(1);
      expect(result.messages_ai).toBe(1);
      expect(result.messages_human).toBe(0);
    });

    it("excludes unapproved drafts from outbound message query (01 §15)", async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      let outboundFilter: any = null;
      mockPrisma.message.findMany.mockImplementation((args: any) => {
        if (args.where.direction === MessageDirection.outbound) {
          outboundFilter = args.where;
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await service.rollupBusiness(businessId, targetDay);

      expect(outboundFilter?.delivery_status).toEqual({ not: "draft" });
    });
  });

  describe("Idempotency", () => {
    it("Idempotency: Multiple runs on same day update row without duplication.", async () => {
      mockPrisma.order.count.mockResolvedValue(2);
      mockPrisma.order.findMany.mockResolvedValue([{ total: "10.000" }]);
      mockPrisma.message.findMany.mockImplementation((args: any) => {
        if (args.where.direction === MessageDirection.inbound) {
          return Promise.resolve([{ id: "m-1", conversation_id: "c-1" }]);
        }
        return Promise.resolve([]);
      });
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      // First run
      const firstRun = await service.rollupBusiness(businessId, targetDay);
      expect(mockPrisma.analyticsDaily.upsert).toHaveBeenCalledTimes(1);

      // Second run on the exact same business and date
      const secondRun = await service.rollupBusiness(businessId, targetDay);
      expect(mockPrisma.analyticsDaily.upsert).toHaveBeenCalledTimes(2);

      // Verify that both calls target the exact same composite key (business_id, day)
      const expectedWhere = {
        business_id_day: {
          business_id: businessId,
          day: new Date(`${targetDay}T00:00:00.000Z`),
        },
      };

      expect(mockPrisma.analyticsDaily.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(mockPrisma.analyticsDaily.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: expectedWhere }),
      );

      // Both runs compute identical metrics
      expect(firstRun.revenue).toBe(secondRun.revenue);
      expect(firstRun.ordersCount).toBe(secondRun.ordersCount);
      expect(firstRun.messages_handled).toBe(secondRun.messages_handled);
    });
  });

  describe("DailyRollupProcessor", () => {
    it("processes targeted business rollup job successfully", async () => {
      const rollupSpy = jest.spyOn(service, "rollupBusiness").mockResolvedValue({
        business_id: businessId,
        day: targetDay,
        dayDate: new Date(`${targetDay}T00:00:00.000Z`),
        messages_handled: 5,
        messages_ai: 3,
        messages_human: 2,
        orders_created: 2,
        handoffs_total: 0,
        handoffs_by_reason: {},
        conversion_confirmed: 1,
        conversion_ai_pending: 1,
        revenue: 25000,
        ordersCount: 1,
        conversationsCount: 3,
        aiHandledCount: 3,
        aiResolutionRate: 1,
        conversionRate: 1,
        avgResponseTimeMs: 450,
      });

      const mockJob = {
        id: "job-001",
        name: ROLLUP_DAILY_JOB,
        data: {
          businessId,
          day: targetDay,
        },
      } as Job<RollupDailyJobData>;

      const result = await processor.processJob(mockJob);

      expect(rollupSpy).toHaveBeenCalledWith(businessId, targetDay);
      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(result.businessId).toBe(businessId);
    });

    it("fans out independent jobs per business when businessId is omitted", async () => {
      jest.spyOn(service, "getActiveBusinesses").mockResolvedValue([
        { id: "biz-1", timezone: "Africa/Tunis" },
        { id: "biz-2", timezone: "America/New_York" },
      ]);

      const mockJob = {
        id: "job-002",
        name: ROLLUP_DAILY_JOB,
        data: {
          day: targetDay,
        },
      } as Job<RollupDailyJobData>;

      const result = await processor.processJob(mockJob);

      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          name: ROLLUP_DAILY_JOB,
          data: {
            businessId: "biz-1",
            day: targetDay,
            enqueuedAt: expect.any(Number),
          },
          opts: expect.objectContaining({
            jobId: `biz-1:${targetDay}`,
            attempts: 3,
          }),
        }),
        expect.objectContaining({
          name: ROLLUP_DAILY_JOB,
          data: {
            businessId: "biz-2",
            day: targetDay,
            enqueuedAt: expect.any(Number),
          },
          opts: expect.objectContaining({
            jobId: `biz-2:${targetDay}`,
            attempts: 3,
          }),
        }),
      ]);
      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(2);
    });

    it("delegates to rollupAllBusinesses when queue is not initialized", async () => {
      const processorWithoutQueue = new DailyRollupProcessor(service);
      const rollupAllSpy = jest.spyOn(service, "rollupAllBusinesses").mockResolvedValue({
        processedCount: 2,
        results: [],
        failures: [],
      });

      const mockJob = {
        id: "job-002",
        name: ROLLUP_DAILY_JOB,
        data: {
          day: targetDay,
        },
      } as Job<RollupDailyJobData>;

      const result = await processorWithoutQueue.processJob(mockJob);

      expect(rollupAllSpy).toHaveBeenCalledWith(targetDay);
      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(2);
    });

    it("throws when rollupAllBusinesses reports failures in queue-less fallback", async () => {
      const processorWithoutQueue = new DailyRollupProcessor(service);
      jest.spyOn(service, "rollupAllBusinesses").mockResolvedValue({
        processedCount: 1,
        results: [],
        failures: [{ businessId: "failed-biz-1", error: "Database timeout" }],
      });

      const mockJob = {
        id: "job-003",
        name: ROLLUP_DAILY_JOB,
        data: {
          day: targetDay,
        },
      } as Job<RollupDailyJobData>;

      await expect(processorWithoutQueue.processJob(mockJob)).rejects.toThrow(
        "Daily rollup failed for 1 businesses: failed-biz-1: Database timeout",
      );
    });

    it("throws UnrecoverableError when an unknown job name is received", async () => {
      const mockJob = {
        id: "job-999",
        name: "unknown_job_name",
        data: {},
      } as Job<RollupDailyJobData>;

      await expect(processor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);
    });

    it("enqueues ad-hoc job via triggerRollup", async () => {
      const res = await processor.triggerRollup({
        businessId,
        day: targetDay,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        ROLLUP_DAILY_JOB,
        expect.objectContaining({
          businessId,
          day: targetDay,
        }),
        expect.objectContaining({
          jobId: `${businessId}:${targetDay}`,
          attempts: 3,
        }),
      );
      expect(res).toEqual({ id: "job-001" });
    });

    it("enqueues ad-hoc job with computed deterministic day when day is omitted", async () => {
      const yesterdayStr = getYesterdayStringInTimezone();
      const res = await processor.triggerRollup({ businessId });

      expect(mockQueue.add).toHaveBeenCalledWith(
        ROLLUP_DAILY_JOB,
        expect.objectContaining({
          businessId,
          day: yesterdayStr,
        }),
        expect.objectContaining({
          jobId: `${businessId}:${yesterdayStr}`,
        }),
      );
      expect(res).toEqual({ id: "job-001" });
    });

    it("enqueues rollup for all businesses with deterministic day when no params provided", async () => {
      const yesterdayStr = getYesterdayStringInTimezone();
      await processor.triggerRollup();

      expect(mockQueue.add).toHaveBeenCalledWith(
        ROLLUP_DAILY_JOB,
        expect.objectContaining({
          day: yesterdayStr,
        }),
        expect.objectContaining({
          jobId: `all:${yesterdayStr}`,
        }),
      );
    });

    it("cleans up queue connection and rethrows when worker initialization fails in onModuleInit", async () => {
      const failingProcessor = new DailyRollupProcessor(service);
      const failingQueue: any = {
        upsertJobScheduler: jest.fn().mockRejectedValue(new Error("Redis connection refused")),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (failingProcessor as any).queue = failingQueue;

      await expect(failingProcessor.onModuleInit()).rejects.toThrow("Redis connection refused");

      expect(failingQueue.close).toHaveBeenCalled();
      expect((failingProcessor as any).queue).toBeNull();
      expect((failingProcessor as any).worker).toBeNull();
    });

    it("rejects triggerRollup with an error when queue is not initialized", async () => {
      const uninitializedProcessor = new DailyRollupProcessor(service);
      (uninitializedProcessor as any).queue = null;

      await expect(uninitializedProcessor.triggerRollup()).rejects.toThrow(
        "Cannot trigger rollup: analytics queue is not initialized",
      );
    });
  });
});
