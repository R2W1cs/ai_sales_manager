import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Inject,
  Optional,
} from "@nestjs/common";
import type { LifecycleStage } from "@prisma/client";
import { Queue, Worker, type Job } from "bullmq";

import type { CustomerLifecycleClassification } from "@app/shared";

import { logger } from "../../lib/logger";
import { connection } from "../../lib/queue";
import { LifecycleService, type RecomputeLifecycleResult } from "./lifecycle.service";

export const CUSTOMER_LIFECYCLE_QUEUE = "customer.lifecycle";
export const RECOMPUTE_LIFECYCLE_JOB = "recompute_lifecycle";
export const ORDER_CONFIRMED_JOB = "order_confirmed";

export type LifecycleTrigger = "order_confirmed" | "customer_merge" | "manual" | "scheduled_sweep";

export interface LifecycleJobData {
  businessId: string;
  customerId: string;
  orderId?: string;
  trigger: LifecycleTrigger;
  enqueuedAt?: number;
}

export interface LifecycleJobResult {
  success: boolean;
  customerId: string;
  businessId: string;
  classification?: CustomerLifecycleClassification;
  lifecycleStage?: LifecycleStage;
  confirmedOrderCount?: number;
  isChurnRisk?: boolean;
  error?: string;
}

@Injectable()
export class LifecycleProcessor implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<LifecycleJobData> | null = null;
  private worker: Worker<LifecycleJobData> | null = null;

  constructor(
    @Inject(LifecycleService)
    private readonly lifecycleService: LifecycleService,
    @Optional() queue?: Queue<LifecycleJobData>,
  ) {
    this.queue = queue ?? null;
  }

  onModuleInit() {
    try {
      this.queue ??= new Queue<LifecycleJobData>(CUSTOMER_LIFECYCLE_QUEUE, {
        connection,
      });

      this.worker = new Worker<LifecycleJobData>(
        CUSTOMER_LIFECYCLE_QUEUE,
        async (job: Job<LifecycleJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job, result) => {
        logger.info(
          {
            jobId: job.id,
            jobName: job.name,
            businessId: job.data.businessId,
            customerId: job.data.customerId,
            result,
          },
          "Customer lifecycle job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        logger.error(
          {
            jobId: job?.id,
            jobName: job?.name,
            businessId: job?.data.businessId,
            customerId: job?.data.customerId,
            err,
          },
          "Customer lifecycle job failed",
        );
      });
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ worker for customer lifecycle queue");
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
      logger.warn({ err }, "Error closing customer lifecycle queue / worker");
    }
  }

  /**
   * Enqueues lifecycle recalculation upon order confirmation.
   * Uses exponential backoff (attempts: 3, delay: 5000ms) per NFR-REL-03.
   */
  async enqueueOrderConfirmed(
    businessId: string,
    customerId: string,
    orderId?: string,
  ): Promise<string | undefined> {
    if (!this.queue) {
      throw new Error("LifecycleProcessor: queue not initialised — cannot enqueue order_confirmed");
    }

    const job = await this.queue.add(
      ORDER_CONFIRMED_JOB,
      {
        businessId,
        customerId,
        orderId,
        trigger: "order_confirmed",
        enqueuedAt: Date.now(),
      },
      {
        jobId: orderId
          ? `lifecycle:order:${orderId}`
          : `lifecycle:order:${businessId}:${customerId}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return job.id;
  }

  /**
   * Enqueues general customer lifecycle recomputation.
   * Uses deterministic jobId for deduplicating redundant pending jobs for the same customer.
   */
  async enqueueRecompute(
    businessId: string,
    customerId: string,
    trigger: LifecycleTrigger = "manual",
  ): Promise<string | undefined> {
    if (!this.queue) {
      throw new Error("LifecycleProcessor: queue not initialised — cannot enqueue recompute");
    }

    const job = await this.queue.add(
      RECOMPUTE_LIFECYCLE_JOB,
      {
        businessId,
        customerId,
        trigger,
        enqueuedAt: Date.now(),
      },
      {
        jobId: `lifecycle:recompute:${businessId}:${customerId}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return job.id;
  }

  /**
   * Processes a lifecycle BullMQ job.
   */
  async processJob(job: Job<LifecycleJobData>): Promise<LifecycleJobResult> {
    const { businessId, customerId } = job.data;

    try {
      const result: RecomputeLifecycleResult = await this.lifecycleService.recomputeStage(
        businessId,
        customerId,
      );

      return {
        success: true,
        customerId: result.customerId,
        businessId: result.businessId,
        classification: result.classification,
        lifecycleStage: result.dbStage,
        confirmedOrderCount: result.confirmedOrderCount,
        isChurnRisk: result.isChurnRisk,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { businessId, customerId, err },
        `Failed to process customer lifecycle job: ${errorMessage}`,
      );
      throw err;
    }
  }
}
