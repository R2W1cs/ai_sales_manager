import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  CANONICAL_PLANS,
  PlanLimitsSchema,
  TUNISIA_TIMEZONE,
  BillingUsageResponseSchema,
  type BillingUsageResponse,
  type BillingLimits,
} from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { NotificationDispatcherService } from "../../notifications/dispatcher/notification-dispatcher.service";
import { InjectPrisma } from "../../platform/core/prisma.token";

const TUNISIA_CYCLE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TUNISIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TUNISIA_LOCAL_IN_TZ_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TUNISIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

const TUNISIA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TUNISIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface CheckQuotaGateOptions {
  actorType?: "ai" | "human";
  throwOnBlocked?: boolean;
  atomicConsume?: boolean;
  quantity?: number;
  tx?: PrismaClient | Prisma.TransactionClient;
}

export interface QuotaGateResult {
  allowed: boolean;
  percentUsed: number;
  aiPaused: boolean;
  usage: BillingUsageResponse;
}

export interface GetUsageOptions {
  skipNotifications?: boolean;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly prisma: PrismaClient;
  private static readonly MAX_DISPATCHED_CACHE_SIZE = 1000;
  private readonly dispatchedWarnings = new Set<string>();

  private markWarningDispatched(key: string): void {
    if (this.dispatchedWarnings.size >= QuotaService.MAX_DISPATCHED_CACHE_SIZE) {
      const oldestKey = this.dispatchedWarnings.values().next().value;
      if (oldestKey) {
        this.dispatchedWarnings.delete(oldestKey);
      }
    }
    this.dispatchedWarnings.add(key);
  }

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcherService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Computes billing cycle dates in Africa/Tunis timezone.
   * Cycle starts 1st of month at 00:00:00 Africa/Tunis and ends last day of month at 23:59:59 Africa/Tunis.
   */
  getAfricaTunisBillingCycle(referenceDate: Date = new Date()): {
    cycleStart: Date;
    cycleEnd: Date;
    nextCycleStart: Date;
    periodKey: string;
  } {
    const parts = TUNISIA_CYCLE_PARTS_FORMATTER.formatToParts(referenceDate);

    const yearPart = parts.find((p) => p.type === "year")?.value;
    const monthPart = parts.find((p) => p.type === "month")?.value;
    const year = yearPart ? parseInt(yearPart, 10) : referenceDate.getUTCFullYear();
    const month = monthPart ? parseInt(monthPart, 10) : referenceDate.getUTCMonth() + 1;
    const monthPadded = String(month).padStart(2, "0");
    const periodKey = `${year}-${monthPadded}`;

    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthPadded = String(nextMonth).padStart(2, "0");

    const getUtcDateFromLocal = (localStr: string): Date => {
      const utcGuess = new Date(`${localStr}Z`);
      const localInTz = TUNISIA_LOCAL_IN_TZ_FORMATTER.format(utcGuess);
      const [d, t] = localInTz.split(", ");
      const localReconstructed = new Date(`${d}T${t}Z`);
      const offsetMs = localReconstructed.getTime() - utcGuess.getTime();
      return new Date(utcGuess.getTime() - offsetMs);
    };

    const cycleStart = getUtcDateFromLocal(`${year}-${monthPadded}-01T00:00:00`);
    const nextCycleStart = getUtcDateFromLocal(`${nextMonthYear}-${nextMonthPadded}-01T00:00:00`);
    const cycleEnd = new Date(nextCycleStart.getTime() - 1000); // 23:59:59 of last day

    return { cycleStart, cycleEnd, nextCycleStart, periodKey };
  }

  /**
   * Computes the calendar day Date in Africa/Tunis timezone (at UTC 00:00:00.000Z).
   */
  getAfricaTunisDate(date: Date = new Date()): Date {
    const dateStr = TUNISIA_DATE_FORMATTER.format(date);
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  /**
   * Computes uncovered intervals in [cycleStart, cycleEnd) that are NOT covered by any aggregate.
   * Merges overlapping or adjacent aggregate intervals, clamps to cycle window,
   * and returns the disjoint complement intervals.
   * Guarantees no interval with start >= end is ever returned (F1).
   */
  private computeUncoveredIntervals(
    aggregates: { period_start: Date; period_end: Date }[],
    cycleStart: Date,
    cycleEnd: Date,
  ): { start: Date; end: Date }[] {
    if (cycleStart.getTime() >= cycleEnd.getTime()) {
      return [];
    }

    if (aggregates.length === 0) {
      return [{ start: cycleStart, end: cycleEnd }];
    }

    // 1. Clamp and filter aggregate intervals strictly within [cycleStart, cycleEnd)
    const validIntervals: { start: Date; end: Date }[] = [];
    for (const agg of aggregates) {
      const start = agg.period_start < cycleStart ? cycleStart : agg.period_start;
      const end = agg.period_end > cycleEnd ? cycleEnd : agg.period_end;
      if (start.getTime() < end.getTime()) {
        validIntervals.push({ start, end });
      }
    }
    validIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());

    if (validIntervals.length === 0) {
      return [{ start: cycleStart, end: cycleEnd }];
    }

    const firstInterval = validIntervals[0];
    if (!firstInterval) {
      return [{ start: cycleStart, end: cycleEnd }];
    }

    // 2. Merge overlapping or adjacent intervals
    const merged: { start: Date; end: Date }[] = [];
    let current: { start: Date; end: Date } = {
      start: firstInterval.start,
      end: firstInterval.end,
    };

    for (let i = 1; i < validIntervals.length; i++) {
      const next = validIntervals[i];
      if (!next) continue;
      if (next.start.getTime() <= current.end.getTime()) {
        if (next.end.getTime() > current.end.getTime()) {
          current.end = next.end;
        }
      } else {
        if (current.start.getTime() < current.end.getTime()) {
          merged.push({ start: current.start, end: current.end });
        }
        current = { start: next.start, end: next.end };
      }
    }
    if (current.start.getTime() < current.end.getTime()) {
      merged.push({ start: current.start, end: current.end });
    }

    // 3. Compute complement intervals (the uncovered gaps + head + tail)
    const uncovered: { start: Date; end: Date }[] = [];
    let cursor = cycleStart;

    for (const interval of merged) {
      if (interval.start.getTime() > cursor.getTime()) {
        uncovered.push({ start: cursor, end: interval.start });
      }
      if (interval.end.getTime() > cursor.getTime()) {
        cursor = interval.end;
      }
    }

    if (cursor.getTime() < cycleEnd.getTime()) {
      uncovered.push({ start: cursor, end: cycleEnd });
    }

    return uncovered.filter((inv) => inv.start.getTime() < inv.end.getTime());
  }

  /**
   * Retrieves real-time billing usage for a tenant using hybrid calculation.
   * Hybrid read guarantees zero lag:
   * currentUsage = SUM(canonical usage_aggregates in cycle) + SUM(usage_events in uncovered intervals)
   * The calculation is strictly clamped to [cycle.cycleStart, max(cycle.cycleStart, min(referenceDate, cycle.nextCycleStart))] (F1, F3, F4).
   */
  async getUsage(
    businessId: string,
    referenceDate: Date = new Date(),
    client?: PrismaClient | Prisma.TransactionClient,
    options?: GetUsageOptions,
  ): Promise<BillingUsageResponse> {
    if (!businessId || typeof businessId !== "string" || businessId.trim() === "") {
      throw new BadRequestException({
        error: { code: "invalid_business_id", message: "businessId is required" },
      });
    }

    const db = client ?? this.prisma;

    // 1. Resolve tenant subscription and plan limits
    const subscription = await db.subscription.findFirst({
      where: { business_id: businessId },
      include: { plan: true },
      orderBy: { created_at: "desc" },
    });

    let planCode: string = CANONICAL_PLANS.starter.code;
    let limits: BillingLimits = {
      aiMessages: CANONICAL_PLANS.starter.limits.ai_messages_per_month,
      seats: CANONICAL_PLANS.starter.limits.seats,
      channels: CANONICAL_PLANS.starter.limits.channel_accounts,
    };

    if (subscription?.plan) {
      planCode = subscription.plan.code;
      const parsedLimits = PlanLimitsSchema.safeParse(subscription.plan.limits);
      if (parsedLimits.success) {
        limits = {
          aiMessages: parsedLimits.data.ai_messages_per_month,
          seats: parsedLimits.data.seats,
          channels: parsedLimits.data.channel_accounts,
        };
      }
    }

    // 2. Compute billing cycle dates and calculation window bounds (F1, F3, F4)
    const cycle = this.getAfricaTunisBillingCycle(referenceDate);
    const windowEnd = new Date(
      Math.max(
        cycle.cycleStart.getTime(),
        Math.min(referenceDate.getTime(), cycle.nextCycleStart.getTime()),
      ),
    );

    let currentAiMessages = 0;

    // Only query aggregates and raw events if the calculation window is non-empty (F1)
    if (windowEnd.getTime() > cycle.cycleStart.getTime()) {
      // 3. Hybrid Real-Time Quota Read:
      // a. Query aggregates completed within the calculation window (F3)
      const aggregates = await db.usageAggregate.findMany({
        where: {
          business_id: businessId,
          metric: "messages_out_ai",
          period_start: { gte: cycle.cycleStart },
          period_end: { lte: windowEnd },
        },
        orderBy: { period_start: "asc" },
      });

      // Validate and filter canonical hourly non-overlapping aggregates (F3 hardening)
      const validAggregates: { period_start: Date; period_end: Date; quantity: number }[] = [];
      let lastAggEndMs = cycle.cycleStart.getTime();

      for (const agg of aggregates) {
        const startMs = agg.period_start.getTime();
        const endMs = agg.period_end.getTime();
        const isOneHour = endMs - startMs === 3_600_000;
        const isHourAligned =
          agg.period_start.getUTCMinutes() === 0 &&
          agg.period_start.getUTCSeconds() === 0 &&
          agg.period_start.getUTCMilliseconds() === 0;

        if (
          isOneHour &&
          isHourAligned &&
          startMs >= lastAggEndMs &&
          startMs >= cycle.cycleStart.getTime() &&
          endMs <= windowEnd.getTime()
        ) {
          validAggregates.push({
            period_start: agg.period_start,
            period_end: agg.period_end,
            quantity: agg.quantity,
          });
          lastAggEndMs = endMs;
        } else {
          this.logger.warn(
            { businessId, periodStart: agg.period_start, periodEnd: agg.period_end },
            "Ignoring non-canonical, malformed, or overlapping aggregate in hybrid rollup; reverting to raw events",
          );
        }
      }

      const aggregatedAiMessages = validAggregates.reduce((acc, row) => acc + row.quantity, 0);

      // b. Gap-safe complement interval calculation across [cycle.cycleStart, windowEnd) (F1, F4)
      const uncoveredIntervals = this.computeUncoveredIntervals(
        validAggregates,
        cycle.cycleStart,
        windowEnd,
      );

      let rawAiMessages = 0;
      const singleInterval = uncoveredIntervals[0];
      if (uncoveredIntervals.length === 1 && singleInterval) {
        const rawEventsSum = await db.usageEvent.aggregate({
          where: {
            business_id: businessId,
            metric: "messages_out_ai",
            is_test: false,
            recorded_at: {
              gte: singleInterval.start,
              lt: singleInterval.end,
            },
          },
          _sum: {
            quantity: true,
          },
        });
        rawAiMessages = rawEventsSum._sum.quantity ?? 0;
      } else if (uncoveredIntervals.length > 1) {
        const rawEventsSum = await db.usageEvent.aggregate({
          where: {
            business_id: businessId,
            metric: "messages_out_ai",
            is_test: false,
            OR: uncoveredIntervals.map((inv) => ({
              recorded_at: {
                gte: inv.start,
                lt: inv.end,
              },
            })),
          },
          _sum: {
            quantity: true,
          },
        });
        rawAiMessages = rawEventsSum._sum.quantity ?? 0;
      }

      currentAiMessages = aggregatedAiMessages + rawAiMessages;
    }

    // 4. Count active seats and channels
    const [activeSeats, activeChannels] = await Promise.all([
      db.businessMember.count({
        where: {
          business_id: businessId,
          removed_at: null,
        },
      }),
      db.channelAccount.count({
        where: {
          business_id: businessId,
          status: "active",
        },
      }),
    ]);

    // 5. Calculate percentage used (if limit is 0, full quota is consumed)
    const rawPercent = limits.aiMessages > 0 ? (currentAiMessages / limits.aiMessages) * 100 : 100;
    const percentUsed = Math.round(rawPercent * 100) / 100;

    // 6. Hard limit: AI paused when >= 100% or tenant flag/settings paused or plan quota is 0
    let aiPaused = limits.aiMessages <= 0 || percentUsed >= 100;
    if (!aiPaused) {
      const business = await db.business.findUnique({
        where: { id: businessId },
        select: { settings: true },
      });
      if (
        business?.settings &&
        typeof business.settings === "object" &&
        (business.settings as Record<string, unknown>).ai_paused === true
      ) {
        aiPaused = true;
      }
    }

    // 7. Notification side effects (skipped when called inside DB transactions to decouple side effects - F1)
    if (!options?.skipNotifications) {
      // 85% Warning Alert Debounce (at most once per monthly cycle)
      if (percentUsed >= 85) {
        await this.dispatch85WarningIfNeeded(businessId, cycle.periodKey, percentUsed, db);
      }

      // 100% Hard Limit Breach Alert Debounce (FR-BILL-007, at most once per monthly cycle)
      if (percentUsed >= 100 || limits.aiMessages <= 0) {
        await this.dispatch100BreachIfNeeded(businessId, cycle.periodKey, percentUsed, db);
      }
    }

    const result: BillingUsageResponse = {
      cycleStart: cycle.cycleStart.toISOString(),
      cycleEnd: cycle.cycleEnd.toISOString(),
      planCode,
      limits,
      current: {
        aiMessages: currentAiMessages,
        seats: activeSeats,
        channels: activeChannels,
      },
      percentUsed,
      aiPaused,
    };

    return BillingUsageResponseSchema.parse(result);
  }

  /**
   * Atomically claims a notification dedupe key in the database using unique constraint @@unique([user_id, dedupe_key]).
   * Guarantees race-free single-sender execution across concurrent calls and multi-instance deployments (F4).
   * Returns true ONLY to the request that successfully claimed/inserted the row.
   */
  private async claimNotificationDedupe(
    businessId: string,
    dedupeKey: string,
    title: string,
    message: string,
    client: PrismaClient | Prisma.TransactionClient,
  ): Promise<boolean> {
    if (this.dispatchedWarnings.has(dedupeKey)) {
      return false;
    }

    const db = client;

    // Fast DB check if already created previously
    const existing = await db.notification.findFirst({
      where: {
        business_id: businessId,
        dedupe_key: dedupeKey,
      },
    });

    if (existing) {
      this.markWarningDispatched(dedupeKey);
      return false;
    }

    const ownerMember = await db.businessMember.findFirst({
      where: {
        business_id: businessId,
        role: { name: "owner" },
        removed_at: null,
      },
    });

    if (!ownerMember) {
      return false;
    }

    try {
      await db.notification.create({
        data: {
          business_id: businessId,
          user_id: ownerMember.user_id,
          type: "ESCALATION",
          title,
          message,
          entity_type: "business",
          entity_id: businessId,
          dedupe_key: dedupeKey,
        },
      });
      this.markWarningDispatched(dedupeKey);
      return true;
    } catch (err: unknown) {
      const isP2002 =
        (typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2002") ||
        String(err).includes("Unique constraint");
      if (isP2002) {
        this.markWarningDispatched(dedupeKey);
        return false;
      }
      this.logger.warn(
        { err, businessId, dedupeKey },
        "Failed to claim notification dedupe key in database",
      );
      return false;
    }
  }

  /**
   * Atomically checks and records AI message usage within a database transaction.
   * Uses a row-level lock on the tenant business (`SELECT id FROM businesses WHERE id = ... FOR UPDATE`)
   * to serialize concurrent checks and prevent race conditions (F2).
   * Uses a consistent monotonic transaction timestamp (txTimestamp) for all reads, inserts, and alerts (F2).
   * Database transaction is purely transactional; all external notification side effects are scheduled
   * post-commit using canonical methods (F1 & F2).
   * If the requested quantity would breach the 100% quota limit, throws 403 Forbidden with code `ai_paused`
   * and does NOT record any usage event.
   */
  async consumeAiQuota(
    businessId: string,
    quantity = 1,
    client?: PrismaClient | Prisma.TransactionClient,
  ): Promise<QuotaGateResult> {
    if (!businessId || typeof businessId !== "string" || businessId.trim() === "") {
      throw new BadRequestException({
        error: { code: "invalid_business_id", message: "businessId is required" },
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException({
        error: { code: "invalid_quantity", message: "quantity must be a positive integer" },
      });
    }

    // Capture single transaction timestamp at entry (F2)
    const txTimestamp = new Date();

    const runConsumption = async (tx: Prisma.TransactionClient): Promise<QuotaGateResult> => {
      // 1. Serialize concurrent requests for this tenant using row lock (F2)
      await tx.$executeRaw`SELECT id FROM businesses WHERE id = ${businessId}::uuid FOR UPDATE`;

      // 2. Read real-time usage inside the locked transaction using consistent txTimestamp (F1, F2)
      const usage = await this.getUsage(businessId, txTimestamp, tx, { skipNotifications: true });

      const limit = usage.limits.aiMessages;
      const current = usage.current.aiMessages;
      const willExceed = limit <= 0 || current + quantity > limit;

      if (usage.aiPaused || willExceed) {
        throw new ForbiddenException({
          error: {
            code: "ai_paused",
            message: "Monthly AI message quota reached (100%). AI turns are paused.",
            details: {
              percentUsed: usage.percentUsed,
              limit,
              current,
              requested: quantity,
            },
          },
        });
      }

      // 3. Atomically record raw usage event using consistent txTimestamp (F2)
      const periodBucket = this.getAfricaTunisDate(txTimestamp);

      await tx.usageEvent.create({
        data: {
          business_id: businessId,
          metric: "messages_out_ai",
          quantity,
          period_bucket: periodBucket,
          is_test: false,
          recorded_at: txTimestamp,
        },
      });

      const newCurrent = current + quantity;
      const rawPercent = limit > 0 ? (newCurrent / limit) * 100 : 100;
      const newPercentUsed = Math.round(rawPercent * 100) / 100;
      const newAiPaused = newPercentUsed >= 100;

      const updatedUsage: BillingUsageResponse = {
        ...usage,
        current: {
          ...usage.current,
          aiMessages: newCurrent,
        },
        percentUsed: newPercentUsed,
        aiPaused: newAiPaused,
      };

      return {
        allowed: true,
        percentUsed: newPercentUsed,
        aiPaused: newAiPaused,
        usage: updatedUsage,
      };
    };

    let result: QuotaGateResult;
    if (client) {
      if ("$transaction" in client) {
        result = await (client as PrismaClient).$transaction((tx) => runConsumption(tx));
      } else {
        result = await runConsumption(client as Prisma.TransactionClient);
      }
    } else {
      result = await this.prisma.$transaction((tx) => runConsumption(tx));
    }

    // 4. Post-commit unified alert scheduling using consistent txTimestamp cycle (F2)
    const cycle = this.getAfricaTunisBillingCycle(txTimestamp);
    if (result.percentUsed >= 85) {
      await this.dispatch85WarningIfNeeded(businessId, cycle.periodKey, result.percentUsed);
    }
    if (result.percentUsed >= 100 || result.usage.limits.aiMessages <= 0) {
      await this.dispatch100BreachIfNeeded(businessId, cycle.periodKey, result.percentUsed);
    }

    return result;
  }

  /**
   * Quota enforcement gate called before dispatching AI turns or suggestions.
   * Invariant: Human messaging is NEVER blocked; reaching 100% strictly pauses AI turns.
   */
  async checkQuotaGate(
    businessId: string,
    options?: CheckQuotaGateOptions,
  ): Promise<QuotaGateResult> {
    const actorType = options?.actorType ?? "ai";

    // 🔒 Human Messaging Preserved: Human replies are never blocked
    if (actorType === "human") {
      const usage = await this.getUsage(businessId, new Date(), options?.tx);
      return {
        allowed: true,
        percentUsed: usage.percentUsed,
        aiPaused: usage.aiPaused,
        usage,
      };
    }

    if (options?.atomicConsume) {
      return this.consumeAiQuota(businessId, options.quantity ?? 1, options.tx);
    }

    const usage = await this.getUsage(businessId, new Date(), options?.tx);

    if (usage.aiPaused) {
      if (options?.throwOnBlocked) {
        throw new ForbiddenException({
          error: {
            code: "ai_paused",
            message: "Monthly AI message quota reached (100%). AI turns are paused.",
            details: {
              percentUsed: usage.percentUsed,
              limit: usage.limits.aiMessages,
              current: usage.current.aiMessages,
            },
          },
        });
      }

      return {
        allowed: false,
        percentUsed: usage.percentUsed,
        aiPaused: true,
        usage,
      };
    }

    return {
      allowed: true,
      percentUsed: usage.percentUsed,
      aiPaused: false,
      usage,
    };
  }

  /**
   * Strictly enforces AI quota gate, throwing 403 Forbidden with code `ai_paused` if exhausted.
   */
  async enforceAiQuotaGate(
    businessId: string,
    options?: {
      atomicConsume?: boolean;
      quantity?: number;
      tx?: PrismaClient | Prisma.TransactionClient;
    },
  ): Promise<QuotaGateResult> {
    return this.checkQuotaGate(businessId, {
      actorType: "ai",
      throwOnBlocked: true,
      atomicConsume: options?.atomicConsume,
      quantity: options?.quantity,
      tx: options?.tx,
    });
  }

  /**
   * Dispatches warning notification `USAGE_WARNING_85` with cycle-scoped deduplication.
   * Fires at most once per tenant per monthly billing cycle.
   * Persisted DB notification serves as the intentional in-app delivery path (F3).
   */
  private async dispatch85WarningIfNeeded(
    businessId: string,
    periodKey: string,
    percentUsed: number,
    client?: PrismaClient | Prisma.TransactionClient,
  ): Promise<void> {
    const dedupeKey = `usage_warning_85:${businessId}:${periodKey}`;
    const title = "Usage Limit Warning (85%)";
    const message = `Business has reached ${Math.round(percentUsed)}% of monthly message quota.`;

    const claimed = await this.claimNotificationDedupe(
      businessId,
      dedupeKey,
      title,
      message,
      client ?? this.prisma,
    );

    if (!claimed) {
      return;
    }

    if (this.notificationDispatcher) {
      try {
        await this.notificationDispatcher.dispatch({
          type: "USAGE_WARNING_85",
          businessId,
          entityType: "business",
          entityId: businessId,
          title,
          message,
          dedupeKey,
          suppressionTtlSeconds: 35 * 24 * 3600,
        });
      } catch (err) {
        this.logger.warn(
          { err, businessId, dedupeKey },
          "Failed to dispatch USAGE_WARNING_85 notification",
        );
      }
    } else {
      this.logger.log(
        { businessId, dedupeKey },
        "In-app notification persisted directly to database (dispatcher not configured)",
      );
    }
  }

  /**
   * Dispatches hard limit notification `USAGE_BREACH_100` with cycle-scoped deduplication.
   * Fires at most once per tenant per monthly billing cycle (FR-BILL-007).
   * Persisted DB notification serves as the intentional in-app delivery path (F3).
   */
  private async dispatch100BreachIfNeeded(
    businessId: string,
    periodKey: string,
    percentUsed: number,
    client?: PrismaClient | Prisma.TransactionClient,
  ): Promise<void> {
    const dedupeKey = `usage_breach_100:${businessId}:${periodKey}`;
    const title = "Usage Limit Reached (100%)";
    const message = `Business has reached ${Math.round(percentUsed)}% of monthly message quota. AI auto-reply is paused.`;

    const claimed = await this.claimNotificationDedupe(
      businessId,
      dedupeKey,
      title,
      message,
      client ?? this.prisma,
    );

    if (!claimed) {
      return;
    }

    if (this.notificationDispatcher) {
      try {
        await this.notificationDispatcher.dispatch({
          type: "USAGE_BREACH_100",
          businessId,
          entityType: "business",
          entityId: businessId,
          title,
          message,
          dedupeKey,
          suppressionTtlSeconds: 35 * 24 * 3600,
        });
      } catch (err) {
        this.logger.warn(
          { err, businessId, dedupeKey },
          "Failed to dispatch USAGE_BREACH_100 notification",
        );
      }
    } else {
      this.logger.log(
        { businessId, dedupeKey },
        "In-app notification persisted directly to database (dispatcher not configured)",
      );
    }
  }
}
