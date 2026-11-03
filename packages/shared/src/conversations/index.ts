import { z } from "zod";

import {
  ChannelSchema,
  ContentTypeSchema,
  ConversationSourceSchema,
  ConversationStatusSchema,
  HandoffPrioritySchema,
  LeadTemperatureSchema,
  MessageDeliveryStatusSchema,
  MessageDirectionSchema,
  OrderStatusSchema,
  SenderTypeSchema,
} from "../enums";

/**
 * 13 §3.3 / 13 §6.1 Conversation Summary Schemas & DTOs
 */

export const ConversationCustomerSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
});
export type ConversationCustomerSummary = z.infer<typeof ConversationCustomerSummarySchema>;

export const ConversationPendingOrderSchema = z.object({
  id: z.uuid(),
  status: OrderStatusSchema,
  total: z.string(),
  currency: z.string(),
});
export type ConversationPendingOrder = z.infer<typeof ConversationPendingOrderSchema>;

export const ConversationSummarySchema = z.object({
  id: z.uuid(),
  status: ConversationStatusSchema,
  source: ConversationSourceSchema,
  channel: z.union([ChannelSchema, z.literal("playground"), z.literal("website")]),
  aiEnabled: z.boolean(),
  assignedUserId: z.uuid().nullable(),

  handoffPriority: HandoffPrioritySchema.nullable(),
  escalationReason: z.string().nullable(),
  handoffAt: z.union([z.date(), z.string()]).nullable(),
  leadScore: z.number().int().min(0).max(100),
  leadTemperature: LeadTemperatureSchema,
  lastMessageAt: z.union([z.date(), z.string()]).nullable(),
  lastMessagePreview: z.string().nullable(),
  unread: z.boolean(),
  isTest: z.boolean(),
  customer: ConversationCustomerSummarySchema,
  pendingOrder: ConversationPendingOrderSchema.nullable(),
  pendingOrderAmbiguous: z.boolean().optional(),
});
export type ConversationSummaryDto = z.infer<typeof ConversationSummarySchema>;

/**
 * 13 §6.1 List Conversations Query Schema
 */
export const ListConversationsQuerySchema = z.object({
  view: z.enum(["needs_me", "all"]).default("needs_me").optional(),
  sort: z.enum(["sales_priority", "recent"]).default("sales_priority").optional(),
  status: z
    .union([ConversationStatusSchema, z.array(ConversationStatusSchema), z.string()])
    .optional(),
  channel: z.enum(["instagram", "messenger", "whatsapp", "website"]).optional(),
  assigned_to: z.string().optional(),
  assigneeId: z.string().optional(),
  assignee_id: z.string().optional(),
  temperature: LeadTemperatureSchema.optional(),
  leadTemperature: LeadTemperatureSchema.optional(),
  has_pending_order: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  hasPendingOrder: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});
export type ListConversationsQueryDto = z.infer<typeof ListConversationsQuerySchema>;

/**
 * 13 §6.1 Paginated Conversations Response
 */
export const PaginatedConversationsResponseSchema = z.object({
  items: z.array(ConversationSummarySchema),
  nextCursor: z.string().optional(),
  totalUnread: z.number().int().min(0),
});
export type PaginatedConversationsResponse = z.infer<typeof PaginatedConversationsResponseSchema>;
export type ListConversationsResponseDto = PaginatedConversationsResponse;

/**
 * 13 §6.2 Message & Attachment Schemas & DTOs
 */
export const MessageAttachmentSchema = z.object({
  id: z.uuid(),
  s3Key: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nullable().optional(),
  sortOrder: z.number().int(),
  createdAt: z.union([z.date(), z.string()]).optional(),
});
export type MessageAttachmentDto = z.infer<typeof MessageAttachmentSchema>;

export const MessageDtoSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid().optional(),
  conversationId: z.uuid(),
  channelAccountId: z.uuid().nullable().optional(),
  direction: MessageDirectionSchema,
  senderType: SenderTypeSchema,
  senderUserId: z.uuid().nullable().optional(),
  content: z.string().nullable(),
  contentType: ContentTypeSchema,
  externalMessageId: z.string().nullable().optional(),
  idempotencyKey: z.string().optional(),
  aiMetadata: z.any().nullable().optional(),
  deliveryStatus: MessageDeliveryStatusSchema,
  createdAt: z.union([z.date(), z.string()]),
  attachments: z.array(MessageAttachmentSchema).default([]),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const PaginatedMessagesResponseSchema = z.object({
  items: z.array(MessageDtoSchema),
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean().optional(),
});
export type PaginatedMessagesResponse = z.infer<typeof PaginatedMessagesResponseSchema>;

export const SendMessageAttachmentInputSchema = z.object({
  s3Key: z.string().min(1, "s3Key is required"),
  contentType: z.string().min(1, "contentType is required"),
  sizeBytes: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0).optional(),
});
export type SendMessageAttachmentInput = z.infer<typeof SendMessageAttachmentInputSchema>;

export const SendMessageSchema = z
  .object({
    content: z.string().max(10000).optional().nullable(),
    contentType: ContentTypeSchema.default("text").optional(),
    attachments: z.array(SendMessageAttachmentInputSchema).optional(),
  })
  .refine(
    (data) =>
      (typeof data.content === "string" && data.content.trim().length > 0) ||
      (Array.isArray(data.attachments) && data.attachments.length > 0),
    {
      message: "Either content or attachments must be provided",
    },
  );
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const CreateInternalNoteSchema = z.object({
  body: z
    .string()
    .min(1, "Note body cannot be empty")
    .max(5000, "Note body cannot exceed 5000 characters"),
});
export type CreateInternalNoteDto = z.infer<typeof CreateInternalNoteSchema>;

export const ConversationNoteSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid().optional(),
  conversationId: z.uuid(),
  authorUserId: z.uuid(),
  body: z.string(),
  createdAt: z.union([z.date(), z.string()]),
});
export type ConversationNoteDto = z.infer<typeof ConversationNoteSchema>;

export const AssignConversationSchema = z.object({
  userId: z.uuid().nullable().optional(),
  assignedUserId: z.uuid().nullable().optional(),
});
export type AssignConversationDto = z.infer<typeof AssignConversationSchema>;

export const ApproveDraftMessageSchema = z.object({
  content: z.string().max(10000).optional(),
});
export type ApproveDraftMessageDto = z.infer<typeof ApproveDraftMessageSchema>;

/**
 * 13 §6.2 / FR-CONV-040 Timeline Projection Schemas & DTOs
 */
export const TimelineItemTypeSchema = z.enum([
  "MESSAGE",
  "STATUS_CHANGE",
  "HANDOFF",
  "NOTE",
  "ORDER",
  "ASSIGNMENT",
  "AI_ACTION",
]);
export type TimelineItemType = z.infer<typeof TimelineItemTypeSchema>;

export const TimelineItemSchema = z.object({
  id: z.string(),
  type: TimelineItemTypeSchema,
  timestamp: z.union([z.date(), z.string()]),
  data: z.record(z.string(), z.any()),
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

/**
 * 13 §7 / FR-CONV-050–053 Pipeline Projection Schemas & DTOs
 */
export const PipelineCardSchema = z
  .object({
    conversationId: z.string().nullable().optional(),
    orderId: z.string().nullable().optional(),
    customerName: z.string().nullable().optional(),
    productSnapshot: z.string().nullable().optional(),
    value: z.number().int().min(0),
    valueType: z.enum(["actual", "estimated"]).optional(),
    currency: z.string().default("TND").optional(),
    temperature: LeadTemperatureSchema.nullable().optional(),
    lastActivityAt: z.union([z.date(), z.string()]).nullable().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.conversationId || data.orderId), {
    message: "Pipeline card must have either conversationId or orderId",
  });
export type PipelineCardDto = z.infer<typeof PipelineCardSchema>;

export const PipelineColumnSchema = z
  .object({
    count: z.number().int().min(0),
    totalValue: z.number().int().min(0),
    cards: z.array(PipelineCardSchema),
  })
  .strict();
export type PipelineColumnDto = z.infer<typeof PipelineColumnSchema>;

export const PipelineResponseSchema = z
  .object({
    currency: z.string().default("TND").optional(),
    columns: z
      .object({
        new_leads: PipelineColumnSchema,
        qualified: PipelineColumnSchema,
        payment_pending: PipelineColumnSchema,
        sold: PipelineColumnSchema,
      })
      .strict(),
  })
  .strict();
export type PipelineResponseDto = z.infer<typeof PipelineResponseSchema>;

export const PipelineQuerySchema = z
  .object({
    limit: z
      .preprocess((val) => {
        if (val === undefined || val === null || val === "") return 50;
        if (typeof val === "number") {
          return Number.isInteger(val) ? val : NaN;
        }
        if (typeof val === "string") {
          const trimmed = val.trim();
          if (/^[1-9]\d*$/.test(trimmed)) {
            return Number(trimmed);
          }
          return NaN;
        }
        return NaN;
      }, z.number().int().min(1).max(100))
      .default(50)
      .optional(),
  })
  .strict();
export type PipelineQueryDto = z.infer<typeof PipelineQuerySchema>;
