import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type {
  CreateKnowledgeDocumentDto,
  KnowledgeDocumentResponse,
  ListKnowledgeDocumentsQueryDto,
  UpdateKnowledgeDocumentDto,
} from "../dto/create-document.dto";
import { DocumentsService } from "./documents.service";

@Controller(["api/v1/knowledge/documents", "knowledge/documents"])
@UseGuards(TenantGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * 13 §12.3 GET /api/v1/knowledge/documents
   * List store knowledge documents with indexing status for caller's businessId.
   */
  @Get()
  @RequirePermission("knowledge.write")
  async listDocuments(
    @CurrentBusinessId() businessId: string,
    @Query() query?: ListKnowledgeDocumentsQueryDto,
  ): Promise<KnowledgeDocumentResponse[]> {
    return this.documentsService.listDocuments(businessId, query);
  }

  /**
   * 13 §12.3 GET /api/v1/knowledge/documents/:id
   * Get single store knowledge document.
   */
  @Get(":id")
  @RequirePermission("knowledge.write")
  async getDocument(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<KnowledgeDocumentResponse> {
    return this.documentsService.getDocumentById(businessId, id);
  }

  /**
   * 13 §12.3 POST /api/v1/knowledge/documents
   * Creates a new document with status = 'pending' and enqueues indexing.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("knowledge.write")
  async createDocument(
    @CurrentBusinessId() businessId: string,
    @Body() body: CreateKnowledgeDocumentDto,
  ): Promise<KnowledgeDocumentResponse> {
    return this.documentsService.createDocument(businessId, body);
  }

  /**
   * 13 §12.3 PATCH /api/v1/knowledge/documents/:id
   * Updates an existing document and enqueues reindexing if content changed.
   */
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("knowledge.write")
  async updateDocument(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
    @Body() body: UpdateKnowledgeDocumentDto,
  ): Promise<KnowledgeDocumentResponse> {
    return this.documentsService.updateDocument(businessId, id, body);
  }

  /**
   * 13 §12.3 DELETE /api/v1/knowledge/documents/:id
   * Removes document and deletes associated embeddings (204 No Content).
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("knowledge.write")
  async deleteDocument(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<void> {
    return this.documentsService.deleteDocument(businessId, id);
  }

  /**
   * POST /api/v1/knowledge/documents/:id/reindex
   * Triggers re-chunking and re-embedding (202 Accepted).
   */
  @Post(":id/reindex")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission("knowledge.write")
  async reindexDocument(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<KnowledgeDocumentResponse> {
    return this.documentsService.reindexDocument(businessId, id);
  }
}
