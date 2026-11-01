import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";

import type { HttpReply } from "../../platform/core/http";

import type {
  ApproveDraftMessageDto,
  AssignConversationDto,
  ConversationNoteDto,
  CreateInternalNoteDto,
  MessageDto,
  PaginatedMessagesResponse,
  SendMessageDto,
} from "@app/shared";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import { ThreadActionsService } from "../threads/thread-actions.service";
import { MessagesService } from "./messages.service";

@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly threadActionsService: ThreadActionsService,
  ) {}

  private getUserId(user?: AuthenticatedUser): string {
    return user?.id ?? user?.sub ?? "";
  }

  /**
   * 13 §6.2 GET /api/v1/conversations/:id/messages
   */
  @Get(["api/v1/conversations/:id/messages", "conversations/:id/messages"])
  @RequirePermission("inbox.read")
  async getMessages(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
    @Query() query: { limit?: number; cursor?: string; after?: string },
  ): Promise<PaginatedMessagesResponse> {
    return this.messagesService.getMessages(businessId, conversationId, query);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/read
   */
  @Post(["api/v1/conversations/:id/read", "conversations/:id/read"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inbox.write")
  async markAsRead(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
  ): Promise<{ success: boolean; staffReadAt: string }> {
    return this.messagesService.markAsRead(businessId, conversationId);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/messages
   */
  @Post(["api/v1/conversations/:id/messages", "conversations/:id/messages"])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inbox.write")
  async sendMessage(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") conversationId: string,
    @Body() body: SendMessageDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<MessageDto> {
    const userId = this.getUserId(user);
    return this.messagesService.sendMessage(
      businessId,
      conversationId,
      userId,
      body,
      idempotencyKey,
    );
  }

  /**
   * Upload an image or PDF the operator can attach to the next outbound message.
   */
  @Post(["api/v1/conversations/:id/attachments", "conversations/:id/attachments"])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inbox.write")
  async uploadAttachment(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
    @Body() body: { filename?: string; contentType?: string; dataBase64?: string },
  ): Promise<{ s3Key: string; contentType: string; sizeBytes: number }> {
    return this.messagesService.uploadAttachment(businessId, conversationId, body);
  }

  /**
   * Authenticated download of a tenant-scoped attachment.
   */
  @Get(["api/v1/attachments/content", "attachments/content"])
  @RequirePermission("inbox.read")
  async readAttachment(
    @CurrentBusinessId() businessId: string,
    @Query("key") key: string,
    @Res() res: HttpReply,
  ): Promise<void> {
    const file = await this.messagesService.readAttachment(businessId, key || "");
    res.header("Content-Type", file.contentType);
    res.header("Cache-Control", "private, max-age=3600");
    res.send(file.buffer);
  }

  /**
   * 13 §6.2 POST /api/v1/messages/:id/approve
   */
  @Post([
    "api/v1/messages/:id/approve",
    "messages/:id/approve",
    "api/v1/conversations/:conversationId/messages/:id/approve",
    "conversations/:conversationId/messages/:id/approve",
  ])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inbox.write")
  async approveMessage(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") messageId: string,
    @Body() body?: ApproveDraftMessageDto,
  ): Promise<MessageDto> {
    const userId = this.getUserId(user);
    return this.threadActionsService.approveMessage(businessId, messageId, userId, body);
  }

  /**
   * 13 §6.2 POST /api/v1/messages/:id/retry
   */
  @Post([
    "api/v1/messages/:id/retry",
    "messages/:id/retry",
    "api/v1/conversations/:conversationId/messages/:id/retry",
    "conversations/:conversationId/messages/:id/retry",
  ])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inbox.write")
  async retryMessage(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") messageId: string,
  ): Promise<MessageDto> {
    const userId = this.getUserId(user);
    return this.threadActionsService.retryMessage(businessId, messageId, userId);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/takeover
   */
  @Post(["api/v1/conversations/:id/takeover", "conversations/:id/takeover"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inbox.write")
  async takeover(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") conversationId: string,
  ): Promise<{ success: boolean; aiEnabled: boolean; status: string }> {
    const userId = this.getUserId(user);
    return this.threadActionsService.takeover(businessId, conversationId, userId);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/resume
   */
  @Post([
    "api/v1/conversations/:id/resume",
    "conversations/:id/resume",
    "api/v1/conversations/:id/resume-ai",
    "conversations/:id/resume-ai",
  ])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inbox.write")
  async resumeAi(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") conversationId: string,
  ): Promise<{ success: boolean; aiEnabled: boolean; status: string }> {
    const userId = this.getUserId(user);
    return this.threadActionsService.resumeAi(businessId, conversationId, userId);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/assign
   */
  @Post(["api/v1/conversations/:id/assign", "conversations/:id/assign"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inbox.write")
  async assign(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") conversationId: string,
    @Body() body: AssignConversationDto,
  ): Promise<{ success: boolean; assignedUserId: string | null }> {
    const userId = this.getUserId(user);
    return this.threadActionsService.assign(businessId, conversationId, userId, body);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/close
   */
  @Post(["api/v1/conversations/:id/close", "conversations/:id/close"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inbox.write")
  async close(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") conversationId: string,
  ): Promise<{ success: boolean; status: string }> {
    const userId = this.getUserId(user);
    return this.threadActionsService.close(businessId, conversationId, userId);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/notes
   */
  @Post(["api/v1/conversations/:id/notes", "conversations/:id/notes"])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inbox.write")
  async createNote(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") conversationId: string,
    @Body() body: CreateInternalNoteDto,
  ): Promise<ConversationNoteDto> {
    const userId = this.getUserId(user);
    return this.threadActionsService.createNote(businessId, conversationId, userId, body);
  }

  /**
   * 13 §6.2 GET /api/v1/conversations/:id/notes
   */
  @Get(["api/v1/conversations/:id/notes", "conversations/:id/notes"])
  @RequirePermission("inbox.read")
  async getNotes(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
  ): Promise<ConversationNoteDto[]> {
    return this.threadActionsService.getNotes(businessId, conversationId);
  }
}
