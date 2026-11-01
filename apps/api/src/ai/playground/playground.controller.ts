import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type {
  PlaygroundSimulateDto,
  PlaygroundSimulateResponse,
} from "../dto/playground-simulate.dto";
import { PlaygroundService } from "./playground.service";

@Controller(["api/v1/ai", "ai"])
@UseGuards(TenantGuard, PermissionsGuard)
export class PlaygroundController {
  constructor(private readonly playgroundService: PlaygroundService) {}

  /**
   * 13 §11 / 15 §3 POST /api/v1/ai/playground & POST /ai/playground
   * Executes AI simulation turn in safe test sandbox.
   */
  @Post("playground")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.playground")
  async simulate(
    @CurrentBusinessId() businessId: string,
    @Body() body: PlaygroundSimulateDto,
    @Headers("idempotency-key") headerIdempotencyKey?: string,
  ): Promise<PlaygroundSimulateResponse> {
    const payload: PlaygroundSimulateDto = {
      ...body,
      idempotencyKey: body.idempotencyKey || headerIdempotencyKey || undefined,
    };
    return this.playgroundService.simulate(businessId, payload);
  }

  /**
   * 13 §11 GET /api/v1/ai/playground/conversations & GET /ai/playground/conversations
   * Retrieves test threads for the playground.
   */
  @Get("playground/conversations")
  @RequirePermission("ai.playground")
  async listConversations(@CurrentBusinessId() businessId: string) {
    return this.playgroundService.listPlaygroundConversations(businessId);
  }

  /**
   * DELETE /api/v1/ai/playground/conversations
   * Prunes old playground test conversations.
   */
  @Delete("playground/conversations")
  @RequirePermission("ai.playground")
  async pruneConversations(
    @CurrentBusinessId() businessId: string,
    @Query("maxAgeDays") maxAgeDays?: string,
  ) {
    let days = 7;
    if (maxAgeDays !== undefined && maxAgeDays !== "") {
      const trimmed = maxAgeDays.trim();
      if (!/^\d+$/.test(trimmed)) {
        throw new BadRequestException({
          error: {
            code: "validation_error",
            message: "maxAgeDays must be a positive integer between 1 and 365",
          },
        });
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (parsed < 1 || parsed > 365) {
        throw new BadRequestException({
          error: {
            code: "validation_error",
            message: "maxAgeDays must be a positive integer between 1 and 365",
          },
        });
      }
      days = parsed;
    }

    return this.playgroundService.prunePlaygroundConversations(businessId, days);
  }
}
