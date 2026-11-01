import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MessageDirection, SenderType, Prisma } from "@prisma/client";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { getDateStringInTimezone } from "../rollups/daily-rollup.service";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService, shiftDays } from "./analytics.service";

describe("Analytics dashboard summary & timeseries overview API (`/analytics/overview`) (T-ANL-02)", () => {
  const businessId = "11111111-1111-4111-8111-111111111111";
  const otherBusinessId = "99999999-9999-4999-8999-999999999999";
  const timeZone = "Africa/Tunis";

  let mockPrisma: any;
  let service: AnalyticsService;
  let controller: AnalyticsController;

  const todayStr = getDateStringInTimezone(new Date(), timeZone);
  const day1 = shiftDays(todayStr, -2);
  const day2 = shiftDays(todayStr, -1);

  beforeEach(() => {
    mockPrisma = {
      business: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === businessId) {
            return Promise.resolve({ id: businessId, timezone: timeZone });
          }
          return Promise.resolve(null);
        }),
      },
      analyticsDaily: {
        findMany: jest.fn().mockResolvedValue([
          {
            business_id: businessId,
            day: new Date(`${day1}T00:00:00.000Z`),
            messages_handled: 50,
            messages_ai: 40,
            messages_human: 10,
            orders_created: 5,
            handoffs_total: 2,
            handoffs_by_reason: { human_request: 2 },
            conversion_confirmed: 3,
            conversion_ai_pending: 5,
            avgResponseTimeMs: 750,
          },
          {
            business_id: businessId,
            day: new Date(`${day2}T00:00:00.000Z`),
            messages_handled: 60,
            messages_ai: 50,
            messages_human: 10,
            orders_created: 8,
            handoffs_total: 1,
            handoffs_by_reason: { complaint: 1 },
            conversion_confirmed: 4,
            conversion_ai_pending: 6,
            avgResponseTimeMs: 650,
          },
        ]),
      },
      order: {
        count: jest.fn().mockImplementation(({ where }: any) => {
          if (where.business_id !== businessId) return Promise.resolve(0);
          if (where.created_by_type === "ai" && where.order_confirmed_at) {
            return Promise.resolve(1);
          }
          if (where.created_by_type === "ai") {
            return Promise.resolve(2);
          }
          return Promise.resolve(2);
        }),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where.business_id !== businessId) return Promise.resolve([]);
          // Confirmed orders for today
          return Promise.resolve([
            {
              id: "ord-today-1",
              total: new Prisma.Decimal("120.000"),
              order_confirmed_at: new Date(`${todayStr}T11:00:00.000Z`),
              created_at: new Date(`${todayStr}T10:00:00.000Z`),
            },
          ]);
        }),
      },
      message: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where.business_id !== businessId) return Promise.resolve([]);
          if (where.direction === MessageDirection.inbound) {
            return Promise.resolve([
              { id: "msg-in-1", conversation_id: "conv-1" },
              { id: "msg-in-2", conversation_id: "conv-2" },
            ]);
          }
          if (where.direction === MessageDirection.outbound) {
            return Promise.resolve([
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
        }),
      },
      conversationStatusEvent: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where.business_id !== businessId) return Promise.resolve([]);
          return Promise.resolve([
            {
              conversation_id: "conv-2",
              escalation_reason: "human_request",
              created_at: new Date(`${todayStr}T11:00:00.000Z`),
            },
          ]);
        }),
      },
    };

    service = new AnalyticsService(mockPrisma);
    controller = new AnalyticsController(service);
  });

  describe("Permissions & Security Guardrails", () => {
    it("decorates getOverview with @RequirePermission('analytics.read')", () => {
      const permissions = Reflect.getMetadata(
        PERMISSIONS_KEY,
        AnalyticsController.prototype.getOverview,
      );
      expect(permissions).toEqual(["analytics.read"]);
    });

    it("enforces multi-tenant isolation and rejects non-existent business", async () => {
      await expect(service.getOverview(otherBusinessId, { period: "7d" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("Acceptance Criteria: KPI Overview & Timeseries", () => {
    it("KPI Overview: Returns 4 KPI metrics with trend deltas.", async () => {
      const result = await controller.getOverview(businessId, { period: "7d" });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();

      // 4 Core KPIs + AI/human message breakdown
      expect(typeof result.summary.gmv).toBe("number");
      expect(typeof result.summary.ordersCount).toBe("number");
      expect(typeof result.summary.conversationsCount).toBe("number");
      expect(result.summary.aiResolutionRate).toBeDefined();
      expect(typeof result.summary.messagesAi).toBe("number");
      expect(typeof result.summary.messagesHuman).toBe("number");
      expect(typeof result.summary.avgResponseTimeMs).toBe("number");

      // Canonical 01 §15 / 13 §13 fields
      expect(typeof result.summary.messagesHandled).toBe("number");
      expect(typeof result.summary.handoffsTotal).toBe("number");
      expect(result.summary.handoffsByReason).toBeDefined();
      expect(result.summary.conversion).toBeDefined();

      // Aliases
      expect(result.summary.orders).toBe(result.summary.ordersCount);
      expect(result.summary.conversations).toBe(result.summary.conversationsCount);

      // Trend deltas
      expect(result.trends).toBeDefined();
      expect(result.summary.trends).toBeDefined();
      expect("gmvDelta" in result.trends!).toBe(true);
      expect("ordersDelta" in result.trends!).toBe(true);
      expect("conversationsDelta" in result.trends!).toBe(true);
      expect("aiResolutionRateDelta" in result.trends!).toBe(true);
    });

    it("Timeseries: Returns daily data points for charts.", async () => {
      const result = await controller.getOverview(businessId, { period: "7d" });

      expect(Array.isArray(result.timeseries)).toBe(true);
      expect(result.timeseries.length).toBe(7);

      for (const point of result.timeseries) {
        expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof point.gmv).toBe("number");
        expect(typeof point.ordersCount).toBe("number");
        expect(typeof point.ordersCreated).toBe("number");
        expect(typeof point.conversationsCount).toBe("number");
        expect(typeof point.messagesHandled).toBe("number");
        expect(typeof point.handoffsTotal).toBe("number");
        expect(point.handoffsByReason).toBeDefined();
        expect(point.aiResolutionRate === null || typeof point.aiResolutionRate === "number").toBe(
          true,
        );
      }
    });

    it("Intraday Data: Current day (today) includes live partial counts rather than empty zeros", async () => {
      const result = await controller.getOverview(businessId, { period: "7d" });

      const todayPoint = result.timeseries.find((p) => p.date === todayStr);
      expect(todayPoint).toBeDefined();

      // Today had 1 confirmed order of 120.000 DT = 120,000 millimes
      expect(todayPoint!.gmv).toBe(120000);
      expect(todayPoint!.ordersCount).toBe(1);
      // Today had 2 active conversations (conv-1 and conv-2)
      expect(todayPoint!.conversationsCount).toBe(2);
      // Today conv-2 escalated, conv-1 did not -> aiResolutionRate = 1/2 = 0.5
      expect(todayPoint!.aiResolutionRate).toBe(0.5);
    });
  });

  describe("Query Parameters & Date Range Filtering", () => {
    it("supports explicit from and to date ranges", async () => {
      const result = await controller.getOverview(businessId, {
        from: day1,
        to: day2,
      });

      expect(result.timeseries.length).toBe(2);
      expect(result.timeseries[0]!.date).toBe(day1);
      expect(result.timeseries[1]!.date).toBe(day2);
    });

    it("rejects invalid period", async () => {
      await expect(controller.getOverview(businessId, { period: "180d" as any })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects invalid date format in from or to", async () => {
      await expect(controller.getOverview(businessId, { from: "not-a-date" })).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.getOverview(businessId, { to: "2026/08/27" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects from date that is after to date", async () => {
      await expect(
        controller.getOverview(businessId, { from: "2026-08-30", to: "2026-08-10" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects incomplete custom date ranges", async () => {
      await expect(controller.getOverview(businessId, { from: "2026-08-01" })).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.getOverview(businessId, { to: "2026-08-31" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects conflicting period and custom date range", async () => {
      await expect(
        controller.getOverview(businessId, {
          from: day1,
          to: day2,
          period: "7d",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects semantically invalid calendar dates (e.g. Feb 31)", async () => {
      await expect(
        controller.getOverview(businessId, {
          from: "2026-02-31",
          to: "2026-03-05",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Order total validation & error handling", () => {
    it("rejects request when order total is negative or invalid", async () => {
      mockPrisma.order.findMany.mockImplementation(({ where }: any) => {
        if (where.status) {
          return Promise.resolve([
            {
              id: "ord-bad-1",
              total: new Prisma.Decimal("-10.000"),
              order_confirmed_at: new Date(`${todayStr}T10:00:00.000Z`),
              created_at: new Date(`${todayStr}T09:00:00.000Z`),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      await expect(controller.getOverview(businessId, { period: "7d" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects request when order total overflows safe integer millimes", async () => {
      mockPrisma.order.findMany.mockImplementation(({ where }: any) => {
        if (where.status) {
          return Promise.resolve([
            {
              id: "ord-overflow-1",
              total: new Prisma.Decimal("99999999999999999.000"),
              order_confirmed_at: new Date(`${todayStr}T10:00:00.000Z`),
              created_at: new Date(`${todayStr}T09:00:00.000Z`),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      await expect(controller.getOverview(businessId, { period: "7d" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("Multi-event handoffs and AI resolution rate (F7, F8)", () => {
    it("treats multiple handoff events for the same conversation as one escalated conversation", async () => {
      // 2 conversations total: conv-1 (ai handled), conv-2 (escalated twice)
      mockPrisma.analyticsDaily.findMany.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockImplementation(({ where }: any) => {
        if (where.direction === MessageDirection.inbound) {
          return Promise.resolve([
            { id: "m1", conversation_id: "conv-1" },
            { id: "m2", conversation_id: "conv-2" },
          ]);
        }
        return Promise.resolve([]);
      });
      // conv-2 escalated twice on today
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([
        {
          conversation_id: "conv-2",
          escalation_reason: "human_request",
          created_at: new Date(`${todayStr}T09:00:00.000Z`),
        },
        {
          conversation_id: "conv-2",
          escalation_reason: "complaint",
          created_at: new Date(`${todayStr}T10:00:00.000Z`),
        },
      ]);

      const result = await controller.getOverview(businessId, { period: "7d" });

      const todayPoint = result.timeseries.find((p) => p.date === todayStr);
      expect(todayPoint).toBeDefined();
      expect(todayPoint!.conversationsCount).toBe(2);
      expect(todayPoint!.handoffsTotal).toBe(2); // event count is 2
      // AI resolution rate: conv-1 handled / 2 active conversations = 0.5 (NOT 0.0 from 2 - 2)
      expect(todayPoint!.aiResolutionRate).toBe(0.5);
      expect(result.summary.aiResolutionRate).toBe(0.5);
    });
  });

  describe("Outbound message classification & error handling (F6)", () => {
    it("rejects unknown sender_type in outbound messages", async () => {
      mockPrisma.message.findMany.mockImplementation(({ where }: any) => {
        if (where.direction === MessageDirection.outbound) {
          return Promise.resolve([
            {
              sender_type: "unknown_alien_type" as any,
              ai_metadata: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      await expect(controller.getOverview(businessId, { period: "7d" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("Safe zero division and empty data handling", () => {
    it("handles zero activity without crashing or NaN", async () => {
      mockPrisma.analyticsDaily.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue([]);

      const result = await controller.getOverview(businessId, { period: "7d" });

      expect(result.summary.gmv).toBe(0);
      expect(result.summary.ordersCount).toBe(0);
      expect(result.summary.conversationsCount).toBe(0);
      expect(result.summary.aiResolutionRate).toBeNull();
      expect(result.summary.conversion).toBeNull();
      expect(result.summary.trends?.gmvDelta).toBeNull();
    });
  });
});
