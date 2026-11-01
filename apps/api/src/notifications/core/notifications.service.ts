import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { HandoffPriority, Notification, Prisma, PrismaClient } from "@prisma/client";

import type {
  NotificationItemDto,
  NotificationQueryDto,
  PaginatedNotificationsResponse,
} from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";

/** Internal cursor shape used for keyset-style pagination. */
interface DecodedCursor {
  /** ISO-8601 timestamp of the cursor notification's `created_at`. */
  createdAt: string;
  id: string;
  priority?: HandoffPriority | null;
  rank?: number;
}

const getPriorityRank = (priority: HandoffPriority | null | undefined): number => {
  switch (priority) {
    case "critical":
      return 1;
    case "high":
      return 2;
    case "normal":
      return 3;
    default:
      return 4;
  }
};

@Injectable()
export class NotificationsService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Maps raw Prisma notification to camelCase DTO.
   * Field names follow the camelCase rule (docs/10_engineering/13_API_DESIGN §3).
   */
  public mapToDto(notification: Notification): NotificationItemDto {
    return {
      id: notification.id,
      businessId: notification.business_id,
      userId: notification.user_id,
      type: notification.type,
      handoffPriority: notification.handoff_priority,
      title: notification.title,
      message: notification.message,
      entityType: notification.entity_type,
      entityId: notification.entity_id,
      dedupeKey: notification.dedupe_key,
      readAt: notification.read_at ? notification.read_at.toISOString() : null,
      createdAt: notification.created_at.toISOString(),
    };
  }

  /**
   * 13 §13 GET /api/v1/notifications
   * Paginated in-app notification feed sorted by handoff_priority then recency (FR-NOTIF-003).
   * Tenancy and user isolation strictly enforced.
   */
  public async getFeed(
    userId: string,
    businessId: string,
    query: NotificationQueryDto = {},
  ): Promise<PaginatedNotificationsResponse> {
    const rawLimit = typeof query.limit === "number" ? query.limit : 50;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    // Zod preprocess in NotificationQuerySchema already normalises 'unread' to boolean.
    const isUnreadFilter = query.unread === true;

    // 1. Where filter with strict user and tenancy isolation
    const where: Prisma.NotificationWhereInput = {
      business_id: businessId,
      user_id: userId,
    };

    if (isUnreadFilter) {
      where.read_at = null;
    }

    // 2 & 3. Fetch unread count and matching notifications concurrently
    const [unreadCount, notifications] = await Promise.all([
      this.prisma.notification.count({
        where: {
          business_id: businessId,
          user_id: userId,
          read_at: null,
        },
      }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      }),
    ]);

    // 4. Apply secondary in-process sort by handoff_priority rank (FR-NOTIF-003)
    // Priority is not a DB enum sortable in a single ORDER BY expression without a computed column,
    // so we sort at the application layer after fetching with the recency index.
    notifications.sort((a, b) => {
      const rankA = getPriorityRank(a.handoff_priority);
      const rankB = getPriorityRank(b.handoff_priority);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      if (timeA !== timeB) {
        return timeB - timeA; // Newer first
      }
      return b.id.localeCompare(a.id);
    });

    // 5. Apply cursor pagination if cursor is provided
    let startIndex = 0;
    if (query.cursor) {
      const cursorData = this.decodeCursor(query.cursor, notifications);
      if (!cursorData) {
        throw new BadRequestException({
          error: {
            code: "invalid_cursor",
            message: "Invalid notification pagination cursor",
          },
        });
      }

      const cursorRank = cursorData.rank ?? getPriorityRank(cursorData.priority);
      const cursorTime = new Date(cursorData.createdAt).getTime();
      const cursorId = cursorData.id;

      // Find index of first item strictly after cursor
      const foundIndex = notifications.findIndex((item) => {
        const itemRank = getPriorityRank(item.handoff_priority);
        if (itemRank > cursorRank) return true;
        if (itemRank < cursorRank) return false;

        const itemTime = new Date(item.created_at).getTime();
        if (itemTime < cursorTime) return true;
        if (itemTime > cursorTime) return false;

        return item.id < cursorId;
      });

      startIndex = foundIndex === -1 ? notifications.length : foundIndex;
    }

    const pagedNotifications = notifications.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < notifications.length;

    let nextCursor: string | null = null;
    if (hasMore && pagedNotifications.length > 0) {
      const lastItem = pagedNotifications[pagedNotifications.length - 1];
      if (lastItem) {
        const cursorPayload: DecodedCursor = {
          id: lastItem.id,
          priority: lastItem.handoff_priority,
          rank: getPriorityRank(lastItem.handoff_priority),
          createdAt: new Date(lastItem.created_at).toISOString(),
        };
        nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString("base64url");
      }
    }

    const items = pagedNotifications.map((n) => this.mapToDto(n));

    return {
      items,
      unreadCount,
      nextCursor,
    };
  }

  /**
   * 13 §13 PATCH /api/v1/notifications/:id/read
   * Marks single notification read (read_at = NOW()) for calling user.
   * Returns void — caller must respond 204 No Content.
   */
  public async markRead(id: string, userId: string, businessId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        user_id: userId,
        business_id: businessId,
      },
    });

    if (!notification) {
      throw new NotFoundException({
        error: {
          code: "notification_not_found",
          message: `Notification ${id} not found`,
        },
      });
    }

    if (notification.read_at) {
      return; // Already read — idempotent, no-op
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { read_at: new Date() },
    });
  }

  /**
   * 13 §13 POST /api/v1/notifications/read-all
   * Marks all unread notifications read for calling user in business.
   * Returns void — caller must respond 204 No Content.
   */
  public async markAllRead(userId: string, businessId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        business_id: businessId,
        user_id: userId,
        read_at: null,
      },
      data: {
        read_at: new Date(),
      },
    });
  }

  private decodeCursor(
    rawCursor: string,
    cachedNotifications: Notification[],
  ): DecodedCursor | null {
    // 1. Attempt base64url JSON decode
    try {
      const decodedStr = Buffer.from(rawCursor, "base64url").toString("utf-8");
      const parsed = JSON.parse(decodedStr) as Partial<DecodedCursor>;
      if (parsed.id && parsed.createdAt) {
        return {
          id: parsed.id,
          createdAt: parsed.createdAt,
          priority: parsed.priority as HandoffPriority | undefined,
          rank: parsed.rank,
        };
      }
    } catch {
      // not base64url JSON, try finding notification by id
    }

    // 2. Direct UUID lookup in cached list
    const found = cachedNotifications.find((n) => n.id === rawCursor);
    if (found) {
      return {
        id: found.id,
        createdAt: new Date(found.created_at).toISOString(),
        priority: found.handoff_priority,
        rank: getPriorityRank(found.handoff_priority),
      };
    }

    return null;
  }
}
