import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import type { PrismaClient, UsageEvent, UsageAggregate, UsageMetric } from "@prisma/client";

import { RecordUsageSchema, TUNISIA_TIMEZONE, type RecordUsageDto } from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { InjectPrisma } from "../../platform/core/prisma.token";

const TUNISIA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TUNISIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface RawUsageEventsFilter {
  metric?: UsageMetric;
  startDate?: Date;
  endDate?: Date;
  isTest?: boolean;
  periodBucket?: Date;
}

export interface UsageAggregatesFilter {
  periodStart?: Date;
  periodEnd?: Date;
  metric?: UsageMetric;
}

export interface SyncUsageAggregatesOptions {
  periodStart: Date;
  periodEnd: Date;
  businessId?: string;
  excludeTest?: boolean;
}

@Injectable()
export class MeteringService {
  private readonly logger = new Logger(MeteringService.name);
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Computes the calendar day Date in Africa/Tunis timezone (at UTC 00:00:00.000Z).
   * 12 §12.3: `period_bucket = DATE(NOW() AT TIME ZONE 'Africa/Tunis')`
   */
  getAfricaTunisDate(date: Date = new Date()): Date {
    const dateStr = TUNISIA_DATE_FORMATTER.format(date); // Format: "YYYY-MM-DD"
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  /**
   * Returns date string in Africa/Tunis timezone (YYYY-MM-DD).
   */
  getAfricaTunisDateString(date: Date = new Date()): string {
    return TUNISIA_DATE_FORMATTER.format(date);
  }

  /**
   * Records a raw usage event into append-only `usage_events` table.
   * Non-blocking ingestion: Sub-millisecond insert latency.
   *
   * Supports both positional parameter signature and options DTO.
   */
  async recordUsage(
    businessIdOrDto: string | RecordUsageDto,
    metricParam?: UsageMetric,
    quantityParam?: number,
    isTestParam?: boolean,
    recordedAtParam?: Date,
  ): Promise<UsageEvent> {
    const rawPayload: unknown =
      typeof businessIdOrDto === "string"
        ? {
            businessId: businessIdOrDto,
            metric: metricParam,
            quantity: quantityParam,
            isTest: isTestParam,
            recordedAt: recordedAtParam,
          }
        : businessIdOrDto;

    const parsed = RecordUsageSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const firstIssue = issue ? issue.message : "Invalid usage recording payload";
      throw new BadRequestException({
        error: { code: "invalid_usage_event", message: firstIssue },
      });
    }

    const { businessId, metric, quantity, isTest, recordedAt } = parsed.data;
    const timestamp = recordedAt ?? new Date();
    const periodBucket = this.getAfricaTunisDate(timestamp);

    let event: UsageEvent;
    if (metric === "messages_out_ai") {
      event = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM businesses WHERE id = ${businessId}::uuid FOR UPDATE`;
        return tx.usageEvent.create({
          data: {
            business_id: businessId,
            metric,
            quantity,
            period_bucket: periodBucket,
            is_test: isTest,
            recorded_at: timestamp,
          },
        });
      });
    } else {
      event = await this.prisma.usageEvent.create({
        data: {
          business_id: businessId,
          metric,
          quantity,
          period_bucket: periodBucket,
          is_test: isTest,
          recorded_at: timestamp,
        },
      });
    }

    this.logger.debug(
      {
        eventId: event.id,
        businessId: event.business_id,
        metric: event.metric,
        quantity: event.quantity,
        periodBucket: event.period_bucket,
        isTest: event.is_test,
      },
      "Recorded raw usage event",
    );

    return event;
  }

  /**
   * Retrieves raw usage events with strict tenant isolation.
   */
  async getRawUsageEvents(
    businessId: string,
    options?: RawUsageEventsFilter,
  ): Promise<UsageEvent[]> {
    if (!businessId) {
      throw new BadRequestException({
        error: { code: "invalid_business_id", message: "businessId is required" },
      });
    }

    const where: {
      business_id: string;
      metric?: UsageMetric;
      recorded_at?: { gte?: Date; lt?: Date };
      is_test?: boolean;
      period_bucket?: Date;
    } = {
      business_id: businessId,
    };

    if (options?.metric) {
      where.metric = options.metric;
    }
    if (options?.isTest !== undefined) {
      where.is_test = options.isTest;
    }
    if (options?.periodBucket) {
      where.period_bucket = options.periodBucket;
    }
    if (options?.startDate || options?.endDate) {
      where.recorded_at = {};
      if (options.startDate) {
        where.recorded_at.gte = options.startDate;
      }
      if (options.endDate) {
        where.recorded_at.lt = options.endDate;
      }
    }

    return this.prisma.usageEvent.findMany({
      where,
      orderBy: [{ recorded_at: "asc" }],
    });
  }

  /**
   * Aggregates raw events for a tenant within a time window grouped by metric.
   */
  async aggregateUsage(
    businessId: string,
    periodStart: Date,
    periodEnd: Date,
    excludeTest = true,
  ): Promise<Partial<Record<UsageMetric, number>>> {
    if (!businessId) {
      throw new BadRequestException({
        error: { code: "invalid_business_id", message: "businessId is required" },
      });
    }

    const events = await this.prisma.usageEvent.groupBy({
      by: ["metric"],
      where: {
        business_id: businessId,
        recorded_at: {
          gte: periodStart,
          lt: periodEnd,
        },
        ...(excludeTest ? { is_test: false } : {}),
      },
      _sum: {
        quantity: true,
      },
    });

    const result: Partial<Record<UsageMetric, number>> = {};
    for (const row of events) {
      result[row.metric] = row._sum.quantity ?? 0;
    }
    return result;
  }

  /**
   * Aggregates raw usage events into `usage_aggregates` table.
   * Upserts idempotently on unique `(business_id, period_start, metric)`.
   * Rollups skip `is_test = true` events.
   */
  async syncUsageAggregates(
    options: SyncUsageAggregatesOptions,
  ): Promise<{ syncedCount: number; records: UsageAggregate[] }> {
    const { periodStart, periodEnd, businessId, excludeTest = true } = options;

    const whereClause: {
      recorded_at: { gte: Date; lt: Date };
      is_test?: boolean;
      business_id?: string;
    } = {
      recorded_at: {
        gte: periodStart,
        lt: periodEnd,
      },
    };

    if (excludeTest) {
      whereClause.is_test = false;
    }
    if (businessId) {
      whereClause.business_id = businessId;
    }

    const grouped = await this.prisma.usageEvent.groupBy({
      by: ["business_id", "metric"],
      where: whereClause,
      _sum: {
        quantity: true,
      },
    });

    const syncedRecords: UsageAggregate[] = await Promise.all(
      grouped.map(async (item) => {
        const sumQuantity = item._sum.quantity ?? 0;
        return this.prisma.usageAggregate.upsert({
          where: {
            business_id_period_start_metric: {
              business_id: item.business_id,
              period_start: periodStart,
              metric: item.metric,
            },
          },
          create: {
            business_id: item.business_id,
            period_start: periodStart,
            period_end: periodEnd,
            metric: item.metric,
            quantity: sumQuantity,
          },
          update: {
            period_end: periodEnd,
            quantity: sumQuantity,
          },
        });
      }),
    );

    this.logger.log(
      {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        businessId,
        syncedCount: syncedRecords.length,
      },
      "Synchronized usage aggregates",
    );

    return {
      syncedCount: syncedRecords.length,
      records: syncedRecords,
    };
  }

  /**
   * Queries `usage_aggregates` table for a tenant with strict isolation.
   */
  async getAggregates(
    businessId: string,
    options?: UsageAggregatesFilter,
  ): Promise<UsageAggregate[]> {
    if (!businessId) {
      throw new BadRequestException({
        error: { code: "invalid_business_id", message: "businessId is required" },
      });
    }

    const where: {
      business_id: string;
      metric?: UsageMetric;
      period_start?: { gte?: Date };
      period_end?: { lte?: Date };
    } = {
      business_id: businessId,
    };

    if (options?.metric) {
      where.metric = options.metric;
    }
    if (options?.periodStart) {
      where.period_start = { gte: options.periodStart };
    }
    if (options?.periodEnd) {
      where.period_end = { lte: options.periodEnd };
    }

    return this.prisma.usageAggregate.findMany({
      where,
      orderBy: [{ period_start: "asc" }],
    });
  }
}
