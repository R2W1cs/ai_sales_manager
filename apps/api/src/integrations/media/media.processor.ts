import { Injectable, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Queue, Worker, type Job, UnrecoverableError } from "bullmq";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import { MetaOAuthService } from "../meta/meta-oauth.service";
import {
  FETCH_INBOUND_MEDIA_JOB,
  FETCH_INBOUND_MEDIA_QUEUE,
  type FetchInboundMediaJobData,
  MediaService,
} from "./media.service";

export interface MediaProcessingResult {
  success: boolean;
  messageId: string;
  attachmentId?: string;
  s3Key?: string;
  skipped?: boolean;
  error?: string;
}

@Injectable()
export class MediaProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;
  private queue: Queue<FetchInboundMediaJobData> | null = null;
  private worker: Worker<FetchInboundMediaJobData> | null = null;

  constructor(
    private readonly mediaService: MediaService,
    private readonly metaOAuthService: MetaOAuthService,
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<FetchInboundMediaJobData>,
  ) {
    this.prisma = prismaClient ?? prisma;
    this.queue = queue ?? null;
  }

  onModuleInit() {
    try {
      this.queue ??= new Queue<FetchInboundMediaJobData>(FETCH_INBOUND_MEDIA_QUEUE, {
        connection,
      });

      this.worker = new Worker<FetchInboundMediaJobData>(
        FETCH_INBOUND_MEDIA_QUEUE,
        async (job: Job<FetchInboundMediaJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job, result) => {
        logger.info(
          { jobId: job.id, messageId: job.data.messageId, result },
          "Media processing job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        logger.error(
          {
            jobId: job?.id,
            messageId: job?.data.messageId,
            attemptsMade: job?.attemptsMade,
            err,
          },
          "Media processing job failed",
        );
      });
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ worker for media processing queue");
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
      logger.warn({ err }, "Error closing media processing queue/worker");
    }
  }

  /**
   * Core worker processor for downloading media from Meta CDN and uploading to S3.
   * 11 §7.2 / 14 §7: Guards against non-media jobs on shared 'integrations' queue.
   */
  async processJob(job: Job<FetchInboundMediaJobData>): Promise<MediaProcessingResult> {
    // 11 §7.2 / 14 §7: Guard against non-media jobs on shared integrations queue
    if (job.name !== FETCH_INBOUND_MEDIA_JOB) {
      logger.info(
        { jobId: job.id, jobName: job.name },
        "Skipping non-media job on shared integrations queue in MediaProcessor",
      );
      return {
        success: true,
        messageId: job.data.messageId,
        skipped: true,
      };
    }

    const { messageId, businessId, providerUrl, sortOrder, contentType } = job.data;

    if (!messageId || !businessId || !providerUrl) {
      logger.error({ jobId: job.id }, "Missing required fields in media processing job payload");
      throw new UnrecoverableError("Missing messageId, businessId, or providerUrl in job data");
    }

    // 1. Fetch channel account if credentials are needed for Meta Graph / CDN download
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        business_id: businessId,
      },
      include: {
        channel_account: true,
      },
    });

    if (!message) {
      logger.warn(
        { messageId, businessId },
        "Message not found in database during media processing",
      );
      throw new UnrecoverableError(`Message not found: ${messageId} for business ${businessId}`);
    }

    // 2. Resolve access token if channel account credentials exist (fail unrecoverable if corrupted)
    let accessToken: string | undefined;
    const channelAccount =
      message.channel_account ??
      (job.data.channelAccountId
        ? await this.prisma.channelAccount.findFirst({
            where: {
              id: job.data.channelAccountId,
              business_id: businessId,
            },
          })
        : null);

    if (channelAccount?.credentials_ref) {
      try {
        accessToken = this.metaOAuthService.decryptToken(channelAccount.credentials_ref);
      } catch (decErr) {
        logger.error(
          { decErr, channelAccountId: channelAccount.id, messageId },
          "Failed to decrypt channel account token for media download",
        );
        throw new UnrecoverableError(
          `Corrupted or invalid encrypted credentials for channel account: ${channelAccount.id}`,
        );
      }
    }

    // 3. Process media download and storage via MediaService
    try {
      const attachment = await this.mediaService.processInboundMedia({
        businessId,
        messageId,
        providerUrl,
        accessToken,
        sortOrder: sortOrder ?? 0,
        contentType,
      });

      return {
        success: true,
        messageId,
        attachmentId: attachment.id,
        s3Key: attachment.s3_key,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isHttpException = typeof err === "object" && err !== null && "status" in err;
      const status = isHttpException ? (err as { status: number }).status : 500;

      // 4xx client errors, SSRF violations, or size limit exceedances are non-retryable
      if (
        status === 400 ||
        status === 403 ||
        status === 413 ||
        errorMessage.includes("SSRF") ||
        errorMessage.includes("ssrf_violation") ||
        errorMessage.includes("too large") ||
        errorMessage.includes("disallowed")
      ) {
        logger.error(
          { err, messageId, businessId, providerUrl },
          "Non-retryable media processing error",
        );
        throw new UnrecoverableError(errorMessage);
      }

      logger.warn(
        { err, messageId, businessId, attemptsMade: job.attemptsMade },
        "Retryable error during media processing",
      );
      throw err;
    }
  }
}
