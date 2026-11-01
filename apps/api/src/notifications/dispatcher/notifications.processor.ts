import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { PrismaClient, NotificationType, HandoffPriority, Notification } from "@prisma/client";
import { Queue, Worker, type Job } from "bullmq";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import { RealtimeService } from "../../realtime";

export const NOTIFICATIONS_QUEUE = "notifications";
export const NOTIFICATIONS_JOB = "send_notification";

export interface NotificationJobData {
  businessId: string;
  type: NotificationType;
  handoffPriority?: HandoffPriority | null;
  title: string;
  message: string;
  entityType?: string;
  entityId: string;
  dedupeKey: string;
  targetUserIds?: string[];
  metadata?: Record<string, unknown>;
  enqueuedAt?: number;
}

export interface NotificationProcessingResult {
  success: boolean;
  createdCount: number;
  recipientCount: number;
  dedupeKey: string;
  notificationIds: string[];
  skippedDuplicates: number;
  error?: string;
}

@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private queue: Queue<NotificationJobData> | null = null;
  private worker: Worker<NotificationJobData> | null = null;
  private readonly prisma: PrismaClient;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<NotificationJobData>,
    @Optional() private readonly realtimeService?: RealtimeService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.queue = queue ?? null;
  }

  onModuleInit() {
    try {
      this.queue ??= new Queue<NotificationJobData>(NOTIFICATIONS_QUEUE, {
        connection,
      });

      this.worker = new Worker<NotificationJobData>(
        NOTIFICATIONS_QUEUE,
        async (job: Job<NotificationJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 10,
        },
      );

      this.worker.on("completed", (job, result: NotificationProcessingResult | undefined) => {
        this.logger.log(
          {
            jobId: job.id,
            jobName: job.name,
            dedupeKey: job.data.dedupeKey,
            createdCount: result?.createdCount,
          },
          "Notification dispatch job completed",
        );
      });

      this.worker.on("failed", (job, err) => {
        this.logger.error(
          {
            jobId: job?.id,
            jobName: job?.name,
            dedupeKey: job?.data.dedupeKey,
            err,
          },
          "Notification dispatch job failed",
        );
      });

      this.worker.on("error", (err) => {
        this.logger.warn({ err }, "BullMQ worker connection error in NotificationsProcessor");
      });
    } catch (err) {
      this.logger.warn({ err }, "Could not initialize BullMQ queue/worker for notifications");
    }
  }

  /**
   * Enqueue a notification dispatch job with exponential backoff.
   */
  public async enqueueNotification(data: NotificationJobData): Promise<string> {
    this.queue ??= new Queue<NotificationJobData>(NOTIFICATIONS_QUEUE, {
      connection,
    });

    const job = await this.queue.add(NOTIFICATIONS_JOB, data, {
      jobId: `notif:${data.dedupeKey}`,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
    });

    return job.id ?? data.dedupeKey;
  }

  /**
   * Process a notification dispatch job:
   * 1. Query active tenant members (or target users).
   * 2. Fan-out notification rows into DB (with multi-tenant isolation).
   * 3. Handle (user_id, dedupe_key) unique constraint gracefully.
   * 4. Emit realtime `notification.new` event to user and tenant rooms (decoupled from DB writes).
   */
  public async processJob(job: Job<NotificationJobData>): Promise<NotificationProcessingResult> {
    const data = job.data;
    const { businessId, dedupeKey } = data;

    if (!businessId) {
      throw new Error(
        "Cannot process notification: missing businessId (tenant isolation invariant)",
      );
    }

    const rawRecipientIds: string[] =
      data.targetUserIds && data.targetUserIds.length > 0
        ? data.targetUserIds
        : (
            await this.prisma.businessMember.findMany({
              where: {
                business_id: businessId,
                removed_at: null,
              },
              select: {
                user_id: true,
              },
            })
          ).map((m) => m.user_id);

    const recipientUserIds = Array.from(new Set(rawRecipientIds));

    if (recipientUserIds.length === 0) {
      this.logger.warn({ businessId, dedupeKey }, "No active recipients found for notification");
      return {
        success: true,
        createdCount: 0,
        recipientCount: 0,
        dedupeKey,
        notificationIds: [],
        skippedDuplicates: 0,
      };
    }

    const creationResults = await Promise.all(
      recipientUserIds.map(async (userId) => {
        try {
          const notification = await this.prisma.notification.create({
            data: {
              business_id: businessId,
              user_id: userId,
              type: data.type,
              handoff_priority: data.handoffPriority ?? null,
              title: data.title,
              message: data.message,
              entity_type: data.entityType ?? "conversation",
              entity_id: data.entityId,
              dedupe_key: dedupeKey,
            },
          });
          return { notification, isDuplicate: false };
        } catch (err: unknown) {
          // Prisma unique constraint violation code is P2002
          const isUniqueConstraint =
            (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") ||
            (err instanceof Error && err.message.includes("Unique constraint"));

          if (isUniqueConstraint) {
            this.logger.debug(
              { userId, dedupeKey },
              "Notification row already exists for user (dedupe_key match)",
            );
            return { notification: null, isDuplicate: true };
          }

          this.logger.error({ err, userId, dedupeKey }, "Failed to insert notification row");
          throw err;
        }
      }),
    );

    const createdNotifications: Notification[] = [];
    let skippedDuplicates = 0;

    for (const res of creationResults) {
      if (res.isDuplicate) {
        skippedDuplicates++;
      } else if (res.notification) {
        createdNotifications.push(res.notification);
      }
    }

    // Decoupled realtime fan-out (T-NOTIF-01 §5 step 3)
    if (this.realtimeService && createdNotifications.length > 0) {
      for (const notification of createdNotifications) {
        try {
          this.realtimeService.emitNotificationNew(businessId, notification.user_id, notification);
        } catch (rtErr) {
          this.logger.warn(
            { rtErr, userId: notification.user_id, notificationId: notification.id },
            "Failed to emit realtime notification",
          );
        }
      }
    }

    return {
      success: true,
      createdCount: createdNotifications.length,
      recipientCount: recipientUserIds.length,
      dedupeKey,
      notificationIds: createdNotifications.map((n) => n.id),
      skippedDuplicates,
    };
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.close();
      } catch (err) {
        this.logger.warn({ err }, "Error closing notification worker");
      } finally {
        this.worker = null;
      }
    }
    if (this.queue) {
      try {
        await this.queue.close();
      } catch (err) {
        this.logger.warn({ err }, "Error closing notification queue");
      } finally {
        this.queue = null;
      }
    }
  }
}
