import { Controller, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import {
  type AiActionResponseItem,
  type DetailedTraceResponse,
  type ListActionsResponse,
  ObservabilityService,
} from "./observability.service";

/**
 * Raw query shape as it arrives on the wire. Every field stays a string here;
 * `ObservabilityService.listActions` is the single validation boundary
 * (`ListActionsQuerySchema`) and converts/rejects them there.
 */
export class ListActionsQueryDto {
  conversationId?: string;
  messageId?: string;
  toolName?: string;
  actionType?: string;
  limit?: string;
  cursor?: string;
}

@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  /**
   * 13 §11 / T-OBS-01 GET /ai/traces/:messageId
   * Retrieve detailed AI decision trace and reasoning for an inbound/outbound message.
   */
  @Get(["api/v1/ai/traces/:messageId", "ai/traces/:messageId"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.configure")
  async getTrace(
    @CurrentBusinessId() businessId: string,
    @Param("messageId") messageId: string,
  ): Promise<DetailedTraceResponse> {
    return this.observabilityService.getTraceByMessageId(businessId, messageId);
  }

  /**
   * 13 §11 / 15 §3 GET /conversations/:id/decision-traces
   * Retrieve decision trace history for a conversation.
   */
  @Get([
    "api/v1/conversations/:id/decision-traces",
    "conversations/:id/decision-traces",
    "api/v1/ai/conversations/:id/traces",
    "ai/conversations/:id/traces",
  ])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.traces.read")
  async getConversationTraces(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
  ): Promise<DetailedTraceResponse[]> {
    return this.observabilityService.getConversationTraces(businessId, conversationId);
  }

  /**
   * 13 §11 GET /api/v1/ai/actions
   * Debug tool log for AI operations.
   */
  @Get(["api/v1/ai/actions", "ai/actions"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.traces.read")
  async listActions(
    @CurrentBusinessId() businessId: string,
    @Query() query: ListActionsQueryDto,
  ): Promise<ListActionsResponse> {
    return this.observabilityService.listActions(businessId, query);
  }

  /**
   * 13 §11 GET /api/v1/ai/actions/:id
   * Get single tool/AI action record.
   */
  @Get(["api/v1/ai/actions/:id", "ai/actions/:id"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.traces.read")
  async getAction(
    @CurrentBusinessId() businessId: string,
    @Param("id") actionId: string,
  ): Promise<AiActionResponseItem> {
    return this.observabilityService.getActionById(businessId, actionId);
  }
}
