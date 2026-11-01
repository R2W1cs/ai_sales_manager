import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import type { PipelineQueryDto, PipelineResponseDto } from "@app/shared";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import { PipelineService } from "./pipeline.service";

@Controller(["api/v1/pipeline", "pipeline"])
@UseGuards(TenantGuard, PermissionsGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  /**
   * 13 §7 GET /api/v1/pipeline (FR-CONV-050–053)
   * 4-column read-only commercial sales pipeline Kanban aggregation projected
   * dynamically from conversation and order states.
   */
  @Get()
  @RequirePermission("inbox.read")
  async getPipeline(
    @CurrentBusinessId() businessId: string,
    @Query() query: PipelineQueryDto,
  ): Promise<PipelineResponseDto> {
    return this.pipelineService.getPipeline(businessId, query);
  }
}
