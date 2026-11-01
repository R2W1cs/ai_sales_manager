import { Controller, Get, Param } from "@nestjs/common";

import type { PlanDto } from "@app/shared";

import { PlansService } from "./plans.service";

@Controller("api/v1/billing/plans")
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * 13 §13 / T-BILL-01: GET /api/v1/billing/plans
   * Lists available subscription tiers (Starter, Growth, Scale) and their quotas.
   */
  @Get()
  async getPlans(): Promise<PlanDto[]> {
    return this.plansService.getPlans();
  }

  /**
   * GET /api/v1/billing/plans/:code
   * Retrieves details and quotas for a specific subscription tier.
   */
  @Get(":code")
  async getPlanByCode(@Param("code") code: string): Promise<PlanDto> {
    return this.plansService.getPlanByCode(code);
  }
}
