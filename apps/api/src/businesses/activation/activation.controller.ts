import { Body, Controller, HttpCode, HttpStatus, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { toValidationException } from "../../platform/core/errors";
import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import { ActivationService, type LiveActivationResponse } from "./activation.service";

export const SetLiveActivationSchema = z.strictObject({
  enabled: z.boolean(),
});

export type SetLiveActivationDto = z.infer<typeof SetLiveActivationSchema>;

@Controller(["api/v1/integrations", "integrations"])
export class ActivationController {
  constructor(private readonly activationService: ActivationService) {}

  /**
   * 13 §10.1 PATCH /api/v1/integrations/live (or /integrations/live)
   * Enables or disables live AI responses. Enforces G1–G5 gates before activation.
   * Rejects incomplete setup with 422 activation_not_ready + unmet_gates.
   */
  @Patch("live")
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("ai.configure")
  async setLiveActivation(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: unknown,
  ): Promise<LiveActivationResponse> {
    const parseResult = SetLiveActivationSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error, "Invalid activation payload");
    }

    const userId = user?.id ?? user?.sub;
    return this.activationService.setLiveActivation(businessId, parseResult.data.enabled, userId);
  }
}
