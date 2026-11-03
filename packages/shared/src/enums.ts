import { z } from "zod";

/**
 * 12 §3. Enums
 * Source of truth for all domain enums.
 */

export const MemberRoleSchema = z.enum(["owner", "admin", "employee"]);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const ProductStatusSchema = z.enum(["draft", "active", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const LifecycleStageSchema = z.enum([
  "unknown_visitor",
  "interested",
  "qualified_lead",
  "order_pending",
  "customer",
  "returning_customer",
  "vip",
]);
export type LifecycleStage = z.infer<typeof LifecycleStageSchema>;

export const ConversationStatusSchema = z.enum([
  "NEW",
  "AI_ACTIVE",
  "ORDER_INTENT_DETECTED",
  "HUMAN_REQUIRED",
  "HUMAN_HANDLING",
  "ORDER_CONFIRMED",
  "RESOLVED",
]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const ConversationSourceSchema = z.enum([
  "instagram",
  "messenger",
  "whatsapp",
  "playground",
  "website",
]);
export type ConversationSource = z.infer<typeof ConversationSourceSchema>;
export const HandoffPrioritySchema = z.enum(["critical", "high", "normal"]);
export const LeadTemperatureSchema = z.enum(["hot", "warm", "cold"]);
export const MessageDirectionSchema = z.enum(["inbound", "outbound"]);
export const SenderTypeSchema = z.enum(["customer", "ai", "human", "system"]);
export const ContentTypeSchema = z.enum(["text", "image", "template", "system"]);
export const MessageDeliveryStatusSchema = z.enum([
  "draft",
  "queued",
  "sent",
  "delivered",
  "failed",
]);
export const OrderStatusSchema = z.enum([
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
]);
export const PaymentStatusSchema = z.enum(["NOT_COMPLETED", "COMPLETED"]);
export const ReservationStatusSchema = z.enum(["active", "committed", "released", "expired"]);
export const ChannelSchema = z.enum(["instagram", "messenger", "whatsapp"]);
export type Channel = z.infer<typeof ChannelSchema>;
export const ChannelAccountStatusSchema = z.enum([
  "pending",
  "pending_verification",
  "active",
  "error",
  "disconnected",
]);
export const ReplyModeSchema = z.enum(["auto_send", "approval_required", "draft_only"]);
export const PromptTypeSchema = z.enum(["system", "sales", "escalation", "handoff_summary"]);
export const EmbeddingSourceSchema = z.enum(["knowledge_document", "product", "variant"]);
export const IndexingStatusSchema = z.enum(["pending", "indexing", "ready", "failed"]);
export const RuleTypeSchema = z.enum([
  "delivery",
  "payment",
  "returns",
  "working_hours",
  "discount",
  "min_order",
  "free_shipping",
]);
export type RuleType = z.infer<typeof RuleTypeSchema>;
export const NotificationTypeSchema = z.enum([
  "HOT_LEAD",
  "ORDER_REQUEST",
  "HANDOFF",
  "ESCALATION",
]);
export const FeedbackRatingSchema = z.enum(["positive", "negative"]);
export const FeedbackReasonSchema = z.enum([
  "wrong_product",
  "wrong_tone",
  "missing_information",
  "incorrect_policy",
  "hallucination",
  "other",
]);
export const EvaluatorTypeSchema = z.enum([
  "golden_set",
  "production_sample",
  "staff",
  "automated_grounding",
]);
export const SubscriptionStatusSchema = z.enum(["active", "cancelled", "past_due"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export const UsageMetricSchema = z.enum([
  "messages_in",
  "messages_out_ai",
  "orders_created",
  "whatsapp_conversations_started",
]);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;
export const ImportStatusSchema = z.enum([
  "uploaded",
  "validated",
  "previewed",
  "running",
  "succeeded",
  "failed",
]);
export const AssignmentStatusSchema = z.enum(["active", "released"]);
export const AiActionTypeSchema = z.enum([
  "tool_call",
  "intent_classify",
  "handoff",
  "recommend",
  "rate_limited",
]);

/**
 * 06 §4 Escalation reasons.
 * text in DB, Zod validation here.
 */
export const EscalationReasonSchema = z.enum([
  "purchase_handoff",
  "payment_issue",
  "refund_request",
  "return_exchange",
  "complaint",
  "low_confidence",
  "human_request",
  "negotiation",
  "custom_order",
  "vip_customer",
  "bulk_order",
  "legal_sensitive",
  "inventory_conflict",
  "policy_conflict",
  "integration_failure",
  "ai_timeout",
]);

/**
 * 05 §6 & 15 §6 Canonical Intent Taxonomy
 */
export const CANONICAL_INTENTS = [
  "greeting",
  "product_inquiry",
  "stock_check",
  "price_question",
  "delivery_inquiry",
  "payment_inquiry",
  "return_inquiry",
  "discount_inquiry",
  "purchase_intent",
  "order_status",
  "complaint",
  "human_request",
  "unknown",
] as const;
export const CanonicalIntentSchema = z.enum(CANONICAL_INTENTS);
export type CanonicalIntent = z.infer<typeof CanonicalIntentSchema>;

/**
 * 06 §6.1 / 12 §14.1 Canonical fields collected during conversation turns
 */
export const COLLECTED_FIELDS = [
  "name",
  "phone",
  "email",
  "address",
  "city",
  "postal_code",
  "size",
  "color",
  "quantity",
  "product",
  "variant",
  "payment_method",
  "notes",
] as const;
export const CollectedFieldSchema = z.enum(COLLECTED_FIELDS);
export type CollectedField = z.infer<typeof CollectedFieldSchema>;
