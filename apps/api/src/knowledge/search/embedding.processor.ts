import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Inject,
  forwardRef,
  Optional,
} from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";

import { logger } from "../../lib/logger";
import { connection } from "../../lib/queue";
import {
  type EmbeddingService,
  EmbeddingService as EmbeddingServiceRef,
  type DocumentIndexingResult,
} from "./embedding.service";

export const GENERATE_EMBEDDINGS_QUEUE = "generate-embeddings";
export const INDEX_KNOWLEDGE_DOCUMENT_JOB = "index_knowledge_document";

export interface GenerateEmbeddingsJobData {
  businessId: string;
  documentId?: string;
  enqueuedAt?: number;
}

@Injectable()
export class EmbeddingProcessor implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<GenerateEmbeddingsJobData> | null = null;
  private worker: Worker<GenerateEmbeddingsJobData> | null = null;

  constructor(
    @Inject(forwardRef(() => EmbeddingServiceRef))
    private readonly embeddingService: EmbeddingService,
    @Optional() queue?: Queue<GenerateEmbeddingsJobData>,
  ) {
    this.queue = queue ?? null;
  }

  onModuleInit() {
    try {
      this.queue ??= new Queue<GenerateEmbeddingsJobData>(GENERATE_EMBEDDINGS_QUEUE, {
        connection,
      });

      this.worker = new Worker<GenerateEmbeddingsJobData>(
        GENERATE_EMBEDDINGS_QUEUE,
        async (job: Job<GenerateEmbeddingsJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job) => {
        logger.info(
          { jobId: job.id, businessId: job.data.businessId, documentId: job.data.documentId },
          "Knowledge document embedding job completed",
        );
      });

      this.worker.on("failed", (job, err) => {
        logger.error(
          {
            jobId: job?.id,
            businessId: job?.data.businessId,
            documentId: job?.data.documentId,
            err,
          },
          "Knowledge document embedding job failed",
        );
      });
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ worker for generate-embeddings queue");
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
      logger.warn({ err }, "Error closing generate-embeddings queue/worker");
    }
  }

  /**
   * Enqueue a knowledge document for embedding generation
   */
  async enqueueDocumentIndexing(businessId: string, documentId: string) {
    if (this.queue) {
      try {
        const jobId = `index-doc_${businessId}_${documentId}_${Date.now()}`;
        return await this.queue.add(
          INDEX_KNOWLEDGE_DOCUMENT_JOB,
          {
            businessId,
            documentId,
            enqueuedAt: Date.now(),
          },
          {
            jobId,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (err) {
        logger.warn({ err, businessId, documentId }, "Failed to enqueue document indexing job");
      }
    }
    return null;
  }

  /**
   * Process a generate-embeddings job
   */
  async processJob(
    job: Job<GenerateEmbeddingsJobData>,
  ): Promise<{ success: boolean; result?: DocumentIndexingResult }> {
    const { businessId, documentId } = job.data;

    if (!businessId) {
      throw new Error("Missing businessId in generate-embeddings job payload");
    }

    if (documentId) {
      const result = await this.embeddingService.indexDocument(businessId, documentId);
      return { success: true, result };
    }

    logger.warn(
      { jobId: job.id, data: job.data },
      "No recognizable target in generate-embeddings job",
    );
    return { success: false };
  }
}
