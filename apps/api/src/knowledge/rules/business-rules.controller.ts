import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type {
  BusinessRuleResponse,
  CreateBusinessRuleDto,
  ListBusinessRulesQueryDto,
  UpdateBusinessRuleDto,
} from "../dto/create-business-rule.dto";
import { BusinessRulesService } from "./business-rules.service";

@Controller(["api/v1/business-rules", "business-rules"])
@UseGuards(TenantGuard, PermissionsGuard)
export class BusinessRulesController {
  constructor(private readonly businessRulesService: BusinessRulesService) {}

  /**
   * 13 §12.4 GET /api/v1/business-rules
   * Default: active rules grouped by ruleType (card §3 contract).
   * Pass ?flat=true for a flat array, ?history=true to include all versions (always flat).
   */
  @Get()
  @RequirePermission("ai.configure")
  async listRules(
    @CurrentBusinessId() businessId: string,
    @Query() query?: ListBusinessRulesQueryDto,
  ): Promise<Record<string, BusinessRuleResponse> | BusinessRuleResponse[]> {
    return this.businessRulesService.listRules(businessId, query);
  }

  /**
   * 13 §12.4 POST /api/v1/business-rules
   * Creates a new immutable rule version. Closes prior active versions at NOW().
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("ai.configure")
  async createRule(
    @CurrentBusinessId() businessId: string,
    @Body() body: CreateBusinessRuleDto,
  ): Promise<BusinessRuleResponse> {
    return this.businessRulesService.createRuleVersion(businessId, body);
  }

  /**
   * 13 §12.4 PATCH /api/v1/business-rules/:id
   * Modifies `enabled` or `effective_to` only. Never mutates payload in-place.
   */
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.configure")
  async updateRule(
    @CurrentBusinessId() businessId: string,
    @Param("id") ruleId: string,
    @Body() body: UpdateBusinessRuleDto,
  ): Promise<BusinessRuleResponse> {
    return this.businessRulesService.updateRule(businessId, ruleId, body);
  }
}
