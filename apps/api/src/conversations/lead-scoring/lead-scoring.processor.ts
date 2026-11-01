import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Inject,
  Optional,
} from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";

import { logger } from "../../lib/logger";
import { connection } from "../../lib/queue";
import { LeadScoringService, type ScoreConversationOptions } from "./lead-scoring.service";

/**
 * 14 §7 Background jobs table & OQ-41:
 * Queue: `ai`
 * Job: `score_lead`
 * Owner module: Conversations
 */
export const SCORE_LEAD_QUEUE = "ai";
export const SCORE_LEAD_JOB = "score_lead";
export const NIGHTLY_DECAY_JOB = "nightly_decay";

export interface ScoreLeadJobData {
  type?: "score" | "decay";
  businessId?: string;
  conversationId?: string;
  trigger?: string;
  options?: ScoreConversationOptions;
  enqueuedAt?: number;
}

export interface ScoreLeadProcessingResult {
  success: boolean;
  score?: number;
  temperature?: string;
  processed?: number;
  decayed?: number;
  skipped?: boolean;
  error?: string;
}

@Injectable()
export class LeadScoringProcessor implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<ScoreLeadJobData> | null = null;
  private worker: Worker<ScoreLeadJobData> | null = null;

  constructor(
    @Inject(LeadScoringService)
    private readonly leadScoringService: LeadScoringService,
    @Optional() queue?: Queue<ScoreLeadJobData>,
  ) {
    this.queue = queue ?? null;
  }

  onModuleInit() {
    try {
      this.queue ??= new Queue<ScoreLeadJobData>(SCORE_LEAD_QUEUE, {
        connection,
      });

      this.worker = new Worker<ScoreLeadJobData>(
        SCORE_LEAD_QUEUE,
        async (job: Job<ScoreLeadJobData>) => {
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
            conversationId: job.data.conversationId,
            result,
          },
          "Lead scoring job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        logger.error(
          {
            jobId: job?.id,
            jobName: job?.name,
            conversationId: job?.data.conversationId,
            err,
          },
          "Lead scoring job failed",
        );
      });
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ worker for lead scoring");
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
      logger.warn({ err }, "Error closing lead scoring queue/worker");
    }
  }

  /**
   * Enqueue a deterministic lead scoring job for a conversation.
   * Job ID format per 14 §7: `{conversationId}:score:{trigger}:{yyyy-mm-ddTHH}` (hourly bucket).
   * BullMQ backoff per 14 §7: attempts: 3, exponential delay 5000 (5s, 10s).
   */
  async enqueueScoreLead(
    businessId: string,
    conversationId: string,
    trigger = "event",
    options?: ScoreConversationOptions,
  ) {
    if (!this.queue) {
      return null;
    }

    const hourBucket = new Date().toISOString().slice(0, 13);
    const jobId = `${conversationId}:score:${trigger}:${hourBucket}`;

    try {
      return await this.queue.add(
        SCORE_LEAD_JOB,
        {
          type: "score",
          businessId,
          conversationId,
          trigger,
          options,
          enqueuedAt: Date.now(),
        },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (err) {
      logger.warn(
        { err, businessId, conversationId, trigger },
        "Failed to enqueue lead scoring job",
      );
      return null;
    }
  }

  /**
   * Enqueue a nightly decay sweep job.
   * Job ID format per 14 §7: `score_decay:nightly:{date}:{businessId}`.
   */
  async enqueueNightlyDecay(businessId?: string) {
    if (!this.queue) {
      return null;
    }

    const dateBucket = new Date().toISOString().slice(0, 10);
    const jobId = `score_decay:nightly:${dateBucket}${businessId ? `:${businessId}` : ""}`;

    try {
      return await this.queue.add(
        NIGHTLY_DECAY_JOB,
        {
          type: "decay",
          businessId,
          enqueuedAt: Date.now(),
        },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (err) {
      logger.warn({ err, businessId }, "Failed to enqueue nightly decay sweep job");
      return null;
    }
  }

  /**
   * Process a lead scoring job from BullMQ queue.
   */
  async processJob(job: Job<ScoreLeadJobData>): Promise<ScoreLeadProcessingResult> {
    const { type, businessId, conversationId, options } = job.data;

    // Handle nightly decay pass
    if (job.name === NIGHTLY_DECAY_JOB || type === "decay") {
      const decaySummary = await this.leadScoringService.runNightlyDecay(businessId);
      return {
        success: true,
        processed: decaySummary.processed,
        decayed: decaySummary.decayed,
      };
    }

    // Handle single conversation lead score computation
    if (job.name === SCORE_LEAD_JOB || conversationId) {
      if (!conversationId || !businessId) {
        logger.warn(
          { jobId: job.id, data: job.data },
          "Missing businessId or conversationId in lead scoring job payload",
        );
        return { success: false, skipped: true, error: "missing_required_payload" };
      }

      const scoreResult = await this.leadScoringService.scoreConversation(
        businessId,
        conversationId,
        options,
      );

      return {
        success: true,
        score: scoreResult.score,
        temperature: scoreResult.temperature,
      };
    }

    logger.warn({ jobId: job.id, jobName: job.name }, "Unrecognized lead scoring job name/payload");
    return { success: false, skipped: true, error: "unrecognized_job" };
  }
}
