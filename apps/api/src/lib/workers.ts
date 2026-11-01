import { Worker, type Job } from "bullmq";

import { logger } from "./logger";
import { connection, type EmailJobData, type NotificationJobData } from "./queue";

/**
 * Email worker - processes email sending jobs
 * @see https://docs.bullmq.io/guide/workers
 */
export const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job: Job<EmailJobData>) => {
    const { to } = job.data;

    logger.info({ jobId: job.id, to }, "Processing email job");

    // TODO: Implement your email sending logic here
    // Example with a hypothetical email service:
    // await emailService.send({ to, subject, body, templateId });

    // Simulate email sending
    await new Promise((resolve) => setTimeout(resolve, 1000));

    logger.info({ jobId: job.id, to }, "Email job completed");

    return { sent: true, to, timestamp: new Date().toISOString() };
  },
  {
    connection,
    concurrency: 5, // Process up to 5 jobs in parallel
    limiter: {
      max: 100, // Max 100 jobs
      duration: 60000, // Per minute (rate limiting)
    },
  },
);

/**
 * Notification worker - processes notification jobs
 */
export const notificationWorker = new Worker<NotificationJobData>(
  "notification",
  async (job: Job<NotificationJobData>) => {
    const { userId, type } = job.data;

    logger.info({ jobId: job.id, type, userId }, "Processing notification job");

    // TODO: Implement your notification logic here
    // Example:
    // switch (type) {
    //   case "push":
    //     await pushService.send(userId, { title, message, data });
    //     break;
    //   case "in-app":
    //     await inAppNotificationService.create(userId, { title, message, data });
    //     break;
    //   case "sms":
    //     await smsService.send(userId, message);
    //     break;
    // }

    // Simulate notification processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    logger.info({ jobId: job.id }, "Notification job completed");

    return { sent: true, type, userId, timestamp: new Date().toISOString() };
  },
  {
    connection,
    concurrency: 10,
  },
);

// Event handlers for monitoring
emailWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Email job has completed");
});

emailWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Email job has failed");
});

notificationWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Notification job has completed");
});

notificationWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Notification job has failed");
});

/**
 * Gracefully close all workers
 * Call this during application shutdown
 */
export async function closeWorkers() {
  await emailWorker.close();
  await notificationWorker.close();
}

/**
 * Start all workers
 * Workers start automatically when created, but this function can be used
 * to ensure they're running or to restart after being paused
 */
export function startWorkers() {
  // Workers are already running by default
  // This function is here for explicit control if needed
  logger.info("BullMQ workers started");
  logger.info("Email worker: processing 'email' queue");
  logger.info("Notification worker: processing 'notification' queue");
}
