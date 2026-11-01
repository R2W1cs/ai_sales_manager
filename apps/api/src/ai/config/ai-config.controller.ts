import {
  Body,
  Controller,
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
import type { AiAgentResponse, UpdateAiAgentDto } from "../dto/update-ai-agent.dto";
import type { AiSettingsResponse, UpdateAiSettingsDto } from "../dto/update-ai-settings.dto";
import { AiConfigService } from "./ai-config.service";

@Controller("api/v1/ai")
@UseGuards(TenantGuard, PermissionsGuard)
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  /**
   * 13 §11 GET /api/v1/ai/agents
   * List agents for tenant (array of one).
   */
  @Get("agents")
  @RequirePermission("ai.configure")
  async listAgents(@CurrentBusinessId() businessId: string): Promise<AiAgentResponse[]> {
    return this.aiConfigService.listAgents(businessId);
  }

  /**
   * 13 §11 GET /api/v1/ai/agents/:id
   * Retrieve AI agent configuration.
   */
  @Get("agents/:id")
  @RequirePermission("ai.configure")
  async getAgent(
    @CurrentBusinessId() businessId: string,
    @Param("id") agentId: string,
  ): Promise<AiAgentResponse> {
    return this.aiConfigService.getAgent(businessId, agentId);
  }

  /**
   * 13 §11 PATCH /api/v1/ai/agents/:id
   * Update AI agent attributes (personality, tone, language, confidence threshold, etc.)
   */
  @Patch("agents/:id")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.configure")
  async updateAgent(
    @CurrentBusinessId() businessId: string,
    @Param("id") agentId: string,
    @Body() body: UpdateAiAgentDto,
  ): Promise<AiAgentResponse> {
    return this.aiConfigService.updateAgent(businessId, agentId, body);
  }

  /**
   * 13 §11 GET /api/v1/ai/settings
   * Retrieve tenant AI settings (reply_mode, confidence_threshold, models, etc.)
   */
  @Get("settings")
  @RequirePermission("ai.configure")
  async getSettings(@CurrentBusinessId() businessId: string): Promise<AiSettingsResponse> {
    return this.aiConfigService.getSettings(businessId);
  }

  /**
   * 13 §11 PATCH /api/v1/ai/settings
   * Update AI reply mode, model IDs, thresholds, budget.
   */
  @Patch("settings")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.configure")
  async updateSettings(
    @CurrentBusinessId() businessId: string,
    @Body() body: UpdateAiSettingsDto,
  ): Promise<AiSettingsResponse> {
    return this.aiConfigService.updateSettings(businessId, body);
  }
}
