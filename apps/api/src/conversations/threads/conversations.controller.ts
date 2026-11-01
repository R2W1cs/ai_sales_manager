import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import type { ListConversationsQueryDto, PaginatedConversationsResponse } from "@app/shared";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import { ConversationsService } from "./conversations.service";

@Controller(["api/v1/conversations", "conversations"])
@UseGuards(TenantGuard, PermissionsGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  /**
   * 13 §6.1 GET /api/v1/conversations
   */
  @Get()
  @RequirePermission("inbox.read")
  async listConversations(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: ListConversationsQueryDto,
  ): Promise<PaginatedConversationsResponse> {
    return this.conversationsService.listConversations(businessId, user?.id ?? user?.sub, query);
  }
}
