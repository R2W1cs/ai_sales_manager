import {
  BadRequestException,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Inject,
  Optional,
} from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";
import { z } from "zod";

import { logger } from "../../lib/logger";
import { connection } from "../../lib/queue";
import {
  ReservationSweeperService,
  DEFAULT_SWEEP_BATCH_SIZE,
  type SweepResult,
} from "./reservation-sweeper.service";

/**
 * 14 §7 Background jobs:
 * Queue: `maintenance`
 * Job: `expire_reservations`
 * Schedule: cron every 1 minute
 */
export const MAINTENANCE_QUEUE = "maintenance";
export const EXPIRE_RESERVATIONS_JOB = "expire_reservations";
export const EXPIRE_RESERVATIONS_REPEAT_JOB_ID = "expire_reservations_singleton";
export const RESERVATION_SWEEPER_QUEUE = "RESERVATION_SWEEPER_QUEUE";
export const MAX_SWEEP_PAGES = 10;

export const ExpireReservationsJobDataSchema = z.strictObject({
  businessId: z.uuid({ message: "businessId must be a valid UUID" }).optional(),
  referenceTime: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "referenceTime must be a valid ISO date string",
    })
    .optional(),
  enqueuedAt: z.number().int().nonnegative().optional(),
});

export type ExpireReservationsJobData = z.infer<typeof ExpireReservationsJobDataSchema>;

export interface ReservationSweeperResult {
  success: boolean;
  sweptCount?: number;
  cancelledOrderCount?: number;
  expiredReservationIds?: string[];
  cancelledOrderIds?: string[];
  pagesProcessed?: number;
  /** True when the sweep was capped at MAX_SWEEP_PAGES and expired reservations may remain. */
  hasMore?: boolean;
  error?: string;
}

@Injectable()
export class ReservationSweeperProcessor implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<ExpireReservationsJobData> | null = null;
  private worker: Worker<ExpireReservationsJobData> | null = null;
  private isSweeping = false;

  constructor(
    @Inject(ReservationSweeperService)
    private readonly sweeperService: ReservationSweeperService,
    @Optional() @Inject(RESERVATION_SWEEPER_QUEUE) queue?: Queue<ExpireReservationsJobData>,
  ) {
    this.queue = queue ?? null;
  }

  async onModuleInit() {
    try {
      this.queue ??= new Queue<ExpireReservationsJobData>(MAINTENANCE_QUEUE, {
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

      // Register 1-minute repeatable cron job
      await this.setupRepeatableJob();

      this.worker = new Worker<ExpireReservationsJobData>(
        MAINTENANCE_QUEUE,
        async (job: Job<ExpireReservationsJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 1, // Singleton execution per env
        },
      );

      this.worker.on("completed", (job, result) => {
        logger.info(
          {
            jobId: job.id,
            jobName: job.name,
            result,
          },
          "Reservation sweeper job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        logger.error(
          {
            jobId: job?.id,
            jobName: job?.name,
            err,
          },
          "Reservation sweeper job failed",
        );
      });
    } catch (err) {
      logger.error({ err }, "Could not initialize BullMQ worker for reservation sweeper");
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) {
        await Promise.race([
          this.worker.close(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        this.worker = null;
      }
      if (this.queue) {
        await this.queue.close();
        this.queue = null;
      }
    } catch (err) {
      logger.warn({ err }, "Error closing reservation sweeper queue/worker");
    }
  }

  /**
   * Sets up repeatable job running every 1 minute idempotently.
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
            data: ExpireReservationsJobData;
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
            EXPIRE_RESERVATIONS_REPEAT_JOB_ID,
            { pattern: "* * * * *" },
            {
              name: EXPIRE_RESERVATIONS_JOB,
              data: { enqueuedAt: Date.now() },
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
        // Match on the exact scheduler key only — name alone is too broad (F13).
        const alreadyExists = schedulers.some((s) => s.key === EXPIRE_RESERVATIONS_REPEAT_JOB_ID);
        if (alreadyExists) {
          logger.info("Repeatable reservation sweeper job already registered in queue");
          return;
        }
      }

      if (typeof schedulersQueue.getRepeatableJobs === "function") {
        const repeatableJobs = await schedulersQueue.getRepeatableJobs();
        // Match on the exact ID or key only — name-based matching can skip re-registration
        // when a scheduler exists with the right name but wrong pattern (F13).
        const alreadyExists = repeatableJobs.some(
          (r) =>
            r.id === EXPIRE_RESERVATIONS_REPEAT_JOB_ID ||
            (typeof r.key === "string" && r.key.includes(EXPIRE_RESERVATIONS_REPEAT_JOB_ID)),
        );
        if (alreadyExists) {
          logger.info("Repeatable reservation sweeper job already registered in queue");
          return;
        }
      }

      await this.queue.add(
        EXPIRE_RESERVATIONS_JOB,
        { enqueuedAt: Date.now() },
        {
          jobId: EXPIRE_RESERVATIONS_REPEAT_JOB_ID,
          repeat: {
            pattern: "* * * * *", // Every minute
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
      logger.error({ err }, "Failed to configure repeatable reservation sweeper job");
    }
  }

  /**
   * Manual or ad-hoc trigger for sweeping reservations with producer validation.
   */
  async triggerSweep(businessId?: string, referenceTime?: string) {
    if (!this.queue) {
      logger.warn("Cannot trigger sweep: queue is not initialized");
      return null;
    }

    const payloadToValidate: ExpireReservationsJobData = {
      ...(businessId ? { businessId } : {}),
      ...(referenceTime ? { referenceTime } : {}),
      enqueuedAt: Date.now(),
    };

    const parsed = ExpireReservationsJobDataSchema.safeParse(payloadToValidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid triggerSweep parameters";
      throw new BadRequestException({ error: { code: "invalid_sweep_params", message: issue } });
    }

    try {
      return await this.queue.add(EXPIRE_RESERVATIONS_JOB, parsed.data, {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });
    } catch (err) {
      logger.error({ err, businessId }, "Failed to enqueue ad-hoc reservation sweep job");
      throw err;
    }
  }

  /**
   * Process a sweep job from BullMQ with a multi-batch draining loop.
   */
  async processJob(job: Job<ExpireReservationsJobData>): Promise<ReservationSweeperResult> {
    const parseResult = ExpireReservationsJobDataSchema.safeParse(job.data);
    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      const validationMsg = issues
        .map((e) => `${e.path.join(".") || "payload"}: ${e.message}`)
        .join(", ");
      logger.error({ jobId: job.id, errors: issues }, "Invalid reservation sweeper job payload");
      throw new Error(`Invalid job data: ${validationMsg}`);
    }

    const { businessId, referenceTime } = parseResult.data;
    const refDate = referenceTime ? new Date(referenceTime) : new Date();

    if (isNaN(refDate.getTime())) {
      logger.error(
        { jobId: job.id, referenceTime },
        "Invalid referenceTime timestamp in sweep job",
      );
      throw new Error("Invalid referenceTime timestamp");
    }

    // F17: Reject referenceTime that is suspiciously far from now.
    // A future timestamp would expire reservations that haven't even expired yet.
    // A very old timestamp (> 24h ago) is likely a misconfiguration or replay attack.
    const nowMs = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const SIXTY_SECONDS_MS = 60 * 1000;
    if (
      referenceTime &&
      (refDate.getTime() > nowMs + SIXTY_SECONDS_MS || refDate.getTime() < nowMs - ONE_DAY_MS)
    ) {
      logger.error(
        { jobId: job.id, referenceTime, nowMs },
        "referenceTime is outside acceptable operational window (±24h). Rejecting sweep job.",
      );
      throw new Error(
        `referenceTime '${referenceTime}' is outside the acceptable operational window. Must be within the last 24 hours and no more than 60 seconds in the future.`,
      );
    }

    if (this.isSweeping) {
      logger.warn(
        { jobId: job.id, businessId },
        "Reservation sweep execution already active on this process; awaiting next tick",
      );
      return {
        success: true,
        sweptCount: 0,
        cancelledOrderCount: 0,
        expiredReservationIds: [],
        cancelledOrderIds: [],
        pagesProcessed: 0,
        hasMore: false,
      };
    }

    this.isSweeping = true;
    try {
      let totalSweptCount = 0;
      let totalCancelledOrderCount = 0;
      const allExpiredReservationIds: string[] = [];
      const allCancelledOrderIds: string[] = [];
      let pagesProcessed = 0;
      let hasMore = false;

      // Multi-batch draining loop: drain pages until batch is empty or max pages reached.
      for (let page = 0; page < MAX_SWEEP_PAGES; page++) {
        pagesProcessed++;
        const result: SweepResult = await this.sweeperService.sweepExpiredReservations(
          businessId,
          refDate,
          DEFAULT_SWEEP_BATCH_SIZE,
        );

        totalSweptCount += result.sweptCount;
        totalCancelledOrderCount += result.cancelledOrderCount;
        allExpiredReservationIds.push(...result.expiredReservationIds);
        allCancelledOrderIds.push(...result.cancelledOrderIds);

        // F9: Break on actual swept count — candidate array length can include rows that
        // lost a concurrent race and were never actually transitioned (e.g. already committed).
        // If sweptCount < batchSize, we have drained all available expired reservations.
        if (result.sweptCount < DEFAULT_SWEEP_BATCH_SIZE) {
          break;
        }

        // If this was the last allowed page and the batch was full, signal that more may remain.
        if (page === MAX_SWEEP_PAGES - 1 && result.sweptCount >= DEFAULT_SWEEP_BATCH_SIZE) {
          hasMore = true;
          logger.warn(
            { jobId: job.id, businessId, pagesProcessed, totalSweptCount },
            `Sweep reached MAX_SWEEP_PAGES (${MAX_SWEEP_PAGES}). Expired reservations may remain; hasMore=true.`,
          );
        }
      }

      return {
        success: true,
        sweptCount: totalSweptCount,
        cancelledOrderCount: totalCancelledOrderCount,
        expiredReservationIds: allExpiredReservationIds,
        cancelledOrderIds: allCancelledOrderIds,
        pagesProcessed,
        hasMore,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: job.id, err: errorMsg }, "Error processing reservation sweep job");
      // Rethrow so BullMQ marks the job as failed and emits 'failed' event
      throw err;
    } finally {
      this.isSweeping = false;
    }
  }
}
