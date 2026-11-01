import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PromptType } from "@prisma/client";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import {
  type AiPromptResponse,
  type CreatePromptDto,
  PromptVersionsService,
} from "./prompt-versions.service";

@Controller("api/v1/ai/prompts")
@UseGuards(TenantGuard, PermissionsGuard)
export class PromptVersionsController {
  constructor(private readonly promptVersionsService: PromptVersionsService) {}

  /**
   * 13 §11 / 15 §18.2 POST /api/v1/ai/prompts
   * Create a new immutable prompt version (N+1) and activate it.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("ai.configure")
  async createPromptVersion(
    @CurrentBusinessId() businessId: string,
    @Body() body: CreatePromptDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<AiPromptResponse> {
    const userId = user?.id ?? user?.sub ?? null;
    return this.promptVersionsService.createPromptVersion(businessId, body, userId);
  }

  /**
   * 13 §11 GET /api/v1/ai/prompts
   * List all prompt versions for the business, optionally filtered by ?type=
   */
  @Get()
  @RequirePermission("ai.configure")
  async listPrompts(
    @CurrentBusinessId() businessId: string,
    @Query("type") type?: PromptType,
  ): Promise<AiPromptResponse[]> {
    return this.promptVersionsService.listPrompts(businessId, type);
  }

  /**
   * 13 §11 GET /api/v1/ai/prompts/active/:type
   * Retrieve the currently active prompt version for a given type.
   */
  @Get("active/:type")
  @RequirePermission("ai.configure")
  async getActivePrompt(
    @CurrentBusinessId() businessId: string,
    @Param("type") type: PromptType,
  ): Promise<AiPromptResponse> {
    const active = await this.promptVersionsService.getActivePrompt(businessId, type);
    if (!active) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `No active ${type} prompt found for this business`,
        },
      });
    }
    return active;
  }

  /**
   * 13 §11 GET /api/v1/ai/prompts/:id
   * Retrieve a specific prompt version by ID.
   */
  @Get(":id")
  @RequirePermission("ai.configure")
  async getPromptById(
    @CurrentBusinessId() businessId: string,
    @Param("id") promptId: string,
  ): Promise<AiPromptResponse> {
    return this.promptVersionsService.getPromptById(businessId, promptId);
  }

  /**
   * 13 §11 POST /api/v1/ai/prompts/:id/activate
   * Rollback or switch to an existing historical prompt version.
   */
  @Post(":id/activate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.configure")
  async activatePromptVersion(
    @CurrentBusinessId() businessId: string,
    @Param("id") promptId: string,
  ): Promise<AiPromptResponse> {
    return this.promptVersionsService.activatePromptVersion(businessId, promptId);
  }
}
