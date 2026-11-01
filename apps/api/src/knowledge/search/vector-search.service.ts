import { Injectable, Optional } from "@nestjs/common";
import { type PrismaClient, EmbeddingSource } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { EmbeddingService } from "./embedding.service";

export interface VectorSearchResult {
  id: string;
  businessId: string;
  sourceType: EmbeddingSource;
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  similarity: number;
  distance: number;
}

export interface SimilaritySearchOptions {
  topK?: number; // default 5 (per 15 §9.3), clamp 1..15
  minScore?: number; // default 0.72 (minimum similarity threshold)
  sourceTypes?: EmbeddingSource[]; // default [knowledge_document, product, variant]
  maxDistance?: number; // optional max distance (e.g. 0.55 per 15 §9.3)
}

interface RawVectorSearchRow {
  id: string;
  business_id: string;
  source_type: EmbeddingSource;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  content_hash: string;
  similarity: number;
  distance: number;
}

@Injectable()
export class VectorSearchService {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly embeddingService: EmbeddingService,
    @Optional() prismaClient?: PrismaClient,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Semantic similarity search via PostgreSQL pgvector cosine distance operator `<=>`
   *
   * Invariants enforced:
   * 1. 🔒 Tenancy Boundary: Strict `WHERE business_id = $2::uuid` query condition
   *    (cross-tenant similarity search is strictly forbidden).
   * 2. 🛡️ Score Threshold: Automatically filters out chunks below minScore (default 0.72).
   * 3. Order: Returned sorted by cosine similarity descending (distance ascending).
   */
  async similaritySearch(
    businessId: string,
    queryText: string,
    options?: SimilaritySearchOptions,
  ): Promise<VectorSearchResult[]> {
    if (!businessId) {
      throw new Error("businessId is required for vector search");
    }

    if (!queryText.trim()) {
      return [];
    }

    const topK = Math.min(Math.max(options?.topK ?? 5, 1), 15);
    const minScore = options?.minScore ?? 0.72;
    const sourceTypes = options?.sourceTypes ?? [
      EmbeddingSource.knowledge_document,
      EmbeddingSource.product,
      EmbeddingSource.variant,
    ];

    try {
      // 1. Generate query vector (1536 dimensions)
      const queryVector = await this.embeddingService.generateEmbedding(queryText.trim());
      const vectorString = `[${queryVector.join(",")}]`;

      // 2. Execute raw SQL query with pgvector cosine distance operator <=>
      // Cosine distance <=> yields values from 0.0 (identical) to 2.0 (opposite).
      // Cosine similarity = 1 - distance.
      const rawRows = await this.prisma.$queryRawUnsafe<RawVectorSearchRow[]>(
        `SELECT
           id,
           business_id,
           source_type,
           source_id,
           chunk_index,
           chunk_text,
           content_hash,
           (1 - (embedding <=> $1::vector)) AS similarity,
           (embedding <=> $1::vector) AS distance
         FROM embeddings
         WHERE business_id = $2::uuid
           AND source_type = ANY($3::"EmbeddingSource"[])
         ORDER BY embedding <=> $1::vector ASC
         LIMIT $4`,
        vectorString,
        businessId,
        sourceTypes,
        topK * 2,
      );

      const results: VectorSearchResult[] = [];

      for (const row of rawRows) {
        // Enforce Tenancy Isolation in memory guardrail
        if (row.business_id !== businessId) {
          logger.warn(
            { returnedBusinessId: row.business_id, expectedBusinessId: businessId },
            "Cross-tenant vector row detected and discarded",
          );
          continue;
        }

        const similarity =
          typeof row.similarity === "number" ? row.similarity : Number(row.similarity);
        const distance = typeof row.distance === "number" ? row.distance : Number(row.distance);

        // Filter out results below minimum similarity threshold (0.72)
        if (similarity < minScore) {
          continue;
        }

        // Optional max distance filter (per 15 §9.3 dist <= 0.55)
        if (options?.maxDistance !== undefined && distance > options.maxDistance) {
          continue;
        }

        results.push({
          id: row.id,
          businessId: row.business_id,
          sourceType: row.source_type,
          sourceId: row.source_id,
          chunkIndex: row.chunk_index,
          chunkText: row.chunk_text,
          similarity: Number(similarity.toFixed(4)),
          distance: Number(distance.toFixed(4)),
        });

        if (results.length >= topK) {
          break;
        }
      }

      return results;
    } catch (err) {
      logger.error({ err, businessId, queryText }, "Vector similarity search failed");
      return [];
    }
  }
}
