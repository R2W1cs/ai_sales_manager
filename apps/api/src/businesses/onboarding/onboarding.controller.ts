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
import type { OnboardingStateResponse } from "../dto/update-onboarding.dto";
import { OnboardingService } from "./onboarding.service";

@Controller("api/v1/businesses")
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * 13 §5 GET /api/v1/businesses/:id/onboarding
   * Returns current onboarding step tracking, completed steps, and live computed readiness gates G1–G5.
   * Guarded by Member role (tenant member).
   */
  @Get(":id/onboarding")
  @UseGuards(TenantGuard, PermissionsGuard)
  async getOnboardingState(
    @CurrentBusinessId() businessId: string,
    @Param("id") paramId: string,
  ): Promise<OnboardingStateResponse> {
    if (businessId !== paramId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    return this.onboardingService.getOnboardingState(businessId);
  }

  /**
   * 13 §5 PATCH /api/v1/businesses/:id/onboarding
   * Records G5 handoff acknowledgement or updates step navigation.
   * Rejects client attempts to set aiActivated: true or modify server-computed gates.
   * Guarded by business.write permission.
   */
  @Patch(":id/onboarding")
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("business.write")
  async updateOnboardingState(
    @CurrentBusinessId() businessId: string,
    @Param("id") paramId: string,
    @Body() body: unknown,
  ): Promise<OnboardingStateResponse> {
    if (businessId !== paramId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    return this.onboardingService.updateOnboardingState(businessId, body);
  }
}
