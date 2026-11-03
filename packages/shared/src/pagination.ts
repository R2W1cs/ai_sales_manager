import { z } from "zod";

/**
 * 13 §2.7 Pagination cursor
 * Cursor is opaque (base64url) from client perspective,
 * but server uses a specific structure.
 */

// Schema for the opaque cursor string that clients send
export const CursorSchema = z.string().min(1);

// Internal schema for time-ordered cursors: { "t": "<created_at ISO>", "id": "<uuid>" }
export const TimeOrderedCursorSchema = z.object({
  t: z.iso.datetime(),
  id: z.uuid(),
});

// Cursor for inbox sales_priority: (human_needed, handoff_priority, handoff_at, lead_temperature, lead_score, last_message_at, id)
export const SalesPriorityCursorSchema = z.object({
  human_needed: z.boolean(),
  handoff_priority: z.enum(["critical", "high", "normal"]).nullable(),
  handoff_at: z.iso.datetime().nullable(),
  lead_temperature: z.enum(["hot", "warm", "cold"]),
  lead_score: z.number().int().min(0).max(100),
  last_message_at: z.iso.datetime().nullable(),
  id: z.uuid(),
});

export const PaginationParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: CursorSchema.optional(),
});

export const PaginatedResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    next_cursor: z.string().nullable(),
  });
