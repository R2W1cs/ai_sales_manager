import { Queue, type ConnectionOptions } from "bullmq";

import { env } from "@app/shared/server";

export function bullmqConnection(customUrl?: string): ConnectionOptions {
  const redisUrl = customUrl ?? (typeof env.REDIS_URL === "string" ? env.REDIS_URL : undefined);
  if (typeof redisUrl === "string" && redisUrl.length > 0) {
    const parsed = new URL(redisUrl);
    const database = parsed.pathname.replace("/", "");
    const isTls = parsed.protocol === "rediss:";
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : isTls ? 6380 : 6379,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: database ? Number(database) : undefined,
      tls: isTls ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }
  if (env.REDIS_HOST && env.REDIS_PORT) {
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    };
  }
  throw new Error("Missing Redis connection configuration");
}

export const connection: ConnectionOptions = bullmqConnection();

export const DELIVER_OUTBOUND_QUEUE = "deliver_outbound";
export const DELIVER_OUTBOUND_JOB = "deliver_outbound";

export interface DeliverOutboundJobData {
  messageId: string;
  businessId: string;
  channelAccountId?: string | null;
  channel_account_id?: string | null;
  enqueuedAt: number;
}

/**
 * Example queue for background job processing
 * @see https://docs.bullmq.io/
 */
export const emailQueue = new Queue("email", { connection });
export const notificationQueue = new Queue("notification", { connection });

// Define job data types
export interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
}

export interface NotificationJobData {
  userId: string;
  type: "push" | "in-app" | "sms";
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Add an email job to the queue
 */
export async function queueEmail(
  data: EmailJobData,
  options?: { delay?: number; priority?: number },
) {
  return emailQueue.add("send-email", data, {
    delay: options?.delay,
    priority: options?.priority,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  });
}

/**
 * Add a notification job to the queue
 */
export async function queueNotification(data: NotificationJobData, options?: { delay?: number }) {
  return notificationQueue.add("send-notification", data, {
    delay: options?.delay,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  });
}

/**
 * Schedule a recurring job (cron-style)
 * @example scheduleRecurringJob(emailQueue, "daily-report", { type: "report" }, "0 9 * * *")
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- caller payload inference
export async function scheduleRecurringJob<T extends object>(
  queue: Queue,
  name: string,
  data: T,
  pattern: string, // Cron pattern
): Promise<Awaited<ReturnType<Queue["upsertJobScheduler"]>>> {
  const payload: { name: string; data: T } = { name, data };
  return queue.upsertJobScheduler(name, { pattern }, payload);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queue: Queue) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Gracefully close all queues and connections
 * Call this during application shutdown
 */
export async function closeQueues() {
  await emailQueue.close();
  await notificationQueue.close();
}
