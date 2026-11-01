import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";

import { logger } from "../../lib/logger";
import { connection } from "../../lib/queue";
import { CsvImportService } from "./csv-import.service";

export interface CatalogImportJobData {
  type: "validate" | "confirm";
  importRunId: string;
  businessId: string;
  userId: string;
  s3Key?: string;
  csvContent?: string;
  mode?: "merge" | "replace";
}

export const CATALOG_IMPORT_QUEUE_NAME = "catalog-import";

@Injectable()
export class CsvImportProcessor implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<CatalogImportJobData> | null = null;
  private worker: Worker<CatalogImportJobData> | null = null;

  constructor(private readonly csvImportService: CsvImportService) {}

  onModuleInit() {
    try {
      this.queue = new Queue<CatalogImportJobData>(CATALOG_IMPORT_QUEUE_NAME, {
        connection,
      });

      this.worker = new Worker<CatalogImportJobData>(
        CATALOG_IMPORT_QUEUE_NAME,
        async (job: Job<CatalogImportJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 2,
        },
      );

      this.worker.on("completed", (job) => {
        logger.info({ jobId: job.id, type: job.data.type }, "Catalog import job completed");
      });

      this.worker.on("failed", (job, err) => {
        logger.error({ jobId: job?.id, type: job?.data.type, err }, "Catalog import job failed");
      });
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ queue/worker for catalog-import");
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
      logger.warn({ err }, "Error closing catalog-import queue/worker");
    }
  }

  /**
   * Process an import job (either validate or confirm)
   */
  async processJob(job: Job<CatalogImportJobData>) {
    const { type, importRunId, businessId, csvContent, mode } = job.data;
    logger.info(
      { jobId: job.id, type, importRunId, businessId, mode },
      "Processing catalog import job",
    );

    if (type === "validate") {
      return this.csvImportService.processValidateRun(businessId, importRunId, csvContent);
    }
    return this.csvImportService.processConfirmRun(businessId, importRunId, csvContent, mode);
  }

  /**
   * Enqueue validate import job with resilient in-process fallback
   */
  async enqueueValidate(data: Omit<CatalogImportJobData, "type">) {
    if (this.queue) {
      try {
        const timeout = new Promise<null>((res) => setTimeout(() => res(null), 1000));
        const jobPromise = this.queue.add("validate-csv", { ...data, type: "validate" });
        const result = await Promise.race([jobPromise, timeout]);
        if (result) {
          return result;
        }
      } catch (err) {
        logger.warn(
          { err },
          "Could not enqueue validate job to BullMQ; falling back to in-process execution",
        );
      }
    }

    // In-process asynchronous fallback
    void this.processJob({
      data: { ...data, type: "validate" },
    } as Job<CatalogImportJobData>).catch((err) => {
      logger.error({ err, importRunId: data.importRunId }, "In-process validation fallback failed");
    });
    return null;
  }

  /**
   * Enqueue confirm import job with resilient in-process fallback
   */
  async enqueueConfirm(data: Omit<CatalogImportJobData, "type">) {
    if (this.queue) {
      try {
        const timeout = new Promise<null>((res) => setTimeout(() => res(null), 1000));
        const jobPromise = this.queue.add("confirm-import", { ...data, type: "confirm" });
        const result = await Promise.race([jobPromise, timeout]);
        if (result) {
          return result;
        }
      } catch (err) {
        logger.warn(
          { err },
          "Could not enqueue confirm job to BullMQ; falling back to in-process execution",
        );
      }
    }

    // In-process asynchronous fallback
    void this.processJob({
      data: { ...data, type: "confirm" },
    } as Job<CatalogImportJobData>).catch((err) => {
      logger.error({ err, importRunId: data.importRunId }, "In-process confirm fallback failed");
    });
    return null;
  }
}
