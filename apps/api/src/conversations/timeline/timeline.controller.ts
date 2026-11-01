import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import type { TimelineItem } from "@app/shared";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import { TimelineService } from "./timeline.service";

@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  /**
   * 13 §6.2 GET /api/v1/conversations/:id/timeline (FR-CONV-040)
   * Merged chronological projection stream of conversation activity.
   */
  @Get(["api/v1/conversations/:id/timeline", "conversations/:id/timeline"])
  @RequirePermission("inbox.read")
  async getTimeline(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
  ): Promise<TimelineItem[]> {
    return this.timelineService.getTimeline(businessId, conversationId);
  }
}
