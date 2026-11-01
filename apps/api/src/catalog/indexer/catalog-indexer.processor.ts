import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Inject,
  forwardRef,
  Optional,
} from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";
import Redis, { type Redis as RedisClient } from "ioredis";

import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";
import { connection } from "../../lib/queue";
import {
  type CatalogIndexerService,
  CatalogIndexerService as CatalogIndexerServiceRef,
} from "./catalog-indexer.service";

export const SYNC_PRODUCT_EMBEDDING_QUEUE = "sync-product-embedding";
export const CATALOG_DEBOUNCE_KEY_PREFIX = "catalog:debounce:";
export const DEFAULT_DEBOUNCE_WINDOW_MS = 5000;

export interface SyncProductEmbeddingJobData {
  businessId: string;
  productId: string;
  enqueuedAt: number;
  mutationType?: string;
}

@Injectable()
export class CatalogIndexerProcessor implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<SyncProductEmbeddingJobData> | null = null;
  private worker: Worker<SyncProductEmbeddingJobData> | null = null;
  private redisClient: RedisClient | null = null;

  constructor(
    @Inject(forwardRef(() => CatalogIndexerServiceRef))
    private readonly catalogIndexerService: CatalogIndexerService,
    @Optional() redisClient?: RedisClient,
    @Optional() queue?: Queue<SyncProductEmbeddingJobData>,
  ) {
    this.redisClient = redisClient ?? null;
    this.queue = queue ?? null;
  }

  onModuleInit() {
    try {
      this.queue ??= new Queue<SyncProductEmbeddingJobData>(SYNC_PRODUCT_EMBEDDING_QUEUE, {
        connection,
      });

      this.worker = new Worker<SyncProductEmbeddingJobData>(
        SYNC_PRODUCT_EMBEDDING_QUEUE,
        async (job: Job<SyncProductEmbeddingJobData>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job) => {
        logger.info(
          { jobId: job.id, businessId: job.data.businessId, productId: job.data.productId },
          "Catalog product embedding sync job completed",
        );
      });

      this.worker.on("failed", (job, err) => {
        logger.error(
          { jobId: job?.id, businessId: job?.data.businessId, productId: job?.data.productId, err },
          "Catalog product embedding sync job failed",
        );
      });

      if (!this.redisClient) {
        const redisUrl = env.REDIS_URL;
        if (redisUrl) {
          this.redisClient = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: null,
          });
        } else if (env.REDIS_HOST && env.REDIS_PORT) {
          this.redisClient = new Redis({
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: env.REDIS_PASSWORD,
            lazyConnect: true,
            maxRetriesPerRequest: null,
          });
        }
        if (this.redisClient) {
          this.redisClient.on("error", (err) => {
            logger.warn({ err }, "Redis debounce client connection warning");
          });
        }
      }
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ queue/worker for sync-product-embedding");
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
      if (this.redisClient) {
        this.redisClient.disconnect();
        this.redisClient = null;
      }
    } catch (err) {
      logger.warn({ err }, "Error closing sync-product-embedding queue/worker");
    }
  }

  /**
   * Enqueue a product for embedding synchronization with debouncing
   */
  async enqueueSync(
    businessId: string,
    productId: string,
    options?: {
      debounceMs?: number;
      mutationType?: string;
    },
  ) {
    const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_WINDOW_MS;
    const now = Date.now();
    const debounceKey = `${CATALOG_DEBOUNCE_KEY_PREFIX}${businessId}:${productId}`;

    // Record last mutation timestamp in Redis
    if (this.redisClient) {
      try {
        await this.redisClient.set(debounceKey, now.toString(), "PX", debounceMs * 4);
      } catch (err) {
        logger.warn({ err, debounceKey }, "Failed to write debounce key in Redis");
      }
    }

    if (this.queue) {
      try {
        const jobId = `sync-product_${businessId}_${productId}`;
        return await this.queue.add(
          "sync-product-embedding",
          {
            businessId,
            productId,
            enqueuedAt: now,
            mutationType: options?.mutationType,
          },
          {
            delay: debounceMs,
            jobId,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (err) {
        logger.warn({ err }, "Could not enqueue debounced sync job to BullMQ");
      }
    }
    return null;
  }

  /**
   * Process a sync-product-embedding job with debouncing validation
   */
  async processJob(job: Job<SyncProductEmbeddingJobData>) {
    const { businessId, productId } = job.data;
    const debounceKey = `${CATALOG_DEBOUNCE_KEY_PREFIX}${businessId}:${productId}`;
    const debounceWindowMs = DEFAULT_DEBOUNCE_WINDOW_MS;

    let lastMutationStr: string | null = null;
    if (this.redisClient) {
      try {
        lastMutationStr = await this.redisClient.get(debounceKey);
      } catch (err) {
        logger.warn({ err, debounceKey }, "Failed to read debounce key from Redis");
      }
    }

    if (lastMutationStr) {
      const lastMutationTime = Number(lastMutationStr);
      const elapsed = Date.now() - lastMutationTime;

      // If another edit occurred within the debounce window, reschedule for remaining duration
      if (elapsed < debounceWindowMs) {
        const remainingDelay = Math.max(100, debounceWindowMs - elapsed);
        logger.info(
          { businessId, productId, elapsed, remainingDelay },
          "Debouncing catalog embedding sync: edit occurred recently, delaying job",
        );

        if (this.queue) {
          await this.queue.add(
            "sync-product-embedding",
            {
              businessId,
              productId,
              enqueuedAt: lastMutationTime,
              mutationType: job.data.mutationType,
            },
            {
              delay: remainingDelay,
              jobId: `sync-product:${businessId}:${productId}:${Date.now()}`,
              removeOnComplete: true,
              removeOnFail: true,
            },
          );
        }

        return {
          debounced: true,
          rescheduled: true,
          remainingDelay,
          businessId,
          productId,
        };
      }
    }

    // Debounce window expired with no further edits: perform single embedding refresh
    if (this.redisClient) {
      try {
        await this.redisClient.del(debounceKey);
      } catch (err) {
        logger.warn({ err, debounceKey }, "Failed to clear debounce key in Redis");
      }
    }

    const result = await this.catalogIndexerService.syncProductEmbeddings(businessId, productId);
    return {
      debounced: false,
      success: true,
      businessId,
      productId,
      result,
    };
  }
}
