import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import type {
  FeedbackItemResponse,
  FeedbackMetricsResponse,
  FeedbackQueryDto,
  SubmitFeedbackDto,
} from "../dto/submit-feedback.dto";
import { FeedbackService } from "./feedback.service";

@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * 13 §11 / FR-OBS-006 POST /messages/:id/feedback
   * Submit thumbs up/down rating and structured negative reason on AI message.
   */
  @Post(["api/v1/messages/:id/feedback", "messages/:id/feedback"])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inbox.write")
  async submitFeedback(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") messageId: string,
    @Body() body: SubmitFeedbackDto,
  ): Promise<FeedbackItemResponse> {
    return this.feedbackService.submitFeedback(businessId, user.id, messageId, body);
  }

  /**
   * 13 §11 / T-OBS-02 GET /ai/feedback
   * Aggregate satisfaction metrics, reason breakdown, and feedback logs.
   */
  @Get(["api/v1/ai/feedback", "ai/feedback"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ai.configure")
  async getFeedbackMetrics(
    @CurrentBusinessId() businessId: string,
    @Query() query: FeedbackQueryDto,
  ): Promise<FeedbackMetricsResponse> {
    return this.feedbackService.getFeedbackMetrics(businessId, query);
  }
}
