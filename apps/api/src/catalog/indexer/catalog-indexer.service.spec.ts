import { ProductStatus } from "@prisma/client";
import type { Job } from "bullmq";

jest.mock("../../lib/queue.js", () => ({
  connection: {},
}));

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => {
    const memory = new Map<string, string>();
    return {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(memory.get(key) ?? null)),
      set: jest.fn().mockImplementation((key: string, val: string) => {
        memory.set(key, val);
        return Promise.resolve("OK");
      }),
      del: jest.fn().mockImplementation((key: string) => {
        memory.delete(key);
        return Promise.resolve(1);
      }),
      on: jest.fn(),
      quit: jest.fn().mockResolvedValue("OK"),
      disconnect: jest.fn(),
    };
  });
});

jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation((name: string) => ({
      name,
      add: jest.fn().mockResolvedValue({ id: "job-1" }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    Worker: jest.fn().mockImplementation((name: string, processorFn: any) => ({
      name,
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      processFn: processorFn,
    })),
  };
});

import {
  CatalogIndexerProcessor,
  DEFAULT_DEBOUNCE_WINDOW_MS,
  SYNC_PRODUCT_EMBEDDING_QUEUE,
  type SyncProductEmbeddingJobData,
} from "./catalog-indexer.processor";
import {
  CatalogIndexerService,
  CATALOG_PRODUCT_UPDATED_EVENT,
  formatJsonText,
  sha256,
} from "./catalog-indexer.service";

describe("Catalog re-indexing & search sync worker (T-CAT-04)", () => {
  const businessId = "00000000-0000-0000-0000-000000000001";
  const productId = "11111111-1111-1111-1111-111111111111";
  const variantId1 = "22222222-2222-2222-2222-222222222222";
  const variantId2 = "33333333-3333-3333-3333-333333333333";

  let mockPrisma: any;
  let mockQueue: any;
  let mockRedis: any;
  let processor: CatalogIndexerProcessor;
  let service: CatalogIndexerService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      product: {
        findFirst: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-123" }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    const redisStore = new Map<string, string>();
    mockRedis = {
      get: jest.fn().mockImplementation((k: string) => Promise.resolve(redisStore.get(k) ?? null)),
      set: jest.fn().mockImplementation((k: string, v: string) => {
        redisStore.set(k, v);
        return Promise.resolve("OK");
      }),
      del: jest.fn().mockImplementation((k: string) => {
        redisStore.delete(k);
        return Promise.resolve(1);
      }),
      on: jest.fn(),
      disconnect: jest.fn(),
    };

    // Instantiate service first with a forward processor placeholder
    service = new CatalogIndexerService(undefined, mockPrisma);
    processor = new CatalogIndexerProcessor(service, mockRedis, mockQueue);

    // Link processor into service
    (service as any).processor = processor;
  });

  afterEach(async () => {
    await processor.onModuleDestroy();
  });

  describe("1. Acceptance Criteria: Job Enqueue", () => {
    it("Job Enqueue: Modifying product enqueues re-index job in BullMQ.", async () => {
      const result = await service.notifyProductUpdated(businessId, productId, "updated");

      expect(result.published).toBe(true);
      expect(result.event).toMatchObject({
        businessId,
        productId,
        mutationType: "updated",
      });

      // Verify BullMQ job was added to sync-product-embedding queue with 5s delay
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        "sync-product-embedding",
        expect.objectContaining({
          businessId,
          productId,
          mutationType: "updated",
        }),
        expect.objectContaining({
          delay: DEFAULT_DEBOUNCE_WINDOW_MS,
          jobId: `sync-product_${businessId}_${productId}`,
          removeOnComplete: true,
          removeOnFail: true,
        }),
      );

      // Verify debounce key was stored in Redis
      const debounceKey = `catalog:debounce:${businessId}:${productId}`;
      expect(mockRedis.set).toHaveBeenCalledWith(
        debounceKey,
        expect.any(String),
        "PX",
        DEFAULT_DEBOUNCE_WINDOW_MS * 4,
      );
    });

    it("publishes catalog.product.updated with variant mutation details", async () => {
      const result = await service.publishProductUpdated({
        businessId,
        productId,
        variantId: variantId1,
        mutationType: "variant_updated",
      });

      expect(result.published).toBe(true);
      expect(result.event).toMatchObject({
        businessId,
        productId,
        variantId: variantId1,
        mutationType: "variant_updated",
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        "sync-product-embedding",
        expect.objectContaining({
          mutationType: "variant_updated",
        }),
        expect.any(Object),
      );
    });
  });

  describe("2. Acceptance Criteria: Debouncing", () => {
    it("Debounce: Rapid successive edits result in a single embedding refresh.", async () => {
      const syncSpy = jest.spyOn(service, "syncProductEmbeddings").mockResolvedValue({
        success: true,
        businessId,
        productId,
        action: "synced",
        chunksCount: 3,
        updatedCount: 3,
        skippedCount: 0,
      });

      // 1. First edit at t = 0
      const t0 = Date.now();
      await service.notifyProductUpdated(businessId, productId, "updated");
      expect(mockQueue.add).toHaveBeenCalledTimes(1);

      // 2. Second rapid edit at t = 2000ms (within 5s debounce window)
      const t2 = t0 + 2000;
      const debounceKey = `catalog:debounce:${businessId}:${productId}`;
      await mockRedis.set(debounceKey, t2.toString());

      // 3. First BullMQ job executes at t = 5000ms
      // Since last edit was at t2 = 2000ms, elapsed = 3000ms < 5000ms debounce window
      const job1 = {
        id: "job-1",
        data: {
          businessId,
          productId,
          enqueuedAt: t0,
          mutationType: "updated",
        },
      } as unknown as Job<SyncProductEmbeddingJobData>;

      const processResult1 = await processor.processJob(job1);

      // Should be debounced and rescheduled
      expect(processResult1.debounced).toBe(true);
      expect(processResult1.rescheduled).toBe(true);
      expect(syncSpy).not.toHaveBeenCalled();

      // 4. Time elapses beyond debounce window: last edit was > 5000ms ago
      await mockRedis.set(debounceKey, (Date.now() - 6000).toString());

      const job2 = {
        id: "job-2",
        data: {
          businessId,
          productId,
          enqueuedAt: t2,
          mutationType: "updated",
        },
      } as unknown as Job<SyncProductEmbeddingJobData>;

      const processResult2 = await processor.processJob(job2);

      // Debounce window cleared: triggers single embedding refresh
      expect(processResult2.debounced).toBe(false);
      expect(processResult2.success).toBe(true);
      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(syncSpy).toHaveBeenCalledWith(businessId, productId);

      // Debounce key cleaned up
      expect(mockRedis.del).toHaveBeenCalledWith(debounceKey);
    });
  });

  describe("3. Embedding Synchronization & Multi-Tenant Isolation", () => {
    it("synchronizes product and variant vector embeddings with correct chunking", async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: productId,
        business_id: businessId,
        name: "Wireless Earbuds",
        description: "Noise cancelling Bluetooth earbuds",
        status: ProductStatus.active,
        benefits: ["Long battery life", "Comfortable fit"],
        selling_points: ["40h playtime", "IPX5 waterproof"],
        variants: [
          {
            id: variantId1,
            sku: "WEB-BLK",
            attributes: { color: "Black" },
          },
          {
            id: variantId2,
            sku: "WEB-WHT",
            attributes: { color: "White" },
          },
        ],
      });

      // No existing embeddings
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.syncProductEmbeddings(businessId, productId);

      expect(result.success).toBe(true);
      expect(result.action).toBe("synced");
      expect(result.chunksCount).toBe(3); // 1 product chunk + 2 variant chunks
      expect(result.updatedCount).toBe(3);
      expect(result.skippedCount).toBe(0);

      // Multi-tenant check: verifies businessId was passed in findFirst
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: productId, business_id: businessId },
        include: { variants: true },
      });

      // Verify raw SQL insert for embeddings was called 3 times
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    });

    it("skips unchanged chunks when content_hash matches existing embedding", async () => {
      const productChunkText = ["Wireless Earbuds", "Noise cancelling Bluetooth earbuds"].join(
        "\n",
      );
      const productHash = sha256(productChunkText);

      mockPrisma.product.findFirst.mockResolvedValue({
        id: productId,
        business_id: businessId,
        name: "Wireless Earbuds",
        description: "Noise cancelling Bluetooth earbuds",
        status: ProductStatus.active,
        benefits: null,
        selling_points: null,
        variants: [
          {
            id: variantId1,
            sku: "WEB-BLK",
            attributes: { color: "Black" },
          },
        ],
      });

      // Existing embedding has the same hash for product chunk
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "emb-1",
          source_id: productId,
          source_type: "product",
          chunk_index: 0,
          content_hash: productHash,
        },
      ]);

      const result = await service.syncProductEmbeddings(businessId, productId);

      expect(result.success).toBe(true);
      expect(result.skippedCount).toBe(1); // Product chunk skipped
      expect(result.updatedCount).toBe(1); // Variant chunk updated
      expect(result.chunksCount).toBe(2);
    });

    it("deletes embeddings when product is not found or archived", async () => {
      // Product archived
      mockPrisma.product.findFirst.mockResolvedValue({
        id: productId,
        business_id: businessId,
        status: ProductStatus.archived,
        variants: [],
      });

      const result = await service.syncProductEmbeddings(businessId, productId);

      expect(result.success).toBe(true);
      expect(result.action).toBe("deleted");
      expect(result.reason).toBe("product_archived");
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM embeddings"),
        businessId,
        productId,
      );
    });

    it("cleans up stale variant embeddings when a variant is removed", async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: productId,
        business_id: businessId,
        name: "Single Variant Product",
        description: "Description",
        status: ProductStatus.active,
        benefits: null,
        selling_points: null,
        variants: [
          {
            id: variantId1,
            sku: "SKU-1",
            attributes: {},
          },
        ],
      });

      // DB had variantId1 and an old variantId2
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "emb-1",
          source_id: productId,
          source_type: "product",
          chunk_index: 0,
          content_hash: "hash-1",
        },
        {
          id: "emb-2",
          source_id: variantId1,
          source_type: "variant",
          chunk_index: 0,
          content_hash: "hash-2",
        },
        {
          id: "emb-3",
          source_id: variantId2,
          source_type: "variant",
          chunk_index: 0,
          content_hash: "hash-3",
        },
      ]);

      await service.syncProductEmbeddings(businessId, productId);

      // Stale variantId2 should be deleted
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM embeddings"),
        businessId,
        [variantId2],
      );
    });
  });

  describe("4. Utility and Helper Functions", () => {
    it("formatJsonText formats strings, arrays, and objects correctly", () => {
      expect(formatJsonText(null)).toBeNull();
      expect(formatJsonText("")).toBeNull();
      expect(formatJsonText(" Simple Text ")).toBe("Simple Text");
      expect(formatJsonText(["Benefit 1", "Benefit 2"])).toBe("Benefit 1, Benefit 2");
      expect(formatJsonText({ color: "Red", size: "L" })).toBe("color: Red, size: L");
    });

    it("generateEmbedding produces 1536-dimensional vector", async () => {
      const vector = await service.generateEmbedding("Sample product description");
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(1536);
      expect(typeof vector[0]).toBe("number");
    });

    it("exports canonical event and queue name constants", () => {
      expect(CATALOG_PRODUCT_UPDATED_EVENT).toBe("catalog.product.updated");
      expect(SYNC_PRODUCT_EMBEDDING_QUEUE).toBe("sync-product-embedding");
      expect(DEFAULT_DEBOUNCE_WINDOW_MS).toBe(5000);
    });

    it("handles onModuleInit and onModuleDestroy gracefully", async () => {
      const testProcessor = new CatalogIndexerProcessor(service);
      expect(() => testProcessor.onModuleInit()).not.toThrow();
      await expect(testProcessor.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
