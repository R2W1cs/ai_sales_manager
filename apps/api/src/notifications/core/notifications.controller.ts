import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import type { NotificationQueryDto, PaginatedNotificationsResponse } from "@app/shared";

import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import { NotificationsService } from "./notifications.service";

@Controller(["api/v1/notifications", "notifications"])
@UseGuards(TenantGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Resolves the caller's user id from the authenticated user payload.
   * Throws 401 if the token carries no user identity.
   */
  private resolveUserId(user: AuthenticatedUser | undefined): string {
    const userId = user?.id ?? user?.sub;
    if (!userId) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "User ID is required",
        },
      });
    }
    return userId;
  }

  /**
   * 13 §13 GET /api/v1/notifications — 200 OK
   * Paginated feed of notifications for the authenticated user in the current business.
   * Query: unread=true, cursor, limit.
   * Sort: handoff_priority (urgent first), then created_at DESC (FR-NOTIF-003).
   */
  @Get()
  async getNotifications(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: NotificationQueryDto,
  ): Promise<PaginatedNotificationsResponse> {
    const userId = this.resolveUserId(user);
    return this.notificationsService.getFeed(userId, businessId, query);
  }

  /**
   * 13 §13 PATCH /api/v1/notifications/:id/read — 204 No Content
   * Marks a single notification as read for the calling user.
   */
  @Patch(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAsRead(
    @Param("id") id: string,
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<void> {
    const userId = this.resolveUserId(user);
    await this.notificationsService.markRead(id, userId, businessId);
  }

  /**
   * 13 §13 POST /api/v1/notifications/read-all — 204 No Content
   * Marks all unread notifications as read for the calling user in the current business.
   */
  @Post("read-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllAsRead(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<void> {
    const userId = this.resolveUserId(user);
    await this.notificationsService.markAllRead(userId, businessId);
  }
}
