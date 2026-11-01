import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";

export const DELIVER_OUTBOUND_QUEUE = "deliver_outbound";
export const DELIVER_OUTBOUND_JOB = "deliver_outbound";

export interface DeliverOutboundJobData {
  messageId: string;
  businessId: string;
  channelAccountId?: string | null;
  channel_account_id?: string | null;
  enqueuedAt: number;
}

export interface QueueMessageResult {
  queued: boolean;
  messageId: string;
  jobId: string;
  status: string;
}

@Injectable()
export class OutboundService {
  private readonly prisma: PrismaClient;
  private queue: Queue<DeliverOutboundJobData> | null = null;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<DeliverOutboundJobData> | null,
  ) {
    this.prisma = prismaClient ?? prisma;
    if (queue !== undefined) {
      this.queue = queue;
    } else {
      try {
        this.queue = new Queue<DeliverOutboundJobData>(DELIVER_OUTBOUND_QUEUE, {
          connection,
        });
      } catch (err) {
        logger.warn({ err }, "Could not initialize BullMQ deliver_outbound queue");
      }
    }
  }

  /**
   * Enqueues an outbound message to the BullMQ deliver_outbound queue.
   * 14 §7 & 16 §6.1: Job ID is messageId to ensure queue-level deduplication.
   */
  async queueMessage(
    messageId: string,
    options?: { priority?: number; delay?: number },
  ): Promise<QueueMessageResult> {
    if (!messageId) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "messageId is required to queue outbound message",
        },
      });
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel_account: true,
        conversation: true,
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Message with ID ${messageId} not found`,
        },
      });
    }

    // 16 §6.1 / 14 §5: Idempotency checks before queueing
    if (message.delivery_status === "draft") {
      throw new BadRequestException({
        error: {
          code: "invalid_state",
          message: "Cannot dispatch message in 'draft' status without prior approval",
        },
      });
    }

    if (
      message.external_message_id != null ||
      message.delivery_status === "sent" ||
      message.delivery_status === "delivered"
    ) {
      logger.info(
        {
          messageId,
          status: message.delivery_status,
          externalMessageId: message.external_message_id,
        },
        "Message is already sent/delivered; skipping re-enqueue",
      );
      return {
        queued: false,
        messageId,
        jobId: messageId,
        status: message.delivery_status,
      };
    }

    if (!this.queue) {
      logger.error(
        { messageId },
        "Outbound queue is not initialized or connected; cannot enqueue message",
      );
      throw new ServiceUnavailableException({
        error: {
          code: "queue_unavailable",
          message: "Outbound delivery queue is not available",
        },
      });
    }

    // BullMQ removeOnFail: false keeps failed jobs in the DLQ. Remove any prior job with same jobId
    // so explicit retries or re-enqueuing does not fail due to duplicate jobId rejection.
    try {
      const existingJob = await this.queue.getJob(messageId);
      if (existingJob) {
        await existingJob.remove();
      }
    } catch (err) {
      logger.warn(
        { messageId, err },
        "Failed checking or removing previous BullMQ job before re-enqueue",
      );
    }

    // Ensure status is marked as 'queued' in database
    if (message.delivery_status !== "queued") {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { delivery_status: "queued" },
      });
    }

    const jobData: DeliverOutboundJobData = {
      messageId,
      businessId: message.business_id,
      channelAccountId: message.channel_account_id,
      channel_account_id: message.channel_account_id,
      enqueuedAt: Date.now(),
    };

    try {
      await this.queue.add(DELIVER_OUTBOUND_JOB, jobData, {
        jobId: messageId, // 14 §7: jobId is {messageId} for deduplication
        priority: options?.priority,
        delay: options?.delay,
        attempts: 3, // 14 §7 & T-INT-04: 3 attempts with exponential backoff
        backoff: {
          type: "exponential",
          delay: 5000, // 14 §7: 5s then 10s
        },
        removeOnComplete: true,
        removeOnFail: false, // Keep in queue failed state for Dead Letter Queue inspection
      });

      logger.info({ messageId, jobId: messageId }, "Outbound message enqueued to deliver_outbound");
    } catch (err) {
      logger.error({ messageId, err }, "Failed to push message to BullMQ queue");
      throw err;
    }

    return {
      queued: true,
      messageId,
      jobId: messageId,
      status: "queued",
    };
  }

  /**
   * Re-queues a failed message for redelivery.
   */
  async retryMessage(businessId: string, messageId: string): Promise<QueueMessageResult> {
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        business_id: businessId,
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Message with ID ${messageId} not found for business ${businessId}`,
        },
      });
    }

    // Set to queued before calling queueMessage
    await this.prisma.message.update({
      where: { id: messageId },
      data: { delivery_status: "queued" },
    });

    return this.queueMessage(messageId);
  }

  /**
   * Returns stats for the outbound queue.
   */
  async getQueueStats() {
    if (!this.queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
