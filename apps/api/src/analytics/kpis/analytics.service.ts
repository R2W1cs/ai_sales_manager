import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { InjectPrisma } from "../../platform/core/prisma.token";
import {
  AnalyticsOverviewQuerySchema,
  type AnalyticsOverviewQueryDto,
  type AnalyticsOverviewResponse,
  type AnalyticsOverviewSummary,
  type AnalyticsTrends,
  type DailyMetricPoint,
} from "../dto/analytics-overview.dto";
import {
  DEFAULT_ANALYTICS_TIMEZONE,
  getDateStringInTimezone,
  validateCalendarDate,
  DailyRollupService,
} from "../rollups/daily-rollup.service";

/**
 * Shifts a YYYY-MM-DD date string by deltaDays.
 */
export function shiftDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + deltaDays, 12, 0, 0));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns an inclusive array of YYYY-MM-DD strings between fromStr and toStr.
 */
export function getDaysBetweenInclusive(fromStr: string, toStr: string): string[] {
  const result: string[] = [];
  let curr = fromStr;
  while (curr <= toStr) {
    result.push(curr);
    curr = shiftDays(curr, 1);
  }
  return result;
}

export interface DayAggregationData {
  gmv: number;
  ordersCount: number;
  ordersCreated: number;
  conversationsCount: number;
  aiHandledCount: number;
  aiResolutionRate: number | null;
  messagesHandled: number;
  messagesAi: number;
  messagesHuman: number;
  avgResponseTimeMs: number;
  totalLatencyMs: number;
  latencyCount: number;
  handoffsTotal: number;
  handoffsByReason: Record<string, number>;
  conversionConfirmed: number;
  conversionAiPending: number;
  conversion: number | null;
}

interface ResolvedDateRange {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  currentDays: string[];
  previousDays: string[];
}

@Injectable()
export class AnalyticsService {
  private readonly prisma: PrismaClient;
  private readonly dailyRollupService: DailyRollupService;

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() @Inject(DailyRollupService) dailyRollupService?: DailyRollupService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.dailyRollupService = dailyRollupService ?? new DailyRollupService(this.prisma);
  }

  /**
   * 13 §13 / T-ANL-02 GET /api/v1/analytics/overview
   * Returns merchant analytics overview with 4 core KPIs, AI/human message breakdown,
   * trend deltas against previous period, and gapless daily timeseries.
   *
   * Hybrid real-time pattern (FR-ANL-003):
   * - Historical days (< today): Materialized solely from `analytics_daily` table (no live scans).
   * - Current day (= today): Real-time live aggregation without 24h gap via DailyRollupService.
   */
  async getOverview(
    businessId: string,
    query: AnalyticsOverviewQueryDto = {},
  ): Promise<AnalyticsOverviewResponse> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, timezone: true },
    });

    if (!business) {
      throw new NotFoundException(`Business with id ${businessId} not found`);
    }

    const timeZone = business.timezone || DEFAULT_ANALYTICS_TIMEZONE;
    const todayStr = getDateStringInTimezone(new Date(), timeZone);

    // 1. Resolve and validate date range
    const { to, prevFrom, currentDays, previousDays } = this.resolveDateRange(query, todayStr);

    // 2. Fetch historical rollups across both previous and current period (FR-ANL-003)
    const historicalRows = await this.prisma.analyticsDaily.findMany({
      where: {
        business_id: businessId,
        day: {
          gte: new Date(`${prevFrom}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
      },
      orderBy: { day: "asc" },
    });

    const historicalByDate = new Map<string, any>();
    for (const row of historicalRows) {
      const dStr =
        row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
      historicalByDate.set(dStr, row);
    }

    // 3. Current day (today) intraday aggregation via DailyRollupService if today is in current period
    let todayData: DayAggregationData | null = null;
    if (currentDays.includes(todayStr)) {
      try {
        const m = await this.dailyRollupService.calculateDayMetrics(businessId, todayStr, timeZone);
        todayData = {
          gmv: m.revenue,
          ordersCount: m.ordersCount,
          ordersCreated: m.orders_created,
          conversationsCount: m.conversationsCount,
          aiHandledCount: m.aiHandledCount,
          aiResolutionRate: m.aiResolutionRate,
          messagesHandled: m.messages_handled,
          messagesAi: m.messages_ai,
          messagesHuman: m.messages_human,
          avgResponseTimeMs: m.avgResponseTimeMs,
          totalLatencyMs: m.avgResponseTimeMs * (m.messages_ai > 0 ? 1 : 0),
          latencyCount: m.messages_ai > 0 ? 1 : 0,
          handoffsTotal: m.handoffs_total,
          handoffsByReason: (m.handoffs_by_reason as Record<string, number>) ?? {},
          conversionConfirmed: m.conversion_confirmed,
          conversionAiPending: m.conversion_ai_pending,
          conversion: m.conversionRate,
        };
      } catch (err: any) {
        if (err instanceof BadRequestException || err instanceof NotFoundException) {
          throw err;
        }
        throw new BadRequestException(err.message);
      }
    }

    // 4. Build gapless timeseries and aggregate current period totals
    const timeseries: DailyMetricPoint[] = [];
    let totalGmv = 0;
    let totalOrdersCount = 0;
    let totalOrdersCreated = 0;
    let totalConversationsCount = 0;
    let totalAiHandledCount = 0;
    let totalMessagesHandled = 0;
    let totalMessagesAi = 0;
    let totalMessagesHuman = 0;
    let totalHandoffs = 0;
    const mergedHandoffsByReason: Record<string, number> = {};
    let totalConversionConfirmed = 0;
    let totalConversionAiPending = 0;
    let totalResponseTimeMsSum = 0;
    let totalLatencyResponsesCount = 0;

    for (const d of currentDays) {
      const dayMetrics = this.resolveDayMetric(d, todayStr, todayData, historicalByDate);
      timeseries.push({
        date: d,
        gmv: dayMetrics.gmv,
        ordersCount: dayMetrics.ordersCount,
        ordersCreated: dayMetrics.ordersCreated,
        conversationsCount: dayMetrics.conversationsCount,
        aiResolutionRate: dayMetrics.aiResolutionRate,
        messagesHandled: dayMetrics.messagesHandled,
        messagesAi: dayMetrics.messagesAi,
        messagesHuman: dayMetrics.messagesHuman,
        handoffsTotal: dayMetrics.handoffsTotal,
        handoffsByReason: dayMetrics.handoffsByReason,
        conversionConfirmed: dayMetrics.conversionConfirmed,
        conversionAiPending: dayMetrics.conversionAiPending,
        conversion: dayMetrics.conversion,
      });

      totalGmv += dayMetrics.gmv;
      totalOrdersCount += dayMetrics.ordersCount;
      totalOrdersCreated += dayMetrics.ordersCreated;
      totalConversationsCount += dayMetrics.conversationsCount;
      totalAiHandledCount += dayMetrics.aiHandledCount;
      totalMessagesHandled += dayMetrics.messagesHandled;
      totalMessagesAi += dayMetrics.messagesAi;
      totalMessagesHuman += dayMetrics.messagesHuman;
      totalHandoffs += dayMetrics.handoffsTotal;
      totalConversionConfirmed += dayMetrics.conversionConfirmed;
      totalConversionAiPending += dayMetrics.conversionAiPending;

      for (const [reason, count] of Object.entries(dayMetrics.handoffsByReason)) {
        mergedHandoffsByReason[reason] = (mergedHandoffsByReason[reason] || 0) + count;
      }

      if (dayMetrics.latencyCount > 0) {
        totalResponseTimeMsSum += dayMetrics.totalLatencyMs;
        totalLatencyResponsesCount += dayMetrics.latencyCount;
      }
    }

    const summaryAiResolutionRate =
      totalConversationsCount > 0
        ? Number(Math.min(1, Math.max(0, totalAiHandledCount / totalConversationsCount)).toFixed(2))
        : null;

    const summaryConversion =
      totalConversionAiPending > 0
        ? Number((totalConversionConfirmed / totalConversionAiPending).toFixed(4))
        : null;

    const summaryAvgResponseTimeMs =
      totalLatencyResponsesCount > 0
        ? Math.round(totalResponseTimeMsSum / totalLatencyResponsesCount)
        : 0;

    // 5. Compute previous period metrics and trend deltas
    const trends = this.computeTrends(
      {
        totalGmv,
        totalOrdersCount,
        totalConversationsCount,
        summaryAiResolutionRate,
        totalMessagesHandled,
        summaryConversion,
      },
      previousDays,
      todayStr,
      todayData,
      historicalByDate,
    );

    const summary: AnalyticsOverviewSummary = {
      gmv: totalGmv,
      ordersCount: totalOrdersCount,
      orders: totalOrdersCount,
      ordersCreated: totalOrdersCreated,
      conversationsCount: totalConversationsCount,
      conversations: totalConversationsCount,
      aiResolutionRate: summaryAiResolutionRate,
      messagesHandled: totalMessagesHandled,
      messagesAi: totalMessagesAi,
      messagesHuman: totalMessagesHuman,
      avgResponseTimeMs: summaryAvgResponseTimeMs,
      handoffsTotal: totalHandoffs,
      handoffsByReason: mergedHandoffsByReason,
      conversionConfirmed: totalConversionConfirmed,
      conversionAiPending: totalConversionAiPending,
      conversion: summaryConversion,
      conversionRate: summaryConversion,
      trends,
    };

    return {
      summary,
      timeseries,
      trends,
    };
  }

  /**
   * Validates query parameters against AnalyticsOverviewQuerySchema and calendar rules,
   * then computes inclusive day lists for both current and previous comparison periods.
   */
  private resolveDateRange(query: AnalyticsOverviewQueryDto, todayStr: string): ResolvedDateRange {
    const parseResult = AnalyticsOverviewQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new BadRequestException(
        parseResult.error.issues[0]?.message || "Invalid analytics query parameters",
      );
    }

    let { from, to, period } = parseResult.data;

    let durationDays = 30;
    if (period === "7d") durationDays = 7;
    else if (period === "30d") durationDays = 30;
    else if (period === "90d") durationDays = 90;

    if (from && to) {
      try {
        validateCalendarDate(from);
      } catch (err: any) {
        throw new BadRequestException(`Invalid 'from' date: ${err.message}`);
      }
      try {
        validateCalendarDate(to);
      } catch (err: any) {
        throw new BadRequestException(`Invalid 'to' date: ${err.message}`);
      }

      if (from > to) {
        throw new BadRequestException("'from' date must be before or equal to 'to' date");
      }
    } else if (period) {
      to = todayStr;
      from = shiftDays(to, -(durationDays - 1));
    } else {
      to = todayStr;
      from = shiftDays(to, -29);
    }

    const currentDays = getDaysBetweenInclusive(from, to);
    const periodDaysCount = currentDays.length;

    const prevTo = shiftDays(from, -1);
    const prevFrom = shiftDays(prevTo, -(periodDaysCount - 1));
    const previousDays = getDaysBetweenInclusive(prevFrom, prevTo);

    return { from, to, prevFrom, prevTo, currentDays, previousDays };
  }

  /**
   * Resolves metrics for a specific date from today's live data or historical daily rollup.
   */
  private resolveDayMetric(
    dateStr: string,
    todayStr: string,
    todayData: DayAggregationData | null,
    historicalByDate: Map<string, any>,
  ): DayAggregationData {
    if (dateStr === todayStr && todayData) {
      return todayData;
    }

    const row = historicalByDate.get(dateStr);
    if (row) {
      const rowGmv = row.gmv ?? row.revenue ?? 0;
      const rowOrdersCreated = row.orders_created ?? 0;
      const rowOrdersCount = row.ordersCount ?? rowOrdersCreated;
      const rowMessagesHandled = row.messages_handled ?? 0;
      const rowMessagesAi = row.messages_ai ?? 0;
      const rowMessagesHuman = row.messages_human ?? 0;
      const rowHandoffsTotal = row.handoffs_total ?? 0;
      const rowHandoffsByReason = (row.handoffs_by_reason as Record<string, number>) ?? {};
      const rowConversionConfirmed = row.conversion_confirmed ?? 0;
      const rowConversionAiPending = row.conversion_ai_pending ?? 0;
      const rowConversion =
        rowConversionAiPending > 0
          ? Number((rowConversionConfirmed / rowConversionAiPending).toFixed(4))
          : null;

      const rowConversationsCount = row.conversationsCount ?? 0;
      const aiHandledCount =
        row.aiHandledCount ?? Math.max(0, rowConversationsCount - rowHandoffsTotal);

      let rowAiResolutionRate = row.aiResolutionRate ?? null;
      if (rowAiResolutionRate === null || rowAiResolutionRate === undefined) {
        if (rowConversationsCount > 0) {
          rowAiResolutionRate = Number((aiHandledCount / rowConversationsCount).toFixed(2));
        }
      }

      const rowAvgResponseTimeMs = row.avgResponseTimeMs ?? 0;
      const latencyCount =
        row.latencyCount ??
        row.aiMessagesWithLatency ??
        (rowMessagesAi > 0 ? 1 : rowAvgResponseTimeMs > 0 ? 1 : 0);
      const totalLatencyMs = row.totalLatencyMs ?? rowAvgResponseTimeMs * latencyCount;

      return {
        gmv: rowGmv,
        ordersCount: rowOrdersCount,
        ordersCreated: rowOrdersCreated,
        conversationsCount: rowConversationsCount,
        aiHandledCount,
        aiResolutionRate: rowAiResolutionRate,
        messagesHandled: rowMessagesHandled,
        messagesAi: rowMessagesAi,
        messagesHuman: rowMessagesHuman,
        avgResponseTimeMs: rowAvgResponseTimeMs,
        totalLatencyMs,
        latencyCount,
        handoffsTotal: rowHandoffsTotal,
        handoffsByReason: rowHandoffsByReason,
        conversionConfirmed: rowConversionConfirmed,
        conversionAiPending: rowConversionAiPending,
        conversion: rowConversion,
      };
    }

    return {
      gmv: 0,
      ordersCount: 0,
      ordersCreated: 0,
      conversationsCount: 0,
      aiHandledCount: 0,
      aiResolutionRate: null,
      messagesHandled: 0,
      messagesAi: 0,
      messagesHuman: 0,
      avgResponseTimeMs: 0,
      totalLatencyMs: 0,
      latencyCount: 0,
      handoffsTotal: 0,
      handoffsByReason: {},
      conversionConfirmed: 0,
      conversionAiPending: 0,
      conversion: null,
    };
  }

  /**
   * Computes delta percentages comparing current summary metrics with previous period.
   */
  private computeTrends(
    current: {
      totalGmv: number;
      totalOrdersCount: number;
      totalConversationsCount: number;
      summaryAiResolutionRate: number | null;
      totalMessagesHandled: number;
      summaryConversion: number | null;
    },
    previousDays: string[],
    todayStr: string,
    todayData: DayAggregationData | null,
    historicalByDate: Map<string, any>,
  ): AnalyticsTrends {
    let prevGmv = 0;
    let prevOrdersCount = 0;
    let prevConversationsCount = 0;
    let prevAiHandledCount = 0;
    let prevMessagesHandled = 0;
    let prevConversionConfirmed = 0;
    let prevConversionAiPending = 0;

    for (const d of previousDays) {
      const dayMetrics = this.resolveDayMetric(d, todayStr, todayData, historicalByDate);
      prevGmv += dayMetrics.gmv;
      prevOrdersCount += dayMetrics.ordersCount;
      prevConversationsCount += dayMetrics.conversationsCount;
      prevAiHandledCount += dayMetrics.aiHandledCount;
      prevMessagesHandled += dayMetrics.messagesHandled;
      prevConversionConfirmed += dayMetrics.conversionConfirmed;
      prevConversionAiPending += dayMetrics.conversionAiPending;
    }

    const prevAiResolutionRate =
      prevConversationsCount > 0
        ? Number(Math.min(1, Math.max(0, prevAiHandledCount / prevConversationsCount)).toFixed(2))
        : null;

    const prevConversion =
      prevConversionAiPending > 0
        ? Number((prevConversionConfirmed / prevConversionAiPending).toFixed(4))
        : null;

    return {
      gmvDelta: prevGmv > 0 ? Number(((current.totalGmv - prevGmv) / prevGmv).toFixed(4)) : null,
      ordersDelta:
        prevOrdersCount > 0
          ? Number(((current.totalOrdersCount - prevOrdersCount) / prevOrdersCount).toFixed(4))
          : null,
      conversationsDelta:
        prevConversationsCount > 0
          ? Number(
              (
                (current.totalConversationsCount - prevConversationsCount) /
                prevConversationsCount
              ).toFixed(4),
            )
          : null,
      aiResolutionRateDelta:
        prevAiResolutionRate !== null && current.summaryAiResolutionRate !== null
          ? Number((current.summaryAiResolutionRate - prevAiResolutionRate).toFixed(4))
          : null,
      messagesHandledDelta:
        prevMessagesHandled > 0
          ? Number(
              ((current.totalMessagesHandled - prevMessagesHandled) / prevMessagesHandled).toFixed(
                4,
              ),
            )
          : null,
      conversionDelta:
        prevConversion !== null && current.summaryConversion !== null
          ? Number((current.summaryConversion - prevConversion).toFixed(4))
          : null,
    };
  }
}
