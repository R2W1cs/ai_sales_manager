import { Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import {
  type PrismaClient,
  Prisma,
  OrderStatus,
  MessageDirection,
  SenderType,
  ConversationStatus,
  MessageDeliveryStatus,
} from "@prisma/client";

import type { HandoffsByReason } from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { InjectPrisma } from "../../platform/core/prisma.token";

export const DEFAULT_ANALYTICS_TIMEZONE = "Africa/Tunis";

/**
 * Resolves the UTC Date corresponding to 00:00:00 in a target timezone for a given
 * calendar year, month (1-12), and day (1-31).
 * Iteratively converges to evaluate the offset at the target local midnight, handling DST transitions.
 */
function getLocalMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const targetUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const extractPart = (parts: Intl.DateTimeFormatPart[], type: string): number => {
    const val = parts.find((p) => p.type === type)?.value;
    return val ? Number.parseInt(val, 10) : 0;
  };

  const getLocalAsUtc = (timestamp: number) => {
    const parts = formatter.formatToParts(new Date(timestamp));
    const hour = extractPart(parts, "hour");
    return Date.UTC(
      extractPart(parts, "year"),
      extractPart(parts, "month") - 1,
      extractPart(parts, "day"),
      hour === 24 ? 0 : hour,
      extractPart(parts, "minute"),
      extractPart(parts, "second"),
    );
  };

  let guess = targetUtcMs;
  for (let i = 0; i < 5; i++) {
    const local = getLocalAsUtc(guess);
    const diff = local - targetUtcMs;
    if (diff === 0) break;
    guess -= diff;
  }

  // Postcondition verification: formatting guess in timeZone must yield requested calendar date at 00:00:00
  const finalParts = formatter.formatToParts(new Date(guess));
  const fYear = extractPart(finalParts, "year");
  const fMonth = extractPart(finalParts, "month");
  const fDay = extractPart(finalParts, "day");
  const rawHour = extractPart(finalParts, "hour");
  const fHour = rawHour === 24 ? 0 : rawHour;
  const fMinute = extractPart(finalParts, "minute");
  const fSecond = extractPart(finalParts, "second");

  if (
    fYear !== year ||
    fMonth !== month ||
    fDay !== day ||
    fHour !== 0 ||
    fMinute !== 0 ||
    fSecond !== 0
  ) {
    throw new Error(
      `Could not determine exact local midnight for ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} in timezone '${timeZone}': resolved to ${fYear}-${fMonth}-${fDay} ${fHour}:${fMinute}:${fSecond}`,
    );
  }

  return new Date(guess);
}

/**
 * Validates that a date string matches YYYY-MM-DD, has a supported year (1970-2100),
 * and exists in the Gregorian calendar.
 */
export function validateCalendarDate(dateStr: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, received '${dateStr}'`);
  }
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);

  if (year < 1970 || year > 2100) {
    throw new Error(
      `Unsupported year '${year}' in date '${dateStr}': must be between 1970 and 2100`,
    );
  }

  // Validate semantic calendar correctness using setUTCFullYear (avoids 0-99 normalization quirks)
  const checkDate = new Date(0);
  checkDate.setUTCFullYear(year, month - 1, day);
  checkDate.setUTCHours(0, 0, 0, 0);
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() + 1 !== month ||
    checkDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: '${dateStr}' does not exist in Gregorian calendar`);
  }
}

/**
 * Validates an order total as a non-negative, finite Decimal and converts to integer millimes (DT * 1000).
 * Throws if the value is missing, negative, NaN, non-finite, or overflows safe integers.
 */
export function parseOrderTotalToMillimes(total: unknown, context = "order"): number {
  if (total === null || total === undefined) {
    throw new Error(`Invalid order total: null/undefined encountered for ${context}`);
  }
  let decimalVal: Prisma.Decimal;
  try {
    decimalVal = total instanceof Prisma.Decimal ? total : new Prisma.Decimal(total as any);
  } catch {
    throw new Error(
      `Invalid order total: failed to parse Decimal from '${String(total)}' for ${context}`,
    );
  }

  if (decimalVal.isNaN() || !decimalVal.isFinite() || decimalVal.isNegative()) {
    throw new Error(
      `Invalid order total: value must be finite and non-negative, got ${decimalVal.toString()} for ${context}`,
    );
  }

  const millimesDecimal = decimalVal.mul(1000);
  if (millimesDecimal.isNaN() || !millimesDecimal.isFinite()) {
    throw new Error(`Invalid revenue calculation: total millimes is not finite for ${context}`);
  }

  const millimesNumber = millimesDecimal.toNumber();
  const rounded = Math.round(millimesNumber);
  if (!Number.isSafeInteger(rounded)) {
    throw new Error(
      `Revenue overflow: aggregate millimes exceeds safe integer limits for ${context}`,
    );
  }

  return rounded;
}

/**
 * Calculates start and end Date objects in UTC corresponding to [00:00:00, 24:00:00)
 * of a given calendar date string (YYYY-MM-DD) in a target timezone.
 * Evaluates the timezone offset at local midnight and computes end from the next local calendar date.
 */
export function getTimezoneDayBounds(
  dateStr: string,
  timeZone = DEFAULT_ANALYTICS_TIMEZONE,
): { start: Date; end: Date } {
  validateCalendarDate(dateStr);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)!;
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);

  const start = getLocalMidnightUtc(year, month, day, timeZone);

  // Compute start of next calendar day in local timezone
  const nextCalDate = new Date(0);
  nextCalDate.setUTCFullYear(year, month - 1, day + 1);
  nextCalDate.setUTCHours(0, 0, 0, 0);

  const end = getLocalMidnightUtc(
    nextCalDate.getUTCFullYear(),
    nextCalDate.getUTCMonth() + 1,
    nextCalDate.getUTCDate(),
    timeZone,
  );

  return { start, end };
}

/**
 * Returns date string in target timezone (YYYY-MM-DD).
 */
export function getDateStringInTimezone(
  date: Date = new Date(),
  timeZone = DEFAULT_ANALYTICS_TIMEZONE,
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Returns the YYYY-MM-DD string for yesterday in the target timezone.
 */
export function getYesterdayStringInTimezone(
  now: Date = new Date(),
  timeZone = DEFAULT_ANALYTICS_TIMEZONE,
): string {
  const todayStr = getDateStringInTimezone(now, timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayStr);
  if (!match) {
    throw new Error(
      `Failed to format current date in timezone '${timeZone}': received '${todayStr}'`,
    );
  }
  const y = Number.parseInt(match[1]!, 10);
  const m = Number.parseInt(match[2]!, 10);
  const d = Number.parseInt(match[3]!, 10);
  const yesterdayUtc = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return getDateStringInTimezone(yesterdayUtc, timeZone);
}

export interface RollupAllBusinessesResult {
  processedCount: number;
  results: RollupMetricsResult[];
  failures: { businessId: string; error: string }[];
}

export interface RollupMetricsResult {
  business_id: string;
  day: string;
  dayDate: Date;
  messages_handled: number;
  messages_ai: number;
  messages_human: number;
  orders_created: number;
  handoffs_total: number;
  handoffs_by_reason: Partial<HandoffsByReason>;
  conversion_confirmed: number;
  conversion_ai_pending: number;
  // Commercial & performance KPIs
  revenue: number;
  ordersCount: number;
  conversationsCount: number;
  aiHandledCount: number;
  aiResolutionRate: number | null;
  conversionRate: number | null;
  avgResponseTimeMs: number;
}

@Injectable()
export class DailyRollupService {
  private readonly logger = new Logger(DailyRollupService.name);
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Aggregates daily commercial performance metrics for a single business and day,
   * then idempotently upserts the materialized record into `analytics_daily`.
   */
  async rollupBusiness(businessId: string, dayInput?: string | Date): Promise<RollupMetricsResult> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, timezone: true },
    });

    if (!business) {
      throw new NotFoundException(`Business with id ${businessId} not found`);
    }

    const timeZone = business.timezone || DEFAULT_ANALYTICS_TIMEZONE;

    let targetDayStr: string;
    if (typeof dayInput === "string") {
      const trimmed = dayInput.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        throw new Error(`Invalid day input: expected YYYY-MM-DD, received '${dayInput}'`);
      }
      targetDayStr = trimmed;
    } else if (dayInput instanceof Date) {
      if (isNaN(dayInput.getTime())) {
        throw new Error("Invalid day input: Date instance is invalid (NaN)");
      }
      targetDayStr = getDateStringInTimezone(dayInput, timeZone);
    } else if (dayInput === undefined || dayInput === null) {
      targetDayStr = getYesterdayStringInTimezone(new Date(), timeZone);
    } else {
      throw new Error("Invalid day input type: expected string, Date, or undefined");
    }

    const dayDate = new Date(`${targetDayStr}T00:00:00.000Z`);

    const metrics = await this.calculateDayMetrics(businessId, targetDayStr, timeZone);

    // 7. Idempotent Upsert into `analytics_daily` (12 §12.5)
    const rollupData = {
      messages_handled: metrics.messages_handled,
      messages_ai: metrics.messages_ai,
      messages_human: metrics.messages_human,
      orders_created: metrics.orders_created,
      handoffs_total: metrics.handoffs_total,
      handoffs_by_reason: metrics.handoffs_by_reason,
      conversion_confirmed: metrics.conversion_confirmed,
      conversion_ai_pending: metrics.conversion_ai_pending,
    };

    await this.prisma.analyticsDaily.upsert({
      where: {
        business_id_day: {
          business_id: businessId,
          day: dayDate,
        },
      },
      create: {
        business_id: businessId,
        day: dayDate,
        ...rollupData,
      },
      update: rollupData,
    });

    this.logger.log(
      {
        businessId,
        day: targetDayStr,
        gmv: metrics.revenue,
        ordersCount: metrics.ordersCount,
        conversationsCount: metrics.conversationsCount,
        messages_handled: metrics.messages_handled,
        messages_ai: metrics.messages_ai,
        messages_human: metrics.messages_human,
        aiResolutionRate: metrics.aiResolutionRate,
      },
      "Daily analytics rollup completed successfully",
    );

    return metrics;
  }

  /**
   * Computes all daily commercial performance metrics for a single business and day without persistence.
   */
  async calculateDayMetrics(
    businessId: string,
    targetDayStr: string,
    timeZone = DEFAULT_ANALYTICS_TIMEZONE,
  ): Promise<RollupMetricsResult> {
    const { start, end } = getTimezoneDayBounds(targetDayStr, timeZone);
    const dayDate = new Date(`${targetDayStr}T00:00:00.000Z`);

    const [
      ordersCreatedCount,
      confirmedOrders,
      conversionConfirmedCount,
      conversionAiPendingCount,
      inboundCustomerMessages,
      outboundMessages,
      escalatedEvents,
    ] = await Promise.all([
      // 1. Orders Created (01 §15: Orders originating in period, is_test = false)
      this.prisma.order.count({
        where: {
          business_id: businessId,
          is_test: false,
          created_at: {
            gte: start,
            lt: end,
          },
        },
      }),
      // 2. Revenue & Confirmed Orders (01 §15, T-ANL-01: status IN ('CONFIRMED', 'COMPLETED'), is_test = false)
      this.prisma.order.findMany({
        where: {
          business_id: businessId,
          is_test: false,
          status: { in: [OrderStatus.CONFIRMED, OrderStatus.COMPLETED] },
          OR: [
            { order_confirmed_at: { gte: start, lt: end } },
            {
              order_confirmed_at: null,
              created_at: { gte: start, lt: end },
            },
          ],
        },
        select: {
          total: true,
        },
      }),
      // 3. Conversion metrics (01 §15, 12 §12.5)
      this.prisma.order.count({
        where: {
          business_id: businessId,
          is_test: false,
          created_by_type: "ai",
          created_at: { gte: start, lt: end },
          order_confirmed_at: { gte: start, lt: end },
        },
      }),
      this.prisma.order.count({
        where: {
          business_id: businessId,
          is_test: false,
          created_by_type: "ai",
          created_at: { gte: start, lt: end },
        },
      }),
      // 4. Messages handled & Shopper Activity (01 §15: Inbound customer messages, is_test = false)
      this.prisma.message.findMany({
        where: {
          business_id: businessId,
          direction: MessageDirection.inbound,
          sender_type: SenderType.customer,
          created_at: { gte: start, lt: end },
          conversation: { is_test: false },
        },
        select: {
          id: true,
          conversation_id: true,
        },
      }),
      // 5. Outbound Messages Breakdown & AI Latency (01 §15, T-ANL-01)
      this.prisma.message.findMany({
        where: {
          business_id: businessId,
          direction: MessageDirection.outbound,
          delivery_status: { not: MessageDeliveryStatus.draft },
          created_at: { gte: start, lt: end },
          conversation: { is_test: false },
        },
        select: {
          sender_type: true,
          ai_metadata: true,
        },
      }),
      // 6. Human Escalation Handoffs & AI Resolution Rate (01 §15, T-ANL-01)
      this.prisma.conversationStatusEvent.findMany({
        where: {
          business_id: businessId,
          to_status: ConversationStatus.HUMAN_REQUIRED,
          is_test: false,
          created_at: { gte: start, lt: end },
        },
        select: {
          conversation_id: true,
          escalation_reason: true,
        },
      }),
    ]);

    const ordersCount = confirmedOrders.length;
    let revenue = 0;
    for (const order of confirmedOrders) {
      const millimes = parseOrderTotalToMillimes(order.total, `order for business ${businessId}`);
      revenue += millimes;
      if (!Number.isSafeInteger(revenue)) {
        throw new Error(
          `Revenue overflow: aggregate millimes exceeds safe integer limits for business ${businessId}`,
        );
      }
    }

    const conversionRate =
      conversionAiPendingCount > 0
        ? Number((conversionConfirmedCount / conversionAiPendingCount).toFixed(4))
        : null;

    const messages_handled = inboundCustomerMessages.length;
    const inboundConversationIds = new Set(inboundCustomerMessages.map((m) => m.conversation_id));

    let messages_ai = 0;
    let messages_human = 0;
    let totalAiLatencyMs = 0;
    let aiMessagesWithLatency = 0;

    for (const msg of outboundMessages) {
      const meta = msg.ai_metadata as Record<string, unknown> | null;
      const isApprovedAiSuggestion =
        meta?.isSuggestion === true ||
        meta?.mode === "suggest" ||
        Boolean(meta?.prompt_version_id && msg.sender_type === SenderType.human);

      if (msg.sender_type === SenderType.ai || isApprovedAiSuggestion) {
        messages_ai++;
        const latency = typeof meta?.latency_ms === "number" ? meta.latency_ms : null;
        if (latency !== null && !isNaN(latency) && latency >= 0) {
          totalAiLatencyMs += latency;
          aiMessagesWithLatency++;
        }
      } else if (msg.sender_type === SenderType.human) {
        messages_human++;
      } else if (msg.sender_type === SenderType.system) {
        continue;
      } else {
        throw new Error(
          `Unrecognized outbound message sender_type '${String(msg.sender_type)}' for business ${businessId}`,
        );
      }
    }

    const avgResponseTimeMs =
      aiMessagesWithLatency > 0 ? Math.round(totalAiLatencyMs / aiMessagesWithLatency) : 0;

    const handoffs_total = escalatedEvents.length;
    const handoffs_by_reason: Record<string, number> = {};
    const escalatedConversationIds = new Set<string>();

    for (const event of escalatedEvents) {
      escalatedConversationIds.add(event.conversation_id);
      const reasonKey = event.escalation_reason || "human_request";
      handoffs_by_reason[reasonKey] = (handoffs_by_reason[reasonKey] || 0) + 1;
    }

    // Cohort of all conversations affected in period (inbound activity OR handoff event)
    const activeConversationIds = new Set<string>([
      ...inboundConversationIds,
      ...escalatedConversationIds,
    ]);
    const conversationsCount = activeConversationIds.size;

    let aiHandledConversations = 0;
    for (const convId of activeConversationIds) {
      if (!escalatedConversationIds.has(convId)) {
        aiHandledConversations++;
      }
    }

    const aiResolutionRate =
      conversationsCount > 0
        ? Number((aiHandledConversations / conversationsCount).toFixed(4))
        : null;

    return {
      business_id: businessId,
      day: targetDayStr,
      dayDate,
      messages_handled,
      messages_ai,
      messages_human,
      orders_created: ordersCreatedCount,
      handoffs_total,
      handoffs_by_reason: handoffs_by_reason as Partial<HandoffsByReason>,
      conversion_confirmed: conversionConfirmedCount,
      conversion_ai_pending: conversionAiPendingCount,
      revenue,
      ordersCount,
      conversationsCount,
      aiHandledCount: aiHandledConversations,
      aiResolutionRate,
      conversionRate,
      avgResponseTimeMs,
    };
  }

  /**
   * Retrieves all active businesses for daily rollup processing and dispatching.
   */
  async getActiveBusinesses(): Promise<{ id: string; timezone: string }[]> {
    return this.prisma.business.findMany({
      select: { id: true, timezone: true },
    });
  }

  /**
   * Runs daily aggregation rollup across all active businesses concurrently.
   */
  async rollupAllBusinesses(dayInput?: string | Date): Promise<RollupAllBusinessesResult> {
    const businesses = await this.getActiveBusinesses();

    const settled = await Promise.all(
      businesses.map(async (b) => {
        try {
          const res = await this.rollupBusiness(b.id, dayInput);
          return { success: true as const, res, businessId: b.id };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            { businessId: b.id, err: errMsg },
            "Failed to rollup business analytics",
          );
          return { success: false as const, error: errMsg, businessId: b.id };
        }
      }),
    );

    const results: RollupMetricsResult[] = [];
    const failures: { businessId: string; error: string }[] = [];
    for (const item of settled) {
      if (item.success) {
        results.push(item.res);
      } else {
        failures.push({ businessId: item.businessId, error: item.error });
      }
    }

    return {
      processedCount: results.length,
      results,
      failures,
    };
  }
}
