import { EmbeddingSource, IndexingStatus } from "@prisma/client";
import type { Job } from "bullmq";

jest.mock("../../lib/queue.js", () => ({
  connection: {},
}));

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

import { EmbeddingProcessor, INDEX_KNOWLEDGE_DOCUMENT_JOB } from "./embedding.processor";
import { EmbeddingService, chunkText, sha256 } from "./embedding.service";
import { VectorSearchService } from "./vector-search.service";

describe("RAG chunking, pgvector embedding generation & vector search worker (T-KNOW-03)", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";
  const documentId1 = "33333333-3333-3333-3333-333333333333";

  let mockPrisma: any;
  let mockQueue: any;
  let embeddingService: EmbeddingService;
  let embeddingProcessor: EmbeddingProcessor;
  let vectorSearchService: VectorSearchService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      knowledgeDocument: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-embedding-1" }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    embeddingService = new EmbeddingService(mockPrisma);
    embeddingProcessor = new EmbeddingProcessor(embeddingService, mockQueue);
    vectorSearchService = new VectorSearchService(embeddingService, mockPrisma);
  });

  describe("Text Chunking Utility (15 §9.2)", () => {
    it("splits paragraphs on blank lines and packs into ≤1500 character chunks with 150 char overlap", () => {
      const p1 = "A".repeat(800);
      const p2 = "B".repeat(800);
      const p3 = "C".repeat(400);
      const rawText = `${p1}\n\n${p2}\n\n${p3}`;

      const chunks = chunkText(rawText, { maxChars: 1500, overlapChars: 150 });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]).toContain("A".repeat(100));
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(1500);
      }
    });

    it("splits long single paragraphs >1500 chars with sliding window overlap", () => {
      const longParagraph = "Word ".repeat(400); // ~2000 chars
      const chunks = chunkText(longParagraph, { maxChars: 1000, overlapChars: 100 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(1000);
      }
    });

    it("returns empty array for empty or whitespace text", () => {
      expect(chunkText("")).toEqual([]);
      expect(chunkText("   \n\n  \t  ")).toEqual([]);
    });

    it("computes deterministic SHA-256 content hashes", () => {
      const hash1 = sha256("Store policy: Return within 14 days");
      const hash2 = sha256("Store policy: Return within 14 days");
      const hash3 = sha256("Store policy: Return within 30 days");

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1.length).toBe(64);
    });
  });

  describe("Embedding Generation & Normalization", () => {
    it("generates 1536-dimensional unit-normalized vector", async () => {
      const vector = await embeddingService.generateEmbedding("Store delivery options in Tunis");
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(1536);

      // Verify unit vector normalization: sum(v_i^2) ~= 1.0
      const normSq = vector.reduce((acc, v) => acc + v * v, 0);
      expect(normSq).toBeGreaterThan(0.95);
      expect(normSq).toBeLessThan(1.05);
    });

    it("batch generates 1536-dim embeddings for multiple texts", async () => {
      const texts = ["Policy A", "Policy B", "Product X"];
      const vectors = await embeddingService.generateEmbeddings(texts);
      expect(vectors.length).toBe(3);
      expect(vectors[0]?.length).toBe(1536);
      expect(vectors[1]?.length).toBe(1536);
    });
  });

  describe("Knowledge Document Indexing Workflow", () => {
    it("indexes document: chunks text, creates embeddings, and updates status to ready", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: documentId1,
        business_id: tenantA,
        title: "Return Policy",
        raw_text:
          "Returns accepted within 14 days.\n\nItems must be unworn and in original condition.",
        indexing_status: IndexingStatus.pending,
      });

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]); // No previous embeddings

      const result = await embeddingService.indexDocument(tenantA, documentId1);

      expect(result.success).toBe(true);
      expect(result.chunksCount).toBeGreaterThan(0);
      expect(result.updatedCount).toBe(result.chunksCount);
      expect(result.skippedCount).toBe(0);

      // Verify status transitions: indexing then ready
      expect(mockPrisma.knowledgeDocument.update).toHaveBeenCalledWith({
        where: { id: documentId1 },
        data: { indexing_status: "indexing" },
      });
      expect(mockPrisma.knowledgeDocument.update).toHaveBeenCalledWith({
        where: { id: documentId1 },
        data: { indexing_status: "ready" },
      });

      // Verify raw SQL insert with pgvector
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO embeddings"),
        tenantA,
        EmbeddingSource.knowledge_document,
        documentId1,
        0,
        expect.any(String),
        expect.any(String),
        expect.stringContaining("["),
      );
    });

    it("skips re-embedding unchanged chunks when content_hash matches", async () => {
      const chunk = "Unchanged FAQ paragraph.";
      const hash = sha256(chunk);

      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: documentId1,
        business_id: tenantA,
        title: "FAQ",
        raw_text: chunk,
        indexing_status: IndexingStatus.pending,
      });

      // Existing embedding has the exact same content_hash
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "emb-1",
          source_id: documentId1,
          source_type: "knowledge_document",
          chunk_index: 0,
          content_hash: hash,
        },
      ]);

      const result = await embeddingService.indexDocument(tenantA, documentId1);

      expect(result.success).toBe(true);
      expect(result.skippedCount).toBe(1);
      expect(result.updatedCount).toBe(0);
      // Upsert was not called because hash was identical
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO embeddings"),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("cleans up stale chunks when document content is shortened", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: documentId1,
        business_id: tenantA,
        title: "Short Policy",
        raw_text: "Single short paragraph now.",
        indexing_status: IndexingStatus.pending,
      });

      // Previously had 3 chunks (index 0, 1, 2)
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "e1",
          source_id: documentId1,
          source_type: "knowledge_document",
          chunk_index: 0,
          content_hash: "old-0",
        },
        {
          id: "e2",
          source_id: documentId1,
          source_type: "knowledge_document",
          chunk_index: 1,
          content_hash: "old-1",
        },
        {
          id: "e3",
          source_id: documentId1,
          source_type: "knowledge_document",
          chunk_index: 2,
          content_hash: "old-2",
        },
      ]);

      const result = await embeddingService.indexDocument(tenantA, documentId1);

      expect(result.chunksCount).toBe(1);
      // Deleted chunks with index >= 1
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM embeddings"),
        tenantA,
        documentId1,
        1,
      );
    });

    it("marks indexing_status as failed if an unhandled error occurs", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: documentId1,
        business_id: tenantA,
        title: "Broken Doc",
        raw_text: "Some text",
        indexing_status: IndexingStatus.pending,
      });

      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error("Database connection dropped"));

      await expect(embeddingService.indexDocument(tenantA, documentId1)).rejects.toThrow(
        "Database connection dropped",
      );

      expect(mockPrisma.knowledgeDocument.update).toHaveBeenCalledWith({
        where: { id: documentId1 },
        data: { indexing_status: "failed" },
      });
    });

    it("throws NotFoundException if document does not exist for business", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue(null);

      await expect(embeddingService.indexDocument(tenantA, "non-existent-id")).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe("EmbeddingProcessor Worker & BullMQ Consumer", () => {
    it("initializes BullMQ queue and worker in onModuleInit", () => {
      embeddingProcessor.onModuleInit();
      expect(embeddingProcessor).toBeDefined();
    });

    it("enqueues document indexing job into BullMQ generate-embeddings queue", async () => {
      await embeddingProcessor.enqueueDocumentIndexing(tenantA, documentId1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        INDEX_KNOWLEDGE_DOCUMENT_JOB,
        {
          businessId: tenantA,
          documentId: documentId1,
          enqueuedAt: expect.any(Number),
        },
        expect.objectContaining({
          attempts: 3,
        }),
      );
    });

    it("processes generate-embeddings job by calling embeddingService.indexDocument", async () => {
      const indexDocSpy = jest.spyOn(embeddingService, "indexDocument").mockResolvedValue({
        success: true,
        businessId: tenantA,
        documentId: documentId1,
        chunksCount: 1,
        updatedCount: 1,
        skippedCount: 0,
      });

      const job = {
        id: "job-100",
        data: {
          businessId: tenantA,
          documentId: documentId1,
        },
      } as Job;

      const result = await embeddingProcessor.processJob(job);
      expect(result.success).toBe(true);
      expect(indexDocSpy).toHaveBeenCalledWith(tenantA, documentId1);
    });

    it("gracefully shuts down worker and queue on onModuleDestroy", async () => {
      embeddingProcessor.onModuleInit();
      await embeddingProcessor.onModuleDestroy();
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });

  // Acceptance Criteria Tests
  describe("Acceptance Criteria Verification", () => {
    it("Semantic Retrieval: Query returns relevant policy/product chunks sorted by similarity.", async () => {
      // Mock pgvector query return ordered by cosine similarity descending
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "chunk-1",
          business_id: tenantA,
          source_type: EmbeddingSource.knowledge_document,
          source_id: documentId1,
          chunk_index: 0,
          chunk_text: "We offer 14-day free returns on all unworn clothing items.",
          content_hash: "h1",
          similarity: 0.94,
          distance: 0.06,
        },
        {
          id: "chunk-2",
          business_id: tenantA,
          source_type: EmbeddingSource.product,
          source_id: "prod-1",
          chunk_index: 0,
          chunk_text: "Silk Summer Dress - lightweight Italian fabric with floral pattern",
          content_hash: "h2",
          similarity: 0.81,
          distance: 0.19,
        },
      ]);

      const results = await vectorSearchService.similaritySearch(
        tenantA,
        "Can I return the silk dress if it doesn't fit?",
        { topK: 5, minScore: 0.72 },
      );

      expect(results.length).toBe(2);
      expect(results[0]?.id).toBe("chunk-1");
      expect(results[0]?.similarity).toBe(0.94);
      expect(results[0]?.chunkText).toContain("14-day free returns");
      expect(results[1]?.similarity).toBe(0.81);

      // Verify similarity sorting: results[0] > results[1]
      expect(results[0]?.similarity).toBeGreaterThan(results[1]?.similarity ?? 0);

      // Verify raw SQL query includes cosine distance operator <=> and WHERE business_id = $2
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHERE business_id = $2::uuid"),
        expect.stringContaining("["),
        tenantA,
        expect.any(Array),
        expect.any(Number),
      );
    });

    it("Tenancy Isolation: Vectors belonging to Tenant A are never returned to Tenant B.", async () => {
      // Setup: Database contains Tenant A vectors and Tenant B vectors
      // Query is executed strictly for Tenant B
      mockPrisma.$queryRawUnsafe.mockImplementation((sql: string, _vec: string, bid: string) => {
        expect(bid).toBe(tenantB);
        expect(sql).toContain("WHERE business_id = $2::uuid");

        // DB query returns only Tenant B rows matching business_id filter
        return Promise.resolve([
          {
            id: "chunk-tenant-b",
            business_id: tenantB,
            source_type: EmbeddingSource.knowledge_document,
            source_id: "doc-b",
            chunk_index: 0,
            chunk_text: "Tenant B confidential return policy",
            content_hash: "hb",
            similarity: 0.88,
            distance: 0.12,
          },
        ]);
      });

      const results = await vectorSearchService.similaritySearch(
        tenantB,
        "What is the return policy?",
      );

      expect(results.length).toBe(1);
      expect(results[0]?.businessId).toBe(tenantB);
      expect(results[0]?.chunkText).toContain("Tenant B");

      // Verify Tenant A vectors were never queried or returned
      const hasTenantA = results.some((r) => r.businessId === tenantA);
      expect(hasTenantA).toBe(false);
    });

    it("Score Filtering: Low-relevance chunks (<0.72) are excluded.", async () => {
      // Mock search results containing both high and low similarity scores
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "high-1",
          business_id: tenantA,
          source_type: EmbeddingSource.knowledge_document,
          source_id: "doc-1",
          chunk_index: 0,
          chunk_text: "Delivery to Grand Tunis takes 24 hours.",
          similarity: 0.89,
          distance: 0.11,
        },
        {
          id: "borderline-1",
          business_id: tenantA,
          source_type: EmbeddingSource.knowledge_document,
          source_id: "doc-2",
          chunk_index: 0,
          chunk_text: "Standard shipping fee is 7 DT.",
          similarity: 0.73, // >= 0.72 (included)
          distance: 0.27,
        },
        {
          id: "low-1",
          business_id: tenantA,
          source_type: EmbeddingSource.product,
          source_id: "prod-2",
          chunk_index: 0,
          chunk_text: "Winter wool coat in navy blue.",
          similarity: 0.65, // < 0.72 (must be excluded)
          distance: 0.35,
        },
        {
          id: "low-2",
          business_id: tenantA,
          source_type: EmbeddingSource.knowledge_document,
          source_id: "doc-3",
          chunk_index: 0,
          chunk_text: "Unrelated store history from 2018.",
          similarity: 0.42, // < 0.72 (must be excluded)
          distance: 0.58,
        },
      ]);

      const results = await vectorSearchService.similaritySearch(
        tenantA,
        "How much is shipping to Tunis?",
        { minScore: 0.72 },
      );

      // Only high (0.89) and borderline (0.73) should be returned
      expect(results.length).toBe(2);
      expect(results.map((r) => r.id)).toEqual(["high-1", "borderline-1"]);

      // Verify every returned item meets the threshold
      for (const item of results) {
        expect(item.similarity).toBeGreaterThanOrEqual(0.72);
      }
    });
  });
});
