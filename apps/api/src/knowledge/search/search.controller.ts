import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import { VectorSearchService, type VectorSearchResult } from "./vector-search.service";

@Controller(["api/v1/knowledge/search", "knowledge/search"])
@UseGuards(TenantGuard, PermissionsGuard)
export class SearchController {
  constructor(private readonly vectorSearchService: VectorSearchService) {}

  /**
   * 13 §12.3 GET /api/v1/knowledge/search?q=...
   * Semantic vector search across store knowledge documents, products, and variants.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission("knowledge.write")
  async search(
    @CurrentBusinessId() businessId: string,
    @Query("q") query?: string,
    @Query("topK") topK?: string,
    @Query("minScore") minScore?: string,
  ): Promise<VectorSearchResult[]> {
    if (!query?.trim()) {
      return [];
    }

    const parsedTopK = topK ? parseInt(topK, 10) : 5;
    const parsedMinScore = minScore ? parseFloat(minScore) : 0.15;

    return this.vectorSearchService.similaritySearch(businessId, query.trim(), {
      topK: Number.isFinite(parsedTopK) ? parsedTopK : 5,
      minScore: Number.isFinite(parsedMinScore) ? parsedMinScore : 0.15,
    });
  }
}
