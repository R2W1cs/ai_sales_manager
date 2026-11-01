import { Injectable, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Queue, Worker, type Job, UnrecoverableError } from "bullmq";

import type { CanonicalOutbound } from "@app/shared";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import { getDownloadUrl, getPublicUrl } from "../../lib/storage";
import { MetaApiClient } from "../meta/meta-api.client";
import { MetaOAuthService } from "../meta/meta-oauth.service";
import { DELIVER_OUTBOUND_QUEUE, type DeliverOutboundJobData } from "./outbound.service";

export interface OutboundProcessingResult {
  success: boolean;
  messageId: string;
  externalMessageId?: string;
  skipped?: boolean;
  retryable?: boolean;
  error?: string;
  reason?: string;
}

@Injectable()
export class OutboundProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;
  private queue: Queue<DeliverOutboundJobData> | null = null;
  private worker: Worker<DeliverOutboundJobData> | null = null;

  constructor(
    private readonly metaApiClient: MetaApiClient,
    private readonly metaOAuthService: MetaOAuthService,
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<DeliverOutboundJobData>,
  ) {
    this.prisma = prismaClient ?? prisma;
    this.queue = queue ?? null;
  }

  onModuleInit() {
    try {
      this.queue ??= new Queue<DeliverOutboundJobData>(DELIVER_OUTBOUND_QUEUE, {
        connection,
      });

      this.worker = new Worker<DeliverOutboundJobData>(
        DELIVER_OUTBOUND_QUEUE,
        async (job: Job<DeliverOutboundJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 10,
          limiter: {
            max: 20, // 16 §7 Conservative provider rate limit per second (Messenger 20/s, Instagram 10/s)
            duration: 1000,
            groupKey: "channelAccountId",
          } as { max: number; duration: number; groupKey?: string },
        },
      );

      this.worker.on("completed", (job, result) => {
        logger.info(
          { jobId: job.id, messageId: job.data.messageId, result },
          "Outbound delivery job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        void this.handleFailedJob(job, err);
      });
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ worker for deliver_outbound queue");
    }
  }

  /**
   * Handles job failure logging and final DLQ state persistence on retry exhaustion.
   */
  private async handleFailedJob(job: Job<DeliverOutboundJobData> | undefined, err: Error) {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts.attempts ?? 3;
    const isFinalFailure = attemptsMade >= maxAttempts;

    logger.error(
      {
        jobId: job?.id,
        messageId: job?.data.messageId,
        attemptsMade,
        maxAttempts,
        isFinalFailure,
        err,
      },
      "Outbound delivery job failed",
    );

    if (isFinalFailure && job?.data.messageId) {
      // Exhausted retries: ensure delivery_status is marked 'failed' in DB
      try {
        await this.prisma.message.update({
          where: { id: job.data.messageId },
          data: { delivery_status: "failed" },
        });
        logger.warn(
          { messageId: job.data.messageId },
          "Message retries exhausted; marked delivery_status as failed",
        );
      } catch (updateErr) {
        logger.error(
          { updateErr, messageId: job.data.messageId },
          "Failed to update message delivery_status to failed after retries exhausted",
        );
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
      logger.warn({ err }, "Error closing deliver_outbound queue/worker");
    }
  }

  /**
   * Core processing method for delivering an outbound message.
   */
  async processJob(job: Job<DeliverOutboundJobData>): Promise<OutboundProcessingResult> {
    const { messageId } = job.data;

    if (!messageId) {
      logger.error({ jobId: job.id }, "Missing messageId in job payload");
      return { success: false, messageId: "", reason: "missing_message_id" };
    }

    // 1. Fetch message with channel account, conversation, and attachments
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel_account: true,
        conversation: true,
        attachments: { orderBy: { sort_order: "asc" } },
      },
    });

    if (!message) {
      logger.warn({ messageId }, "Message not found in database during delivery");
      throw new UnrecoverableError(`Message not found in database: ${messageId}`);
    }

    // 2. 16 §6.1 Idempotency checks
    if (
      message.external_message_id != null ||
      message.delivery_status === "sent" ||
      message.delivery_status === "delivered"
    ) {
      logger.info(
        {
          messageId,
          externalMessageId: message.external_message_id,
          deliveryStatus: message.delivery_status,
        },
        "Message already sent/delivered; returning success without Graph call",
      );
      return {
        success: true,
        messageId,
        skipped: true,
        externalMessageId: message.external_message_id ?? undefined,
      };
    }

    if (message.delivery_status === "draft") {
      logger.info({ messageId }, "Message is in draft status; skipping Graph dispatch");
      return { success: true, messageId, skipped: true, reason: "draft_status" };
    }

    // 3. Channel Account Status Invariant
    const channelAccount = message.channel_account;
    if (channelAccount?.status !== "active") {
      logger.warn(
        { messageId, channelAccountId: message.channel_account_id, status: channelAccount?.status },
        "Channel account is missing or not active; marking message failed",
      );

      await this.prisma.message.update({
        where: { id: messageId },
        data: { delivery_status: "failed" },
      });

      throw new UnrecoverableError(
        `Channel account ${message.channel_account_id ?? "unknown"} is not active (status=${channelAccount?.status ?? "missing"})`,
      );
    }

    // 4. 🔒 Token Decryption in worker memory just prior to HTTP dispatch
    if (!channelAccount.credentials_ref) {
      logger.error(
        { messageId, channelAccountId: channelAccount.id },
        "Channel account is missing credentials_ref",
      );

      await this.prisma.message.update({
        where: { id: messageId },
        data: { delivery_status: "failed" },
      });

      await this.prisma.channelAccount.update({
        where: { id: channelAccount.id },
        data: { status: "error", last_error: "Missing credentials" },
      });

      throw new UnrecoverableError("Channel account is missing credentials_ref");
    }

    let decryptedToken: string;
    try {
      decryptedToken = this.metaOAuthService.decryptToken(channelAccount.credentials_ref);
    } catch (decErr) {
      logger.error(
        { messageId, channelAccountId: channelAccount.id, decErr },
        "Failed to decrypt channel account access token",
      );

      await this.prisma.message.update({
        where: { id: messageId },
        data: { delivery_status: "failed" },
      });

      await this.prisma.channelAccount.update({
        where: { id: channelAccount.id },
        data: { status: "error", last_error: "Corrupted or invalid encrypted credentials" },
      });

      throw new UnrecoverableError("Token decryption failed for channel account");
    }

    // 5. Construct CanonicalOutbound payload
    const conversation = message.conversation as { external_thread_id?: string | null } | null;
    const recipientPlatformUserId = conversation?.external_thread_id;
    if (!recipientPlatformUserId) {
      logger.error(
        { messageId, conversationId: message.conversation_id },
        "Message conversation is missing or missing external_thread_id recipient",
      );

      await this.prisma.message.update({
        where: { id: messageId },
        data: { delivery_status: "failed" },
      });

      throw new UnrecoverableError(
        "Message conversation is missing or missing external_thread_id recipient",
      );
    }

    const firstAttachment = message.attachments[0];
    const channel = channelAccount.channel;

    let imageUrl: string | undefined;
    if (firstAttachment?.s3_key) {
      try {
        // Spec 16 §6.1: short-lived signed GET URL for Meta to fetch media securely from private S3
        imageUrl = await getDownloadUrl(firstAttachment.s3_key, { expiresIn: 900 });
      } catch (s3Err) {
        logger.warn(
          { s3Err, s3Key: firstAttachment.s3_key },
          "Failed to generate presigned download URL for S3 key, falling back to public URL",
        );
        try {
          imageUrl = getPublicUrl(firstAttachment.s3_key);
        } catch {
          imageUrl = firstAttachment.s3_key;
        }
      }
    }

    const outboundDto: CanonicalOutbound = {
      channel,
      recipientPlatformUserId,
      text: message.content ?? undefined,
      imageS3Key: firstAttachment?.s3_key,
      imageUrl,
      pageId: channelAccount.page_id || channelAccount.phone_number_id || undefined,
    };

    // 6. Execute dispatch via MetaApiClient
    const sendResult = await this.metaApiClient.sendMessage(outboundDto, decryptedToken);

    // 7. Handle dispatch response
    if (sendResult.ok) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          delivery_status: "sent",
          ...(sendResult.externalMessageId
            ? { external_message_id: sendResult.externalMessageId }
            : {}),
        },
      });

      return {
        success: true,
        messageId,
        externalMessageId: sendResult.externalMessageId,
      };
    }

    // Handle failure
    const isFatal = !sendResult.retryable;
    const maxAttempts = job.opts.attempts ?? 3;
    const currentAttempt = job.attemptsMade;
    const isLastAttempt = currentAttempt >= maxAttempts - 1;

    if (isFatal || isLastAttempt) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { delivery_status: "failed" },
      });

      // 16 §5.4: Handle token revocation or authentication errors
      const isAuthError =
        sendResult.providerCode === "190" ||
        sendResult.providerCode === "401" ||
        sendResult.providerCode === "10" ||
        sendResult.providerCode === "200";

      if (isAuthError) {
        await this.prisma.channelAccount.update({
          where: { id: channelAccount.id },
          data: {
            status: "error",
            last_error: sendResult.message?.slice(0, 500) || "Authentication failed with Meta API",
          },
        });
      }

      if (isFatal) {
        throw new UnrecoverableError(
          `Fatal Meta outbound dispatch failed: ${sendResult.message || "Unknown error"}`,
        );
      }
    }

    // Transient error on a non-final attempt: throw to trigger BullMQ exponential retry
    throw new Error(
      `Meta outbound dispatch failed (attempt ${currentAttempt.toString()}/${maxAttempts.toString()}): ${sendResult.message || "Unknown error"}`,
    );
  }
}
