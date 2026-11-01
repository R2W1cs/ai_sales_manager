import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker, type Job, UnrecoverableError } from "bullmq";

import { SyncUsageAggregatesJobDataSchema, type SyncUsageAggregatesJobData } from "@app/shared";

import { connection } from "../../lib/queue";
import { MeteringService } from "./metering.service";

/**
 * 14 §7 Background jobs:
 * Queue: `billing`
 * Job: `sync_usage_aggregates`
 * Schedule: cron hourly (`0 * * * *`)
 * Uniqueness: `{businessId}:{hour}`
 */
export const BILLING_QUEUE = "billing";
export const SYNC_USAGE_AGGREGATES_JOB = "sync_usage_aggregates";
export const SYNC_USAGE_AGGREGATES_REPEAT_JOB_ID = "sync_usage_aggregates_hourly";
export const BILLING_QUEUE_TOKEN = "BILLING_QUEUE";

export interface SyncUsageAggregatesResult {
  success: boolean;
  syncedCount: number;
  periodStart: string;
  periodEnd: string;
  businessId?: string;
  error?: string;
}

@Injectable()
export class MeteringProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeteringProcessor.name);
  private queue: Queue<SyncUsageAggregatesJobData> | null = null;
  private worker: Worker<SyncUsageAggregatesJobData> | null = null;

  constructor(
    @Inject(MeteringService)
    private readonly meteringService: MeteringService,
    @Optional() @Inject(BILLING_QUEUE_TOKEN) queue?: Queue<SyncUsageAggregatesJobData>,
  ) {
    this.queue = queue ?? null;
  }

  async onModuleInit() {
    try {
      this.queue ??= new Queue<SyncUsageAggregatesJobData>(BILLING_QUEUE, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      });

      // Register hourly repeatable cron job (0 * * * *)
      await this.setupRepeatableJob();

      this.worker = new Worker<SyncUsageAggregatesJobData>(
        BILLING_QUEUE,
        async (job: Job<SyncUsageAggregatesJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job, result: SyncUsageAggregatesResult | undefined) => {
        this.logger.log(
          {
            jobId: job.id,
            jobName: job.name,
            syncedCount: result?.syncedCount,
            periodStart: result?.periodStart,
            periodEnd: result?.periodEnd,
          },
          "Usage aggregates sync job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        this.logger.error(
          {
            jobId: job?.id,
            jobName: job?.name,
            err,
          },
          "Usage aggregates sync job failed",
        );
      });

      this.worker.on("error", (err) => {
        this.logger.warn({ err }, "BullMQ worker connection error in MeteringProcessor");
      });
    } catch (err) {
      this.logger.error({ err }, "Could not initialize BullMQ worker for MeteringProcessor");
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) {
        await this.worker.close();
        this.worker = null;
      }
      if (this.queue) {
        await this.queue.close();
        this.queue = null;
      }
    } catch (err) {
      this.logger.warn({ err }, "Error closing MeteringProcessor queue/worker");
    }
  }

  /**
   * Configures repeatable job running every hour idempotently.
   */
  private async setupRepeatableJob() {
    if (!this.queue) return;
    try {
      interface QueueWithSchedulers {
        upsertJobScheduler?: (
          key: string,
          repeat: { pattern: string },
          job: {
            name: string;
            data: SyncUsageAggregatesJobData;
            opts: {
              attempts: number;
              backoff: { type: string; delay: number };
              removeOnComplete: number;
              removeOnFail: number;
            };
          },
        ) => Promise<unknown>;
        getJobSchedulers?: () => Promise<{ key?: string; name?: string }[]>;
        getRepeatableJobs?: () => Promise<{ id?: string; name?: string; key?: string }[]>;
      }

      const schedulersQueue = this.queue as unknown as QueueWithSchedulers;

      const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
        const timeoutMs = process.env.NODE_ENV === "test" ? 10000 : 3000;
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Timeout connecting to Redis for repeatable job")),
            timeoutMs,
          );
          timer.unref?.();
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
      };

      // BullMQ v5 Job Scheduler API check
      if (typeof schedulersQueue.upsertJobScheduler === "function") {
        await withTimeout(
          schedulersQueue.upsertJobScheduler(
            SYNC_USAGE_AGGREGATES_REPEAT_JOB_ID,
            { pattern: "0 * * * *" },
            {
              name: SYNC_USAGE_AGGREGATES_JOB,
              // Do NOT include enqueuedAt here. BullMQ copies the template data onto every
              // repeated tick, so a boot-time timestamp would permanently freeze the window.
              // processJob derives the window from job.timestamp, which BullMQ sets fresh
              // on each occurrence.
              data: {},
              opts: {
                attempts: 3,
                backoff: {
                  type: "exponential",
                  delay: 5000,
                },
                removeOnComplete: 100,
                removeOnFail: 100,
              },
            },
          ),
        );
        return;
      }

      if (typeof schedulersQueue.getJobSchedulers === "function") {
        const schedulers = await schedulersQueue.getJobSchedulers();
        const alreadyExists = schedulers.some((s) => s.key === SYNC_USAGE_AGGREGATES_REPEAT_JOB_ID);
        if (alreadyExists) {
          this.logger.debug("Repeatable usage aggregates sync job already registered");
          return;
        }
      }

      if (typeof schedulersQueue.getRepeatableJobs === "function") {
        const repeatableJobs = await schedulersQueue.getRepeatableJobs();
        const alreadyExists = repeatableJobs.some(
          (r) =>
            r.id === SYNC_USAGE_AGGREGATES_REPEAT_JOB_ID ||
            (typeof r.key === "string" && r.key.includes(SYNC_USAGE_AGGREGATES_REPEAT_JOB_ID)),
        );
        if (alreadyExists) {
          this.logger.debug("Repeatable usage aggregates sync job already registered");
          return;
        }
      }

      await this.queue.add(
        SYNC_USAGE_AGGREGATES_JOB,
        // Do NOT include enqueuedAt here — same reason as the upsertJobScheduler path above.
        {},
        {
          jobId: SYNC_USAGE_AGGREGATES_REPEAT_JOB_ID,
          repeat: {
            pattern: "0 * * * *", // Hourly
          },
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.error({ err }, "Failed to configure repeatable usage aggregates sync job");
      throw err;
    }
  }

  /**
   * Manually or programmatically triggers an aggregation sync.
   */
  async triggerSync(data?: SyncUsageAggregatesJobData) {
    if (!this.queue) {
      this.logger.warn("Cannot trigger sync: queue is not initialized");
      return null;
    }

    const payloadToValidate: SyncUsageAggregatesJobData = {
      ...data,
      enqueuedAt: Date.now(),
    };

    const parsed = SyncUsageAggregatesJobDataSchema.safeParse(payloadToValidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const issueMsg = issue ? issue.message : "Invalid triggerSync parameters";
      throw new BadRequestException({
        error: { code: "invalid_sync_params", message: issueMsg },
      });
    }

    const { businessId, periodStart, periodEnd, referenceTime, hour, enqueuedAt } = parsed.data;

    let startDate: Date;
    let endDate: Date;

    if (periodStart && periodEnd) {
      startDate = new Date(periodStart);
      endDate = new Date(periodEnd);
    } else if (referenceTime || hour) {
      const timeInput = referenceTime ?? hour ?? "";
      const dateStr =
        timeInput.length === 13 && !timeInput.includes(":") ? `${timeInput}:00:00.000Z` : timeInput;
      const ref = new Date(dateStr);
      if (isNaN(ref.getTime())) {
        throw new BadRequestException({
          error: {
            code: "invalid_sync_params",
            message: `Invalid referenceTime/hour timestamp: ${timeInput}`,
          },
        });
      }
      const hourMs = 60 * 60 * 1000;
      const startMs = Math.floor(ref.getTime() / hourMs) * hourMs;
      startDate = new Date(startMs);
      endDate = new Date(startMs + hourMs);
    } else {
      // Default: previous full completed 1-hour window from enqueuedAt
      const now = new Date(enqueuedAt ?? Date.now());
      const hourMs = 60 * 60 * 1000;
      const currentHourStartMs = Math.floor(now.getTime() / hourMs) * hourMs;
      endDate = new Date(currentHourStartMs);
      startDate = new Date(currentHourStartMs - hourMs);
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      throw new BadRequestException({
        error: {
          code: "invalid_sync_params",
          message: "Calculated periodStart must be valid and strictly before periodEnd",
        },
      });
    }

    const hourKey = startDate.toISOString().slice(0, 13);
    const jobId = businessId ? `${businessId}:sync:${hourKey}` : `global:sync:${hourKey}`;

    const jobPayload: SyncUsageAggregatesJobData = {
      businessId,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
      hour,
      referenceTime,
      enqueuedAt,
    };

    return this.queue.add(SYNC_USAGE_AGGREGATES_JOB, jobPayload, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  /**
   * Processes a sync_usage_aggregates job from BullMQ.
   */
  async processJob(job: Job<SyncUsageAggregatesJobData>): Promise<SyncUsageAggregatesResult> {
    if (job.name !== SYNC_USAGE_AGGREGATES_JOB) {
      // The `billing` queue is spec'd to carry only `sync_usage_aggregates` (14 §7).
      // Any other job name here indicates a misconfiguration or code bug.
      // Throw UnrecoverableError so BullMQ surfaces it as a hard failure (visible in
      // dashboards / alerts) rather than silently acknowledging and discarding it.
      throw new UnrecoverableError(
        `Unexpected job '${job.name}' on billing queue — only '${SYNC_USAGE_AGGREGATES_JOB}' is supported`,
      );
    }

    const parseResult = SyncUsageAggregatesJobDataSchema.safeParse(job.data);
    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      const validationMsg = issues
        .map((e) => `${e.path.join(".") || "payload"}: ${e.message}`)
        .join(", ");
      this.logger.error({ jobId: job.id, errors: issues }, "Invalid usage aggregation job payload");
      throw new UnrecoverableError(`Invalid job data: ${validationMsg}`);
    }

    const { businessId, periodStart, periodEnd, referenceTime, hour, enqueuedAt } =
      parseResult.data;

    let startDate: Date;
    let endDate: Date;

    if (periodStart && periodEnd) {
      startDate = new Date(periodStart);
      endDate = new Date(periodEnd);
    } else if (referenceTime || hour) {
      const timeInput = referenceTime ?? hour ?? "";
      const dateStr =
        timeInput.length === 13 && !timeInput.includes(":") ? `${timeInput}:00:00.000Z` : timeInput;
      const ref = new Date(dateStr);
      if (isNaN(ref.getTime())) {
        throw new UnrecoverableError(`Invalid referenceTime/hour timestamp: ${timeInput}`);
      }
      // Containing hour window [top of hour, top of next hour)
      const hourMs = 60 * 60 * 1000;
      const startMs = Math.floor(ref.getTime() / hourMs) * hourMs;
      startDate = new Date(startMs);
      endDate = new Date(startMs + hourMs);
    } else {
      // For cron-produced ticks the data payload is empty (no enqueuedAt); we must derive
      // the window from job.timestamp, which BullMQ sets to the actual scheduled-fire time
      // of that specific occurrence. enqueuedAt is only present on manual triggerSync payloads
      // and is used as a last-resort fallback when job.timestamp is missing.
      const triggerTimeMs =
        typeof job.timestamp === "number" ? job.timestamp : (enqueuedAt ?? Date.now());
      const hourMs = 60 * 60 * 1000;
      const currentHourStartMs = Math.floor(triggerTimeMs / hourMs) * hourMs;
      endDate = new Date(currentHourStartMs);
      startDate = new Date(currentHourStartMs - hourMs);
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new UnrecoverableError("Invalid start or end date in usage sync job");
    }

    if (startDate >= endDate) {
      throw new UnrecoverableError("periodStart must be strictly before periodEnd");
    }

    try {
      const result = await this.meteringService.syncUsageAggregates({
        periodStart: startDate,
        periodEnd: endDate,
        businessId,
        excludeTest: true,
      });

      return {
        success: true,
        syncedCount: result.syncedCount,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        businessId,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { jobId: job.id, err: errorMsg, periodStart: startDate, periodEnd: endDate },
        "Error processing usage aggregates sync job",
      );
      throw err;
    }
  }
}
