import * as crypto from "crypto";

import { Injectable, Optional, Inject, forwardRef } from "@nestjs/common";
import { Prisma, type PrismaClient, ProductStatus } from "@prisma/client";

import { EmbeddingService } from "../../knowledge/search/embedding.service";
import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import {
  type CatalogIndexerProcessor,
  CatalogIndexerProcessor as CatalogIndexerProcessorRef,
} from "./catalog-indexer.processor";

export const CATALOG_PRODUCT_UPDATED_EVENT = "catalog.product.updated";
export const EVENT_CATALOG_PRODUCT_UPDATED = CATALOG_PRODUCT_UPDATED_EVENT;

export type MutationType =
  | "created"
  | "updated"
  | "deleted"
  | "variant_updated"
  | "variant_deleted";

export interface CatalogProductUpdatedEvent {
  businessId: string;
  productId: string;
  variantId?: string;
  mutationType: MutationType;
  timestamp?: number;
}

export interface ProductSyncResult {
  success: boolean;
  businessId: string;
  productId: string;
  action: "synced" | "deleted" | "skipped";
  chunksCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  reason?: string;
}

interface ExistingEmbeddingRow {
  id: string;
  source_id: string;
  source_type: string;
  chunk_index: number;
  content_hash: string;
}

export function formatJsonText(val: Prisma.JsonValue | null | undefined): string | null {
  if (!val) return null;
  if (typeof val === "string") return val.trim() || null;
  if (Array.isArray(val)) {
    const items: string[] = [];
    for (const item of val) {
      const str = typeof item === "string" ? item : JSON.stringify(item);
      if (str) items.push(str);
    }
    return items.length > 0 ? items.join(", ") : null;
  }
  if (typeof val === "object") {
    const entries: string[] = [];
    for (const [k, v] of Object.entries(val)) {
      const entry = `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`;
      if (entry) entries.push(entry);
    }
    return entries.length > 0 ? entries.join(", ") : null;
  }
  return null;
}

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

@Injectable()
export class CatalogIndexerService {
  private readonly prisma: PrismaClient;
  private readonly embeddingService: EmbeddingService;

  constructor(
    @Inject(forwardRef(() => CatalogIndexerProcessorRef))
    private readonly processor?: CatalogIndexerProcessor,
    @Optional() prismaClient?: PrismaClient,
    @Optional() embeddingService?: EmbeddingService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.embeddingService = embeddingService ?? new EmbeddingService(this.prisma);
  }

  /**
   * Publish a catalog.product.updated event and enqueue background re-indexing
   */
  async publishProductUpdated(event: CatalogProductUpdatedEvent): Promise<{
    published: boolean;
    event: CatalogProductUpdatedEvent;
  }> {
    const fullEvent: CatalogProductUpdatedEvent = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    };

    logger.info({ event: fullEvent }, `Emitting event: ${CATALOG_PRODUCT_UPDATED_EVENT}`);

    // Enqueue BullMQ debounce worker job
    if (this.processor) {
      await this.processor.enqueueSync(fullEvent.businessId, fullEvent.productId, {
        mutationType: fullEvent.mutationType,
      });
    }

    return { published: true, event: fullEvent };
  }

  /**
   * Convenience helper to trigger catalog.product.updated
   */
  async notifyProductUpdated(
    businessId: string,
    productId: string,
    mutationType: MutationType = "updated",
    variantId?: string,
  ) {
    return this.publishProductUpdated({
      businessId,
      productId,
      variantId,
      mutationType,
      timestamp: Date.now(),
    });
  }

  /**
   * Synchronize product and variant vector embeddings into the database
   * Strictly adheres to 15 §9.2 chunking rules (no price/stock in embedding chunk text)
   * Multi-tenant isolation: enforces `WHERE business_id = $businessId` on all operations
   */
  async syncProductEmbeddings(businessId: string, productId: string): Promise<ProductSyncResult> {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        business_id: businessId,
      },
      include: {
        variants: true,
      },
    });

    // If product does not exist or has been archived, purge embeddings (product + variants)
    if (!product || product.status === ProductStatus.archived) {
      await this.deleteProductEmbeddings(businessId, productId);
      return {
        success: true,
        businessId,
        productId,
        action: "deleted",
        reason: !product ? "product_not_found" : "product_archived",
      };
    }

    // 1. Build Product Chunk per 15 §9.2:
    // One chunk: name + description + benefits + selling_points. No price.
    const benefitsText = formatJsonText(product.benefits);
    const sellingPointsText = formatJsonText(product.selling_points);

    const productChunkParts = [
      product.name,
      product.description,
      benefitsText ? `Benefits: ${benefitsText}` : null,
      sellingPointsText ? `Selling points: ${sellingPointsText}` : null,
    ].filter(Boolean);

    const productChunkText = productChunkParts.join("\n");
    const productContentHash = sha256(productChunkText);

    // 2. Build Variant Chunks per 15 §9.2:
    // One chunk: product name + sku + attributes (size/color). No price/stock.
    const variantChunks = product.variants.map((v) => {
      const attributesText = formatJsonText(v.attributes);
      const parts = [
        product.name,
        v.sku ? `SKU: ${v.sku}` : null,
        attributesText ? `Attributes: ${attributesText}` : null,
      ].filter(Boolean);

      const chunkText = parts.join(" - ");
      return {
        variantId: v.id,
        chunkText,
        contentHash: sha256(chunkText),
      };
    });

    const totalChunks = 1 + variantChunks.length;
    let updatedCount = 0;
    let skippedCount = 0;

    // Fetch existing embeddings for comparison
    let existingRows: ExistingEmbeddingRow[] = [];
    try {
      existingRows = await this.prisma.$queryRawUnsafe<ExistingEmbeddingRow[]>(
        `SELECT id, source_id, source_type, chunk_index, content_hash
         FROM embeddings
         WHERE business_id = $1::uuid
           AND ((source_type = 'product'::"EmbeddingSource" AND source_id = $2::uuid)
             OR (source_type = 'variant'::"EmbeddingSource" AND source_id = ANY($3::uuid[])))`,
        businessId,
        productId,
        variantChunks.map((v) => v.variantId),
      );
    } catch (err) {
      logger.warn({ err }, "Could not query existing embeddings; proceeding with direct upsert");
    }

    const existingMap = new Map<string, string>();
    for (const row of existingRows) {
      existingMap.set(`${row.source_type}:${row.source_id}:${row.chunk_index}`, row.content_hash);
    }

    // Process Product Chunk
    const existingProductHash = existingMap.get(`product:${productId}:0`);
    if (existingProductHash === productContentHash) {
      skippedCount++;
    } else {
      const vector = await this.generateEmbedding(productChunkText);
      await this.upsertEmbeddingRow({
        businessId,
        sourceType: "product",
        sourceId: productId,
        chunkIndex: 0,
        chunkText: productChunkText,
        contentHash: productContentHash,
        vector,
      });
      updatedCount++;
    }

    // Process Variant Chunks
    const chunksToUpdate = variantChunks.filter((vChunk) => {
      const existingVariantHash = existingMap.get(`variant:${vChunk.variantId}:0`);
      if (existingVariantHash === vChunk.contentHash) {
        skippedCount++;
        return false;
      }
      return true;
    });

    if (chunksToUpdate.length > 0) {
      await Promise.all(
        chunksToUpdate.map(async (vChunk) => {
          const vector = await this.generateEmbedding(vChunk.chunkText);
          await this.upsertEmbeddingRow({
            businessId,
            sourceType: "variant",
            sourceId: vChunk.variantId,
            chunkIndex: 0,
            chunkText: vChunk.chunkText,
            contentHash: vChunk.contentHash,
            vector,
          });
        }),
      );
      updatedCount += chunksToUpdate.length;
    }

    // Cleanup stale variant embeddings if any were removed
    const activeVariantIds = new Set(product.variants.map((v) => v.id));
    const staleVariantIds: string[] = [];
    for (const r of existingRows) {
      if (r.source_type === "variant" && !activeVariantIds.has(r.source_id)) {
        staleVariantIds.push(r.source_id);
      }
    }

    if (staleVariantIds.length > 0) {
      try {
        // react-doctor-disable-next-line raw-sql-injection-risk
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM embeddings
           WHERE business_id = $1::uuid
             AND source_type = 'variant'::"EmbeddingSource"
             AND source_id = ANY($2::uuid[])`,
          businessId,
          staleVariantIds,
        );
      } catch (err) {
        logger.warn({ err }, "Error cleaning up stale variant embeddings");
      }
    }

    return {
      success: true,
      businessId,
      productId,
      action: "synced",
      chunksCount: totalChunks,
      updatedCount,
      skippedCount,
    };
  }

  /**
   * Delete product and variant embeddings for a product (ensures no orphaned variants)
   */
  async deleteProductEmbeddings(businessId: string, productId: string): Promise<void> {
    try {
      // react-doctor-disable-next-line raw-sql-injection-risk
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM embeddings
         WHERE business_id = $1::uuid
           AND (
             source_id = $2::uuid
             OR source_id IN (
               SELECT id FROM product_variants
               WHERE product_id = $2::uuid AND business_id = $1::uuid
             )
           )`,
        businessId,
        productId,
      );
    } catch (err) {
      logger.warn({ err, businessId, productId }, "Error deleting product embeddings");
    }
  }

  /**
   * Upsert single embedding vector row into database using PostgreSQL pgvector
   */
  private async upsertEmbeddingRow(params: {
    businessId: string;
    sourceType: "product" | "variant";
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
        { err, params: { ...params, vector: "[truncated]" } },
        "Error upserting embedding row",
      );
    }
  }

  /**
   * Generate 1536-dimensional vector embedding for text
   * Delegates to knowledge domain EmbeddingService
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingService.generateEmbedding(text);
  }
}
