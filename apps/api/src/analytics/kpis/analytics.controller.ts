import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type {
  AnalyticsOverviewQueryDto,
  AnalyticsOverviewResponse,
} from "../dto/analytics-overview.dto";
import { AnalyticsService } from "./analytics.service";

@Controller("api/v1/analytics")
@UseGuards(TenantGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analyticsService: AnalyticsService) {}

  /**
   * 13 §13 / T-ANL-02 GET /api/v1/analytics/overview
   * Returns merchant analytics overview KPI metrics, AI/human message breakdown,
   * trend deltas, and gapless daily timeseries.
   * Guarded by analytics.read permission.
   */
  @Get("overview")
  @RequirePermission("analytics.read")
  async getOverview(
    @CurrentBusinessId() businessId: string,
    @Query() query: AnalyticsOverviewQueryDto = {},
  ): Promise<AnalyticsOverviewResponse> {
    return this.analyticsService.getOverview(businessId, query);
  }
}
