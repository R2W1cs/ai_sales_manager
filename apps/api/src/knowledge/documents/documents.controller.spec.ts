import { NotFoundException, BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

interface MockPrisma {
  knowledgeDocument: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  embedding: {
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

interface MockQueue {
  add: jest.Mock;
  close: jest.Mock;
}

describe("Knowledge documents management & indexing trigger (`/knowledge/documents`) (T-KNOW-02)", () => {
  const businessId = "11111111-1111-1111-1111-111111111111";
  const otherBusinessId = "22222222-2222-2222-2222-222222222222";
  const docId = "33333333-3333-3333-3333-333333333333";

  let mockPrisma: MockPrisma;
  let mockQueue: MockQueue;
  let service: DocumentsService;
  let controller: DocumentsController;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-1" }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      knowledgeDocument: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      embedding: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: MockPrisma) => Promise<unknown>) => cb(mockPrisma)),
    };

    service = new DocumentsService(mockPrisma as unknown as PrismaClient, mockQueue as any);
    controller = new DocumentsController(service);
  });

  describe("Document Create", () => {
    it("Document Create: Creates document with `status = 'PENDING'` and queues indexing.", async () => {
      const mockCreated = {
        id: docId,
        business_id: businessId,
        title: "Store Return Policy",
        source_type: "faq",
        raw_text: "Items can be returned within 30 days.",
        content_hash: "mockhash123",
        indexing_status: "pending",
        created_at: new Date("2026-08-20T00:00:00Z"),
        updated_at: new Date("2026-08-20T00:00:00Z"),
      };

      mockPrisma.knowledgeDocument.create.mockResolvedValue(mockCreated);

      const result = await controller.createDocument(businessId, {
        title: "Store Return Policy",
        content: "Items can be returned within 30 days.",
        category: "faq",
      });

      expect(mockPrisma.knowledgeDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: businessId,
          title: "Store Return Policy",
          source_type: "faq",
          raw_text: "Items can be returned within 30 days.",
          indexing_status: "pending",
        }),
      });

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        "index_knowledge_document",
        expect.objectContaining({
          businessId,
          documentId: docId,
        }),
        expect.any(Object),
      );

      expect(result).toEqual({
        id: docId,
        businessId,
        title: "Store Return Policy",
        sourceType: "faq",
        rawText: "Items can be returned within 30 days.",
        contentHash: "mockhash123",
        indexingStatus: "pending",
        createdAt: mockCreated.created_at,
        updatedAt: mockCreated.updated_at,
      });
    });

    it("rejects invalid document creation without title or content", async () => {
      await expect(
        controller.createDocument(businessId, {
          title: "",
          content: "",
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.knowledgeDocument.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("Cascade Clean & Tenancy Scope", () => {
    it("Cascade Clean: Deleting document deletes related vector embeddings.", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: docId,
        business_id: businessId,
      });
      mockPrisma.embedding.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.knowledgeDocument.delete.mockResolvedValue({ id: docId });

      await controller.deleteDocument(businessId, docId);

      expect(mockPrisma.knowledgeDocument.findFirst).toHaveBeenCalledWith({
        where: {
          id: docId,
          business_id: businessId,
        },
      });

      expect(mockPrisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: {
          business_id: businessId,
          source_type: "knowledge_document",
          source_id: docId,
        },
      });

      expect(mockPrisma.knowledgeDocument.delete).toHaveBeenCalledWith({
        where: { id: docId },
      });
    });

    it("Throws NotFoundException when trying to delete another tenant's document", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue(null);

      await expect(controller.deleteDocument(otherBusinessId, docId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.embedding.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.knowledgeDocument.delete).not.toHaveBeenCalled();
    });
  });

  describe("Document Listing & Retrieval", () => {
    it("lists documents filtered by caller tenant businessId", async () => {
      const mockDocs = [
        {
          id: docId,
          business_id: businessId,
          title: "FAQ",
          source_type: "manual",
          raw_text: "FAQ content",
          content_hash: "hash1",
          indexing_status: "ready",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      mockPrisma.knowledgeDocument.findMany.mockResolvedValue(mockDocs);

      const result = await controller.listDocuments(businessId, { status: "ready" });

      expect(mockPrisma.knowledgeDocument.findMany).toHaveBeenCalledWith({
        where: {
          business_id: businessId,
          indexing_status: "ready",
        },
        orderBy: { created_at: "desc" },
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.businessId).toBe(businessId);
      expect(result[0]?.indexingStatus).toBe("ready");
    });

    it("retrieves a single document by ID scoped to tenant", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: docId,
        business_id: businessId,
        title: "Terms",
        source_type: "manual",
        raw_text: "Terms content",
        content_hash: "hash2",
        indexing_status: "ready",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await controller.getDocument(businessId, docId);
      expect(result.id).toBe(docId);
      expect(result.businessId).toBe(businessId);
    });

    it("throws NotFoundException when document does not exist for tenant", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue(null);

      await expect(controller.getDocument(businessId, "nonexistent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("Document Update & Reindexing", () => {
    it("updates document content, updates hash, resets status to pending, and queues indexing", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: docId,
        business_id: businessId,
        title: "Old Title",
        source_type: "manual",
        raw_text: "Old text",
        content_hash: "oldhash",
        indexing_status: "ready",
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockPrisma.knowledgeDocument.update.mockResolvedValue({
        id: docId,
        business_id: businessId,
        title: "New Title",
        source_type: "manual",
        raw_text: "Updated text",
        content_hash: "newhash",
        indexing_status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await controller.updateDocument(businessId, docId, {
        title: "New Title",
        content: "Updated text",
      });

      expect(mockPrisma.knowledgeDocument.update).toHaveBeenCalledWith({
        where: { id: docId },
        data: expect.objectContaining({
          title: "New Title",
          raw_text: "Updated text",
          indexing_status: "pending",
        }),
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        "index_knowledge_document",
        expect.objectContaining({
          businessId,
          documentId: docId,
        }),
        expect.any(Object),
      );

      expect(result.indexingStatus).toBe("pending");
    });

    it("triggers reindexing via POST /:id/reindex", async () => {
      mockPrisma.knowledgeDocument.findFirst.mockResolvedValue({
        id: docId,
        business_id: businessId,
        title: "Doc",
        source_type: "manual",
        raw_text: "Doc content",
        content_hash: "hash",
        indexing_status: "ready",
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockPrisma.knowledgeDocument.update.mockResolvedValue({
        id: docId,
        business_id: businessId,
        title: "Doc",
        source_type: "manual",
        raw_text: "Doc content",
        content_hash: "hash",
        indexing_status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await controller.reindexDocument(businessId, docId);

      expect(mockPrisma.knowledgeDocument.update).toHaveBeenCalledWith({
        where: { id: docId },
        data: { indexing_status: "pending" },
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        "index_knowledge_document",
        expect.objectContaining({
          businessId,
          documentId: docId,
        }),
        expect.any(Object),
      );

      expect(result.indexingStatus).toBe("pending");
    });
  });

  describe("RBAC Permissions Guardrails", () => {
    it("ensures controller endpoints are protected with @RequirePermission('knowledge.write')", () => {
      const proto = DocumentsController.prototype;
      const handlers = [
        "listDocuments",
        "getDocument",
        "createDocument",
        "updateDocument",
        "deleteDocument",
        "reindexDocument",
      ] as const;

      for (const method of handlers) {
        const handler = Reflect.get(proto, method) as object;
        const perms = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined;
        expect(perms).toContain("knowledge.write");
      }
    });
  });
});
