import { z } from "zod";

import { HandoffPrioritySchema, NotificationTypeSchema } from "../enums";

/**
 * 13 §13 Notifications API validation schemas and DTOs
 * Field names follow the camelCase rule (docs/10_engineering/13_API_DESIGN §3).
 * Snake_case aliases are DB-layer concerns only and must not appear here.
 */

export const NotificationQuerySchema = z.object({
  unread: z
    .preprocess((val) => {
      if (typeof val === "string") {
        if (val.toLowerCase() === "true" || val === "1") return true;
        if (val.toLowerCase() === "false" || val === "0") return false;
      }
      return val;
    }, z.boolean())
    .optional(),
  cursor: z.string().optional().describe("opaque base64url pagination cursor"),
  limit: z
    .preprocess(
      (val) => (typeof val === "string" && /^[1-9]\d*$/.test(val) ? Number(val) : val),
      z.number().int().min(1).max(100).default(50),
    )
    .optional(),
});
export type NotificationQueryDto = z.infer<typeof NotificationQuerySchema>;

export const NotificationItemSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  userId: z.string(),
  type: NotificationTypeSchema,
  handoffPriority: HandoffPrioritySchema.nullable().optional(),
  title: z.string(),
  message: z.string(),
  entityType: z.string(),
  entityId: z.uuid(),
  dedupeKey: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItemDto = z.infer<typeof NotificationItemSchema>;

export const PaginatedNotificationsResponseSchema = z.object({
  items: z.array(NotificationItemSchema),
  unreadCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export type PaginatedNotificationsResponse = z.infer<typeof PaginatedNotificationsResponseSchema>;
