import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import { FlagsService, type FeatureFlagsResponse } from "./flags.service";

@Controller("api/v1")
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  /**
   * 13 §13 GET /api/v1/businesses/:id/flags
   * Returns resolved feature flags for the tenant.
   */
  @Get("businesses/:id/flags")
  @UseGuards(TenantGuard, PermissionsGuard)
  async getFeatureFlagsByBusinessId(
    @CurrentBusinessId() businessId: string,
    @Param("id") paramId: string,
  ): Promise<FeatureFlagsResponse> {
    if (businessId !== paramId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    return this.flagsService.getFeatureFlags(businessId);
  }

  /**
   * 13 §13 GET /api/v1/feature-flags
   * Returns resolved feature flags for the current resolved tenant.
   */
  @Get("feature-flags")
  @UseGuards(TenantGuard, PermissionsGuard)
  async getFeatureFlags(@CurrentBusinessId() businessId: string): Promise<FeatureFlagsResponse> {
    return this.flagsService.getFeatureFlags(businessId);
  }

  /**
   * 13 §13 PATCH /api/v1/businesses/:id/flags
   * Updates/toggles a specific feature flag for the tenant.
   * Body: { key: string, enabled: boolean }
   */
  @Patch("businesses/:id/flags")
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("flags.write")
  async updateFeatureFlag(
    @CurrentBusinessId() businessId: string,
    @Param("id") paramId: string,
    @Body() body: unknown,
  ): Promise<FeatureFlagsResponse> {
    if (businessId !== paramId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    return this.flagsService.updateFeatureFlag(businessId, body);
  }

  /**
   * 13 §13 PATCH /api/v1/feature-flags/:feature
   * Updates/toggles a specific feature flag by path param.
   * Body: { enabled: boolean }
   */
  @Patch("feature-flags/:feature")
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("flags.write")
  async updateFeatureFlagByPath(
    @CurrentBusinessId() businessId: string,
    @Param("feature") feature: string,
    @Body() body: { enabled?: boolean },
  ): Promise<FeatureFlagsResponse> {
    return this.flagsService.updateFeatureFlag(businessId, feature, body.enabled);
  }
}
