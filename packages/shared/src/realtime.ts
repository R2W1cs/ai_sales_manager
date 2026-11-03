import { z } from "zod";

import { ConversationStatusSchema, HandoffPrioritySchema, LeadTemperatureSchema } from "./enums";

/**
 * 13 §14 & 14 §12 Realtime Constants & Room Helpers
 */
export const REALTIME_ROOMS = {
  tenant: (businessId: string) => `tenant:${businessId}`,
  business: (businessId: string) => `business:${businessId}`,
  user: (userId: string) => `user:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  conv: (conversationId: string) => `conv:${conversationId}`,
} as const;

export const REALTIME_EVENTS = {
  MESSAGE_NEW: "message.new",
  MESSAGE_UPDATED: "message.updated",
  CONVERSATION_MESSAGE: "conversation.message",
  CONVERSATION_STATUS: "conversation.status",
  CONVERSATION_STATUS_CHANGED: "conversation.status_changed",
  CONVERSATION_ASSIGNED: "conversation.assigned",
  CONVERSATION_HANDOFF: "conversation.handoff",
  CONVERSATION_SCORE: "conversation.score",
  LEAD_SCORE_UPDATED: "lead.score_updated",
  CONVERSATION_SUGGESTION: "conversation.suggestion",
  NOTIFICATION_NEW: "notification.new",
  ORDER_CONFIRMED: "order.confirmed",
  ORDER_CANCELLED: "order.cancelled",
  THREAD_OPEN: "thread:open",
  THREAD_CLOSE: "thread:close",
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

/**
 * Occupancy Payload Schemas (13 §14, 14 §12.1)
 */
export const ThreadOpenPayloadSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
});
export type ThreadOpenPayload = z.infer<typeof ThreadOpenPayloadSchema>;

export const ThreadClosePayloadSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
});
export type ThreadClosePayload = z.infer<typeof ThreadClosePayloadSchema>;

export const RealtimeAuthPayloadSchema = z.object({
  token: z.string().optional(),
  accessToken: z.string().optional(),
  businessId: z.string().optional(),
});
export type RealtimeAuthPayload = z.infer<typeof RealtimeAuthPayloadSchema>;

/**
 * Event Data Payloads
 */
export const MessageNewEventPayloadSchema = z.object({
  conversationId: z.string(),
  message: z.unknown(),
});
export type MessageNewEventPayload = z.infer<typeof MessageNewEventPayloadSchema>;

export const MessageUpdatedEventPayloadSchema = z.object({
  conversationId: z.string(),
  message: z.unknown(),
});
export type MessageUpdatedEventPayload = z.infer<typeof MessageUpdatedEventPayloadSchema>;

export const ConversationStatusEventPayloadSchema = z.object({
  conversationId: z.string(),
  status: ConversationStatusSchema,
  handoffPriority: HandoffPrioritySchema.nullable().optional(),
  escalationReason: z.string().nullable().optional(),
  handoffAt: z.union([z.date(), z.string()]).nullable().optional(),
});
export type ConversationStatusEventPayload = z.infer<typeof ConversationStatusEventPayloadSchema>;

export const ConversationAssignedEventPayloadSchema = z.object({
  conversationId: z.string(),
  assignedUserId: z.string().nullable(),
});
export type ConversationAssignedEventPayload = z.infer<
  typeof ConversationAssignedEventPayloadSchema
>;

export const LeadScoreUpdatedEventPayloadSchema = z.object({
  conversationId: z.string(),
  score: z.number().int().min(0).max(100),
  temperature: LeadTemperatureSchema,
});
export type LeadScoreUpdatedEventPayload = z.infer<typeof LeadScoreUpdatedEventPayloadSchema>;

export const ConversationHandoffEventPayloadSchema = z.object({
  conversationId: z.string(),
  priority: HandoffPrioritySchema.optional(),
  reason: z.string().optional(),
  handoffAt: z.union([z.date(), z.string()]).optional(),
});
export type ConversationHandoffEventPayload = z.infer<typeof ConversationHandoffEventPayloadSchema>;

export const ConversationSuggestionEventPayloadSchema = z.object({
  conversationId: z.string(),
  suggestion: z.unknown(),
});
export type ConversationSuggestionEventPayload = z.infer<
  typeof ConversationSuggestionEventPayloadSchema
>;

export const NotificationNewEventPayloadSchema = z.object({
  businessId: z.string().optional(),
  userId: z.string().optional(),
  notification: z.unknown(),
});
export type NotificationNewEventPayload = z.infer<typeof NotificationNewEventPayloadSchema>;

export const OrderConfirmedEventPayloadSchema = z.object({
  businessId: z.uuid(),
  orderId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
  customerId: z.uuid(),
  total: z.string().regex(/^\d+\.\d{3}$/, "Total must be formatted to 3 decimal places"),
  confirmedAt: z.union([z.date(), z.string()]),
});
export type OrderConfirmedEventPayload = z.infer<typeof OrderConfirmedEventPayloadSchema>;

export const OrderCancelledReasonSchema = z.enum(["MANUAL_CANCEL", "EXPIRED_RESERVATION"]);
export type OrderCancelledReason = z.infer<typeof OrderCancelledReasonSchema>;

export const OrderCancelledEventPayloadSchema = z.object({
  businessId: z.uuid(),
  orderId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
  reason: OrderCancelledReasonSchema.optional(),
  cancelledAt: z.union([z.date(), z.string()]),
});
export type OrderCancelledEventPayload = z.infer<typeof OrderCancelledEventPayloadSchema>;
