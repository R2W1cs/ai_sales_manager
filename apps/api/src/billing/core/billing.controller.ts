import { Controller, Get, UseGuards } from "@nestjs/common";

import type { BillingUsageResponse } from "@app/shared";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import { QuotaService } from "../quota/quota.service";

@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly quotaService: QuotaService) {}

  /**
   * 13 §13 / T-BILL-03: GET /api/v1/billing/usage (also /billing/usage, /api/v1/usage, /usage)
   * Permission: @RequirePermission('usage.read') — Owner only.
   * Returns current billing cycle usage percentage and quota limits.
   */
  @Get(["api/v1/billing/usage", "billing/usage", "api/v1/usage", "usage"])
  @RequirePermission("usage.read")
  async getUsage(@CurrentBusinessId() businessId: string): Promise<BillingUsageResponse> {
    return this.quotaService.getUsage(businessId);
  }
}
