import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker, type Job, UnrecoverableError } from "bullmq";

import { connection } from "../../lib/queue";
import {
  DEFAULT_ANALYTICS_TIMEZONE,
  DailyRollupService,
  getYesterdayStringInTimezone,
  type RollupMetricsResult,
} from "./daily-rollup.service";

/**
 * 14 §7 Background jobs:
 * Queue: `analytics`
 * Job: `rollup_daily`
 * Schedule: cron 00:05 UTC nightly (`5 0 * * *`)
 * Uniqueness: `{businessId}:{day}` or `all:rollup:{day}`
 */
export const ANALYTICS_QUEUE = "analytics";
export const ROLLUP_DAILY_JOB = "rollup_daily";
export const ROLLUP_DAILY_REPEAT_JOB_ID = "rollup_daily_nightly";
export const ANALYTICS_QUEUE_TOKEN = "ANALYTICS_QUEUE";

/** Shared retry & cleanup policy for all rollup_daily jobs. */
const ROLLUP_JOB_OPTS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const;

export interface RollupDailyJobData {
  businessId?: string;
  day?: string;
  enqueuedAt?: number;
}

export interface RollupJobResult {
  success: boolean;
  processedCount: number;
  businessId?: string;
  day?: string;
  results?: RollupMetricsResult[];
  error?: string;
}

@Injectable()
export class DailyRollupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyRollupProcessor.name);
  private queue: Queue<RollupDailyJobData> | null = null;
  private worker: Worker<RollupDailyJobData> | null = null;

  constructor(
    @Inject(DailyRollupService)
    private readonly dailyRollupService: DailyRollupService,
    @Optional()
    @Inject(ANALYTICS_QUEUE_TOKEN)
    queue?: Queue<RollupDailyJobData>,
  ) {
    this.queue = queue ?? null;
  }

  async onModuleInit() {
    try {
      this.queue ??= new Queue<RollupDailyJobData>(ANALYTICS_QUEUE, {
        connection,
        defaultJobOptions: ROLLUP_JOB_OPTS,
      });

      // Register 00:05 UTC nightly repeatable job (5 0 * * *)
      await this.setupRepeatableJob();

      this.worker = new Worker<RollupDailyJobData>(
        ANALYTICS_QUEUE,
        async (job: Job<RollupDailyJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job, result: RollupJobResult | undefined) => {
        this.logger.log(
          {
            jobId: job.id,
            jobName: job.name,
            processedCount: result?.processedCount,
            businessId: result?.businessId,
            day: result?.day,
          },
          "Daily analytics rollup job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        this.logger.error(
          {
            jobId: job?.id,
            jobName: job?.name,
            err,
          },
          "Daily analytics rollup job failed",
        );
      });

      this.worker.on("error", (err) => {
        this.logger.warn({ err }, "BullMQ worker connection error in DailyRollupProcessor");
      });
    } catch (err) {
      this.logger.error({ err }, "Could not initialize BullMQ worker for DailyRollupProcessor");
      if (this.worker) {
        await this.worker.close().catch(() => {});
        this.worker = null;
      }
      if (this.queue) {
        await this.queue.close().catch(() => {});
        this.queue = null;
      }
      if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") {
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
      this.logger.warn({ err }, "Error closing DailyRollupProcessor queue/worker");
    }
  }

  /**
   * Configures repeatable job running at 00:05 UTC nightly via BullMQ v5 Job Scheduler API.
   */
  private async setupRepeatableJob() {
    if (!this.queue) return;
    try {
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

      if (typeof this.queue.upsertJobScheduler === "function") {
        await withTimeout(
          this.queue.upsertJobScheduler(
            ROLLUP_DAILY_REPEAT_JOB_ID,
            { pattern: "5 0 * * *" },
            {
              name: ROLLUP_DAILY_JOB,
              data: {},
              opts: ROLLUP_JOB_OPTS,
            },
          ),
        );
        return;
      }

      throw new Error("BullMQ Queue does not support upsertJobScheduler API");
    } catch (err) {
      this.logger.error({ err }, "Failed to configure repeatable daily rollup job");
      throw err;
    }
  }

  /**
   * Triggers an ad-hoc or targeted daily rollup.
   */
  async triggerRollup(data?: RollupDailyJobData) {
    if (!this.queue) {
      this.logger.error("Cannot trigger rollup: analytics queue is not initialized");
      throw new Error("Cannot trigger rollup: analytics queue is not initialized");
    }

    const businessId = data?.businessId;
    const day = data?.day ?? getYesterdayStringInTimezone();
    const jobId = businessId ? `${businessId}:${day}` : `all:${day}`;

    return this.queue.add(
      ROLLUP_DAILY_JOB,
      {
        businessId,
        day,
        enqueuedAt: Date.now(),
      },
      {
        jobId,
        ...ROLLUP_JOB_OPTS,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  /**
   * Processes a rollup_daily job from BullMQ.
   */
  async processJob(job: Job<RollupDailyJobData>): Promise<RollupJobResult> {
    if (job.name !== ROLLUP_DAILY_JOB) {
      throw new UnrecoverableError(
        `Unexpected job '${job.name}' on analytics queue — only '${ROLLUP_DAILY_JOB}' is supported`,
      );
    }

    const { businessId, day } = job.data ?? {};

    try {
      if (businessId) {
        const result = await this.dailyRollupService.rollupBusiness(businessId, day);
        return {
          success: true,
          processedCount: 1,
          businessId,
          day: result.day,
          results: [result],
        };
      }

      // Fan-out nightly scheduler: enqueue one independent job per business with durable success state
      if (this.queue) {
        const businesses = await this.dailyRollupService.getActiveBusinesses();
        const jobs = businesses.map((b) => {
          const tz = b.timezone || DEFAULT_ANALYTICS_TIMEZONE;
          const targetDay = day ?? getYesterdayStringInTimezone(new Date(), tz);
          return {
            name: ROLLUP_DAILY_JOB,
            data: {
              businessId: b.id,
              day: targetDay,
              enqueuedAt: Date.now(),
            },
            opts: {
              jobId: `${b.id}:${targetDay}`,
              ...ROLLUP_JOB_OPTS,
              removeOnComplete: true,
              removeOnFail: false,
            },
          };
        });

        if (jobs.length > 0) {
          await this.queue.addBulk(jobs);
        }

        return {
          success: true,
          processedCount: jobs.length,
          day,
        };
      }

      // Direct sequential fallback when queue instance is not attached
      const { processedCount, results, failures } =
        await this.dailyRollupService.rollupAllBusinesses(day);

      if (failures && failures.length > 0) {
        const errorDetail = failures.map((f) => `${f.businessId}: ${f.error}`).join("; ");
        throw new Error(`Daily rollup failed for ${failures.length} businesses: ${errorDetail}`);
      }

      return {
        success: true,
        processedCount,
        day,
        results,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { jobId: job.id, businessId, day, err: errorMsg },
        "Error executing daily rollup job",
      );
      throw err;
    }
  }
}
