import * as crypto from "crypto";

import {
  Injectable,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { KnowledgeDocument, Prisma, PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import { toValidationException } from "../../platform/core/errors";
import {
  CreateKnowledgeDocumentSchema,
  UpdateKnowledgeDocumentSchema,
  ListKnowledgeDocumentsQuerySchema,
  type CreateKnowledgeDocumentDto,
  type UpdateKnowledgeDocumentDto,
  type ListKnowledgeDocumentsQueryDto,
  type KnowledgeDocumentResponse,
} from "../dto/create-document.dto";

export const KNOWLEDGE_INDEXING_QUEUE = "generate-embeddings";
export const KNOWLEDGE_INDEXING_JOB_NAME = "index_knowledge_document";

export interface KnowledgeIndexingJobData {
  businessId: string;
  documentId: string;
  enqueuedAt: number;
}

@Injectable()
export class DocumentsService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;
  private queue: Queue<KnowledgeIndexingJobData> | null = null;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<KnowledgeIndexingJobData>,
  ) {
    this.prisma = prismaClient ?? prisma;
    this.queue = queue ?? null;
  }

  onModuleInit() {
    if (!this.queue) {
      try {
        this.queue = new Queue<KnowledgeIndexingJobData>(KNOWLEDGE_INDEXING_QUEUE, {
          connection,
        });
      } catch (err) {
        logger.warn({ err }, "Could not initialize BullMQ queue for knowledge document indexing");
      }
    }
  }

  async onModuleDestroy() {
    if (this.queue) {
      try {
        await this.queue.close();
      } catch (err) {
        logger.warn({ err }, "Error closing knowledge indexing queue");
      }
      this.queue = null;
    }
  }

  /**
   * Helper to format a Prisma KnowledgeDocument entity into the standard API response.
   */
  private formatDocument(doc: KnowledgeDocument): KnowledgeDocumentResponse {
    return {
      id: doc.id,
      businessId: doc.business_id,
      title: doc.title,
      sourceType: doc.source_type,
      rawText: doc.raw_text,
      contentHash: doc.content_hash,
      indexingStatus: doc.indexing_status,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }

  /**
   * Trigger BullMQ indexing job for a knowledge document.
   */
  async triggerIndexing(businessId: string, documentId: string): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add(
          KNOWLEDGE_INDEXING_JOB_NAME,
          {
            businessId,
            documentId,
            enqueuedAt: Date.now(),
          },
          {
            jobId: `index-doc_${businessId}_${documentId}_${Date.now()}`,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
          },
        );
      } catch (err) {
        logger.warn({ err, businessId, documentId }, "Failed to queue knowledge indexing job");
      }
    }
  }

  /**
   * 13 §12.3 GET /api/v1/knowledge/documents
   * List store knowledge documents with indexing status for caller's businessId.
   */
  async listDocuments(
    businessId: string,
    query?: ListKnowledgeDocumentsQueryDto,
  ): Promise<KnowledgeDocumentResponse[]> {
    const parsedQuery = query ? ListKnowledgeDocumentsQuerySchema.safeParse(query) : undefined;
    if (parsedQuery && !parsedQuery.success) {
      throw toValidationException(parsedQuery.error);
    }

    const q = parsedQuery?.data;
    const sourceType = q?.sourceType ?? q?.source_type;
    const status = q?.indexingStatus ?? q?.indexing_status ?? q?.status;

    const where: Prisma.KnowledgeDocumentWhereInput = {
      business_id: businessId,
    };

    if (sourceType) {
      where.source_type = sourceType;
    }
    if (status) {
      where.indexing_status = status;
    }
    if (q?.search) {
      where.OR = [
        { title: { contains: q.search, mode: "insensitive" } },
        { raw_text: { contains: q.search, mode: "insensitive" } },
      ];
    }

    const docs = await this.prisma.knowledgeDocument.findMany({
      where,
      orderBy: { created_at: "desc" },
      ...(q?.limit ? { take: q.limit } : {}),
      ...(q?.page && q.limit ? { skip: (q.page - 1) * q.limit } : {}),
    });

    return docs.map((doc) => this.formatDocument(doc));
  }

  /**
   * 13 §12.3 GET /api/v1/knowledge/documents/:id
   * Get single store knowledge document for caller's businessId.
   */
  async getDocumentById(businessId: string, id: string): Promise<KnowledgeDocumentResponse> {
    const doc = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id,
        business_id: businessId,
      },
    });

    if (!doc) {
      throw new NotFoundException(`Knowledge document '${id}' not found`);
    }

    return this.formatDocument(doc);
  }

  /**
   * 13 §12.3 POST /api/v1/knowledge/documents
   * Creates a new document with status = 'pending' and enqueues indexing.
   */
  async createDocument(
    businessId: string,
    input: CreateKnowledgeDocumentDto,
  ): Promise<KnowledgeDocumentResponse> {
    const parsed = CreateKnowledgeDocumentSchema.safeParse(input);
    if (!parsed.success) {
      throw toValidationException(parsed.error);
    }

    const data = parsed.data;
    const rawText = data.content ?? data.rawText ?? data.raw_text ?? "";
    const sourceType = data.category ?? data.sourceType ?? data.source_type ?? "manual";
    const contentHash = crypto.createHash("sha256").update(rawText).digest("hex");

    const created = await this.prisma.knowledgeDocument.create({
      data: {
        business_id: businessId,
        title: data.title,
        source_type: sourceType,
        raw_text: rawText,
        content_hash: contentHash,
        indexing_status: "pending",
      },
    });

    await this.triggerIndexing(businessId, created.id);

    return this.formatDocument(created);
  }

  /**
   * 13 §12.3 PATCH /api/v1/knowledge/documents/:id
   * Updates an existing document and enqueues reindexing if content changed.
   */
  async updateDocument(
    businessId: string,
    id: string,
    input: UpdateKnowledgeDocumentDto,
  ): Promise<KnowledgeDocumentResponse> {
    const parsed = UpdateKnowledgeDocumentSchema.safeParse(input);
    if (!parsed.success) {
      throw toValidationException(parsed.error);
    }

    const existing = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Knowledge document '${id}' not found`);
    }

    const data = parsed.data;
    const newRawText = data.content ?? data.rawText ?? data.raw_text;
    const newSourceType = data.category ?? data.sourceType ?? data.source_type;

    const shouldReindex = Boolean(newRawText && newRawText !== existing.raw_text);
    const contentHash = newRawText
      ? crypto.createHash("sha256").update(newRawText).digest("hex")
      : existing.content_hash;

    const updated = await this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(newRawText ? { raw_text: newRawText } : {}),
        ...(newSourceType ? { source_type: newSourceType } : {}),
        ...(shouldReindex ? { content_hash: contentHash, indexing_status: "pending" } : {}),
      },
    });

    if (shouldReindex) {
      await this.triggerIndexing(businessId, updated.id);
    }

    return this.formatDocument(updated);
  }

  /**
   * 13 §12.3 DELETE /api/v1/knowledge/documents/:id
   * Removes document and cascades deletion to associated vector rows in embeddings table.
   */
  async deleteDocument(businessId: string, id: string): Promise<void> {
    const existing = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Knowledge document '${id}' not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      // 🛡️ Cascade Deletion: Remove related embeddings
      await tx.embedding.deleteMany({
        where: {
          business_id: businessId,
          source_type: "knowledge_document",
          source_id: id,
        },
      });

      // Remove document
      await tx.knowledgeDocument.delete({
        where: { id },
      });
    });
  }

  /**
   * POST /api/v1/knowledge/documents/:id/reindex
   * Triggers re-chunking and re-embedding for the document.
   */
  async reindexDocument(businessId: string, id: string): Promise<KnowledgeDocumentResponse> {
    const existing = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Knowledge document '${id}' not found`);
    }

    const updated = await this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        indexing_status: "pending",
      },
    });

    await this.triggerIndexing(businessId, updated.id);

    return this.formatDocument(updated);
  }
}
