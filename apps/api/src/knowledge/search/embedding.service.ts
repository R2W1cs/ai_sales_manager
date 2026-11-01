import * as crypto from "crypto";

import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { type PrismaClient, EmbeddingSource } from "@prisma/client";

import { AiGatewayService } from "../../ai/gateway/ai-gateway.service";
import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";

export interface ChunkOptions {
  maxChars?: number; // default 1500 (~500 tokens per 15 §9.2)
  overlapChars?: number; // default 150 (~50 tokens per 15 §9.2)
}

export interface DocumentIndexingResult {
  success: boolean;
  businessId: string;
  documentId: string;
  chunksCount: number;
  updatedCount: number;
  skippedCount: number;
}

interface ExistingEmbeddingRow {
  id: string;
  source_id: string;
  source_type: string;
  chunk_index: number;
  content_hash: string;
}

/**
 * Split text into semantic sliding window chunks per 15 §9.2:
 * "Knowledge raw_text: Split on blank lines; pack to ≤ 1500 characters; overlap 150 characters. chunk_index 0..n."
 */
export function chunkText(rawText: string, options?: ChunkOptions): string[] {
  const maxChars = options?.maxChars ?? 1500;
  const overlapChars = options?.overlapChars ?? 150;

  if (!rawText.trim()) {
    return [];
  }

  // Split into paragraphs on blank lines
  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If single paragraph exceeds maxChars, slice it with overlap
    if (paragraph.length > maxChars) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      let start = 0;
      while (start < paragraph.length) {
        let end = start + maxChars;
        if (end < paragraph.length) {
          // Try to break on word boundary
          const lastSpace = paragraph.lastIndexOf(" ", end);
          if (lastSpace > start + maxChars * 0.6) {
            end = lastSpace;
          }
        }
        const slice = paragraph.slice(start, end).trim();
        if (slice) {
          chunks.push(slice);
        }
        if (end >= paragraph.length) {
          break;
        }
        start = end - overlapChars;
      }
      continue;
    }

    // Normal paragraph packing
    const candidate = currentChunk.length === 0 ? paragraph : `${currentChunk}\n\n${paragraph}`;

    if (candidate.length <= maxChars) {
      currentChunk = candidate;
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }
      // Start new chunk with overlap from tail of previous chunk if helpful
      if (currentChunk.length > overlapChars) {
        const overlap = currentChunk.slice(-overlapChars).trim();
        currentChunk = `${overlap}\n\n${paragraph}`;
        if (currentChunk.length > maxChars) {
          currentChunk = paragraph;
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

@Injectable()
export class EmbeddingService {
  private readonly prisma: PrismaClient;
  private readonly aiGateway: AiGatewayService;

  constructor(@Optional() prismaClient?: PrismaClient, @Optional() aiGateway?: AiGatewayService) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.aiGateway = aiGateway ?? new AiGatewayService();
  }

  /**
   * Generate 1536-dimensional vector embedding for text
   * Uses Vercel AI SDK + AI Gateway with deterministic fallback for offline/test environments
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.aiGateway.isConfigured()) {
      try {
        const embedding = await this.aiGateway.generateEmbedding(text);
        if (embedding && embedding.length > 0) {
          return embedding;
        }
      } catch (err) {
        logger.warn(
          { err },
          "AI Gateway embedding generation failed; using deterministic fallback",
        );
      }
    }

    // Deterministic 1536-dimensional normalized vector for tests/offline
    return this.generateDeterministicVector(text);
  }

  /**
   * Batch generate embeddings for multiple texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (this.aiGateway.isConfigured()) {
      try {
        const embeddings = await this.aiGateway.generateEmbeddings(texts);
        if (embeddings?.length === texts.length) {
          return embeddings;
        }
      } catch (err) {
        logger.warn({ err }, "Batch AI Gateway embedding generation failed; using fallback");
      }
    }

    return texts.map((t) => this.generateDeterministicVector(t));
  }

  /**
   * Deterministic unit-normalized 1536-dim vector generator from text sha256 hash
   */
  private generateDeterministicVector(text: string): number[] {
    const hash = crypto.createHash("sha256").update(text).digest();
    const vector: number[] = Array.from<number>({ length: 1536 }).fill(0);
    let sumSq = 0;

    for (let i = 0; i < 1536; i++) {
      const byte = hash[i % hash.length] ?? 0;
      // Add index variation for rich distribution across 1536 dimensions
      const val = (byte - 128) / 128 + Math.sin(i * 0.1) * 0.05;
      vector[i] = val;
      sumSq += val * val;
    }

    // Normalize to unit vector for cosine similarity precision
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < 1536; i++) {
      const v = vector[i] ?? 0;
      vector[i] = Number((v / norm).toFixed(6));
    }

    return vector;
  }

  /**
   * Index a knowledge document:
   * 1. Fetches document scoped strictly to businessId
   * 2. Sets indexing_status to 'indexing'
   * 3. Chunks raw_text into ≤1500 char pieces with 150 char overlap
   * 4. Compares chunk content hashes to skip unchanged embeddings
   * 5. Embeds and upserts new/modified chunks into pgvector embeddings table
   * 6. Deletes any stale overflow chunks
   * 7. Sets indexing_status to 'ready' (or 'failed' on error)
   */
  async indexDocument(businessId: string, documentId: string): Promise<DocumentIndexingResult> {
    const doc = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id: documentId,
        business_id: businessId,
      },
    });

    if (!doc) {
      throw new NotFoundException(
        `Knowledge document '${documentId}' not found for business '${businessId}'`,
      );
    }

    // Set indexing status
    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { indexing_status: "indexing" },
    });

    try {
      const chunks = chunkText(doc.raw_text);

      // If document has empty text, purge all document embeddings and mark ready
      if (chunks.length === 0) {
        await this.deleteDocumentEmbeddings(businessId, documentId);
        await this.prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: { indexing_status: "ready" },
        });

        return {
          success: true,
          businessId,
          documentId,
          chunksCount: 0,
          updatedCount: 0,
          skippedCount: 0,
        };
      }

      // Fetch existing embeddings for this document
      let existingRows: ExistingEmbeddingRow[] = [];
      try {
        existingRows = await this.prisma.$queryRawUnsafe<ExistingEmbeddingRow[]>(
          `SELECT id, source_id, source_type, chunk_index, content_hash
           FROM embeddings
           WHERE business_id = $1::uuid
             AND source_type = 'knowledge_document'::"EmbeddingSource"
             AND source_id = $2::uuid`,
          businessId,
          documentId,
        );
      } catch (err) {
        logger.warn(
          { err },
          "Could not query existing document embeddings; proceeding with upsert",
        );
      }

      const existingMap = new Map<number, string>();
      for (const row of existingRows) {
        existingMap.set(row.chunk_index, row.content_hash);
      }

      let updatedCount = 0;
      let skippedCount = 0;

      const chunksToUpdate: { chunkContent: string; i: number }[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i];
        if (!chunkContent) continue;
        const contentHash = sha256(chunkContent);
        const existingHash = existingMap.get(i);
        if (existingHash === contentHash) {
          skippedCount++;
          continue;
        }
        chunksToUpdate.push({ chunkContent, i });
      }

      if (chunksToUpdate.length > 0) {
        await Promise.all(
          chunksToUpdate.map(async ({ chunkContent, i }) => {
            const contentHash = sha256(chunkContent);
            const vector = await this.generateEmbedding(chunkContent);
            await this.upsertEmbeddingRow({
              businessId,
              sourceType: EmbeddingSource.knowledge_document,
              sourceId: documentId,
              chunkIndex: i,
              chunkText: chunkContent,
              contentHash,
              vector,
            });
          }),
        );
        updatedCount += chunksToUpdate.length;
      }

      // Clean up stale chunks if chunk count decreased
      if (existingRows.some((r) => r.chunk_index >= chunks.length)) {
        try {
          // react-doctor-disable-next-line raw-sql-injection-risk
          await this.prisma.$executeRawUnsafe(
            `DELETE FROM embeddings
             WHERE business_id = $1::uuid
               AND source_type = 'knowledge_document'::"EmbeddingSource"
               AND source_id = $2::uuid
               AND chunk_index >= $3`,
            businessId,
            documentId,
            chunks.length,
          );
        } catch (err) {
          logger.warn({ err }, "Error cleaning up stale document chunks");
        }
      }

      // Mark document as ready
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { indexing_status: "ready" },
      });

      return {
        success: true,
        businessId,
        documentId,
        chunksCount: chunks.length,
        updatedCount,
        skippedCount,
      };
    } catch (err) {
      logger.error({ err, businessId, documentId }, "Knowledge document indexing failed");
      try {
        await this.prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: { indexing_status: "failed" },
        });
      } catch (updateErr) {
        logger.warn({ updateErr }, "Failed to update document status to failed");
      }
      throw err;
    }
  }

  /**
   * Delete all embeddings for a knowledge document
   */
  async deleteDocumentEmbeddings(businessId: string, documentId: string): Promise<void> {
    try {
      // react-doctor-disable-next-line raw-sql-injection-risk
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM embeddings
         WHERE business_id = $1::uuid
           AND source_type = 'knowledge_document'::"EmbeddingSource"
           AND source_id = $2::uuid`,
        businessId,
        documentId,
      );
    } catch (err) {
      logger.warn({ err, businessId, documentId }, "Error deleting document embeddings");
    }
  }

  /**
   * Upsert single embedding vector row into pgvector embeddings table
   * Strictly enforces multi-tenant isolation with business_id
   */
  async upsertEmbeddingRow(params: {
    businessId: string;
    sourceType: EmbeddingSource;
    sourceId: string;
    chunkIndex: number;
    chunkText: string;
    contentHash: string;
    vector: number[];
  }): Promise<void> {
    const vectorString = `[${params.vector.join(",")}]`;
    try {
      // react-doctor-disable-next-line raw-sql-injection-risk
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO embeddings (id, business_id, source_type, source_id, chunk_index, chunk_text, content_hash, embedding, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::"EmbeddingSource", $3::uuid, $4, $5, $6, $7::vector, NOW())
         ON CONFLICT (business_id, source_type, source_id, chunk_index)
         DO UPDATE SET
           chunk_text = EXCLUDED.chunk_text,
           content_hash = EXCLUDED.content_hash,
           embedding = EXCLUDED.embedding,
           created_at = NOW()`,
        params.businessId,
        params.sourceType,
        params.sourceId,
        params.chunkIndex,
        params.chunkText,
        params.contentHash,
        vectorString,
      );
    } catch (err) {
      logger.warn(
        { err, businessId: params.businessId, sourceId: params.sourceId },
        "Error upserting embedding row",
      );
      throw err;
    }
  }
}
