import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import { SuggestService, type SuggestDraftResponse } from "./suggest.service";

@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class SuggestController {
  constructor(private readonly suggestService: SuggestService) {}

  /**
   * 13 §6.2 / 15 §3 POST /api/v1/conversations/:id/suggest & POST /conversations/:id/suggest
   * On-demand AI draft suggestion API (FR-AI-016–020a).
   * Triggers background suggestion pipeline and returns 202 Accepted.
   */
  @Post(["api/v1/conversations/:id/suggest", "conversations/:id/suggest"])
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission("inbox.write")
  async suggest(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
  ): Promise<SuggestDraftResponse> {
    return this.suggestService.requestSuggestion(businessId, conversationId);
  }
}
