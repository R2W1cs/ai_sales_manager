import { z } from "zod";

/**
 * 16 §3 / T-INT-03 Integration Types & Canonical Message Schemas
 */

export const ChannelTypeSchema = z.enum(["instagram", "messenger", "whatsapp"]);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const CanonicalEventKindSchema = z.enum([
  "message",
  "delivery",
  "read",
  "lifecycle",
  "other",
]);
export type CanonicalEventKind = z.infer<typeof CanonicalEventKindSchema>;

export const AttachmentTypeSchema = z.enum([
  "image",
  "audio",
  "video",
  "document",
  "file",
  "sticker",
  "location",
  "fallback",
  "unknown",
]);
export type AttachmentType = z.infer<typeof AttachmentTypeSchema>;

export const CanonicalAttachmentSchema = z.object({
  type: AttachmentTypeSchema.or(z.string()),
  providerUrl: z.string().optional(),
  url: z.string().optional(),
});
export type CanonicalAttachment = z.infer<typeof CanonicalAttachmentSchema>;

export const CanonicalMessageSchema = z.object({
  // Canonical fields matching 16_INTEGRATION_DESIGN.md §3.1
  provider: z.string().default("meta"),
  channel: ChannelTypeSchema,
  channelType: ChannelTypeSchema.optional(), // compatibility alias
  eventKind: CanonicalEventKindSchema.default("message"),
  externalAccountId: z.string(),
  channelAccountId: z.string().optional(), // compatibility alias
  externalThreadId: z.string().optional(),
  externalMessageId: z.string(),
  platformUserId: z.string(),
  externalSenderId: z.string().optional(), // compatibility alias
  text: z.string().nullable().optional(),
  attachments: z.array(CanonicalAttachmentSchema).default([]),
  timestamp: z.string(), // ISO-8601 string
  isEcho: z.boolean().default(false),
  rawEventId: z.string().optional(),
});

export type CanonicalMessage = z.infer<typeof CanonicalMessageSchema>;
export type CanonicalInbound = CanonicalMessage;

export const CanonicalOutboundSchema = z.object({
  channel: ChannelTypeSchema,
  recipientPlatformUserId: z.string(),
  text: z.string().optional(),
  imageS3Key: z.string().optional(),
  imageUrl: z.string().optional(),
  externalReplyToId: z.string().optional(),
  pageId: z.string().optional(),
});
export type CanonicalOutbound = z.infer<typeof CanonicalOutboundSchema>;

export interface SendResult {
  ok: boolean;
  externalMessageId?: string;
  retryable?: boolean;
  providerCode?: string;
  message?: string;
}

export interface MapContext {
  channelAccountId?: string;
  rawEventId?: string;
  channel?: ChannelType;
  channelType?: ChannelType;
  [key: string]: unknown;
}

export interface ChannelAdapter {
  readonly channel: ChannelType;
  mapInbound(raw: unknown, ctx?: MapContext): CanonicalMessage[];
  send(input: CanonicalOutbound, token: string): Promise<SendResult>;
  outboundLimiter: { max: number; durationMs: number };
}
