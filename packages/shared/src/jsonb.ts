import { z } from "zod";

import {
  ChannelSchema,
  LifecycleStageSchema,
  HandoffPrioritySchema,
  EscalationReasonSchema,
  CanonicalIntentSchema,
  CollectedFieldSchema,
} from "./enums";

/**
 * 12 §14.0 Stored JSONB Contracts
 */

/**
 * 14.1 conversations.handoff_context (06 §6.1)
 * Note: `price` is a historical snapshot observed during the conversation,
 * not authoritative current catalogue pricing.
 */
export const HandoffProductDiscussedSchema = z.object({
  product_id: z.uuid(),
  variant_id: z.uuid(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  price: z.number(), // Snapshot observed during discussion
  currency: z.string(),
});

/**
 * Snapshot of pending order state at handoff time.
 * Note: The `orders` database table remains the authoritative source of truth.
 */
export const HandoffPendingOrderSchema = z.object({
  id: z.uuid(),
  amount: z.number(), // Snapshot amount at handoff
  currency: z.string(),
  item_count: z.number().int().positive(),
});

export const HandoffCustomerSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  channel: ChannelSchema,
  lifecycle_stage: LifecycleStageSchema,
});

// "unknown" is used when a confidence score is provided but the caller cannot
// determine how it was derived (hybrid classifiers, fallback paths, etc.).
// Prefer "llm" | "rule" | "manual" whenever the source is actually known.
export const HandoffConfidenceSourceSchema = z.enum(["llm", "rule", "manual", "unknown"]);
export type HandoffConfidenceSource = z.infer<typeof HandoffConfidenceSourceSchema>;

export const HandoffContextSchema = z
  .object({
    schema_version: z.literal(1),
    customer: HandoffCustomerSchema,
    summary: z.string(),
    intent: CanonicalIntentSchema,
    confidence: z.number().min(0).max(1).nullable(),
    confidence_source: HandoffConfidenceSourceSchema.nullable().optional(),
    products_discussed: z.array(HandoffProductDiscussedSchema),
    collected_fields: z.array(CollectedFieldSchema),
    missing_fields: z.array(CollectedFieldSchema),
    ai_recommendation: z.string(), // Strategic reasoning & context for operator
    action_required: z.string(), // Single concrete next operational action
    escalation_reason: EscalationReasonSchema,
    handoff_priority: HandoffPrioritySchema,
    also_matched: z.array(EscalationReasonSchema).default([]),
    pending_order: HandoffPendingOrderSchema.nullable(),
    decision_trace_id: z.uuid().nullable().optional(),
    evaluator_version: z.string().optional(),
  })
  .refine(
    (data) => {
      // If confidence is unscored (null), confidence_source cannot be set to a source
      if (data.confidence === null && data.confidence_source) {
        return false;
      }
      // If confidence is scored (non-null), confidence_source cannot be explicitly null
      if (data.confidence !== null && data.confidence_source === null) {
        return false;
      }
      return true;
    },
    {
      message:
        "confidence_source must not be null when confidence is scored, and must be null when confidence is unscored",
      path: ["confidence_source"],
    },
  );
export type HandoffContext = z.infer<typeof HandoffContextSchema>;

// 14.2 messages.ai_metadata
export const AiMetadataSchema = z.object({
  intent: z.string(),
  confidence: z.number(),
  tools_called: z.array(z.string()),
  model: z.string(),
  latency_ms: z.number().int().nonnegative(),
  prompt_version_id: z.uuid().nullable().optional(),
  fallback_used: z.boolean(),
});
export type AiMetadata = z.infer<typeof AiMetadataSchema>;

// 14.3 ai_decision_traces.decision_trace
export const DecisionTraceSchema = z.object({
  schema_version: z.literal(1),
  intent: z.string(),
  confidence: z.number(),
  decision: z.string(),
  escalation_reason: EscalationReasonSchema.nullable().optional(),
  handoff_priority: HandoffPrioritySchema.nullable().optional(),
  prompt_version_id: z.uuid().nullable().optional(),
  sales_prompt_version_id: z.uuid().nullable().optional(),
  rules_checked: z.array(z.string()).default([]),
  policy_outcomes: z.record(z.string(), z.unknown()).default({}),
  tools_called: z.array(z.string()).default([]),
  rag_chunk_ids: z.array(z.string()).default([]),
  models_attempted: z.array(z.string()).default([]),
  circuit_skipped: z.array(z.string()).default([]),
  classifier_error: z.boolean().default(false),
  grounding_passed: z.boolean().default(true),
  mode: z.string(),
  latency_ms: z.number().int().nonnegative(),
});
export type DecisionTrace = z.infer<typeof DecisionTraceSchema>;

// 14.4 plans.limits
export const PlanLimitsSchema = z.object({
  channel_accounts: z.number().int().nonnegative(),
  ai_messages_per_month: z.number().int().nonnegative(),
  max_conversations: z.number().int().nonnegative().nullable(),
  max_ai_replies_per_month: z.number().int().nonnegative(),
  seats: z.number().int().positive(),
  monthly_ai_budget_usd: z.number().nonnegative().nullable(),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

// 14.5 product_variants.attributes / order_items.attributes_snapshot
export const VariantAttributesSchema = z.record(z.string(), z.string());
export type VariantAttributes = z.infer<typeof VariantAttributesSchema>;

// 14.6 conversations.lead_score_factors
export const LeadScoreFactorsSchema = z.record(z.string(), z.number());
export type LeadScoreFactors = z.infer<typeof LeadScoreFactorsSchema>;

// 14.7 businesses.settings
export const BusinessSettingsSchema = z.object({}).strict();
export type BusinessSettings = z.infer<typeof BusinessSettingsSchema>;

// 14.8 business_rules.payload
export const DeliveryZoneSchema = z.object({
  name: z.string(),
  fee: z.number().nonnegative(),
  currency: z.string().default("TND"),
  eta_hours: z.number().positive(),
});

export const DeliveryRulePayloadSchema = z.object({
  zones: z.array(DeliveryZoneSchema),
});
export type DeliveryRulePayload = z.infer<typeof DeliveryRulePayloadSchema>;

export const PaymentMethodSchema = z.object({
  code: z.string(),
  label: z.string(),
});

export const PaymentRulePayloadSchema = z.object({
  methods: z.array(PaymentMethodSchema),
});
export type PaymentRulePayload = z.infer<typeof PaymentRulePayloadSchema>;

export const ReturnsRulePayloadSchema = z.object({
  window_days: z.number().int().nonnegative(),
  conditions: z.string(),
});
export type ReturnsRulePayload = z.infer<typeof ReturnsRulePayloadSchema>;

export const WorkingHoursDaySchema = z
  .object({
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .nullable();

export const WorkingHoursPayloadSchema = z.object({
  timezone: z.string().default("Africa/Tunis"),
  weekly: z.record(z.string(), WorkingHoursDaySchema),
  human_callback: z.string().default("next_working_day"),
});
export type WorkingHoursPayload = z.infer<typeof WorkingHoursPayloadSchema>;

export const DiscountRulePayloadSchema = z.object({
  ai_may_offer: z.boolean().default(false),
  max_percent: z.number().min(0).max(100).nullable(),
});
export type DiscountRulePayload = z.infer<typeof DiscountRulePayloadSchema>;

export const MinOrderPayloadSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().default("TND"),
});
export type MinOrderPayload = z.infer<typeof MinOrderPayloadSchema>;

export const FreeShippingPayloadSchema = z.object({
  threshold: z.number().nonnegative(),
  currency: z.string().default("TND"),
});
export type FreeShippingPayload = z.infer<typeof FreeShippingPayloadSchema>;

// 14.9 Merchandising
export const StringListSchema = z.array(z.string());
export type StringList = z.infer<typeof StringListSchema>;

export const FaqItemSchema = z.object({
  q: z.string(),
  a: z.string(),
});

export const FaqListSchema = z.array(FaqItemSchema);
export type FaqList = z.infer<typeof FaqListSchema>;

// 14.10 Address and order snapshot
export const AddressSchema = z.object({
  line1: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1, "City is required").max(100),
  region: z.string().trim().max(100).optional(),
  postal_code: z.string().trim().max(20).optional(),
  country: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
      z.string().regex(/^[A-Z]{2}$/, "Country must be a 2-letter ISO code"),
    )
    .default("TN"),
});
export type Address = z.infer<typeof AddressSchema>;

export function areAddressesEqual(a?: Address | null, b?: Address | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const normalize = (val?: string | null) => (val ? val.trim().toLowerCase() : "");
  return (
    normalize(a.city) === normalize(b.city) &&
    normalize(a.line1) === normalize(b.line1) &&
    normalize(a.region) === normalize(b.region) &&
    normalize(a.postal_code) === normalize(b.postal_code) &&
    normalize(a.country || "TN") === normalize(b.country || "TN")
  );
}

export const CustomerSnapshotSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  address: AddressSchema.nullable(),
});
export type CustomerSnapshot = z.infer<typeof CustomerSnapshotSchema>;

// 14.11 customers.preferences
export const CustomerPreferencesSchema = z
  .object({
    sizes: z.array(z.string()).optional(),
    colors: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .strict();
export type CustomerPreferences = z.infer<typeof CustomerPreferencesSchema>;

// 14.12 conversations.collected_fields
export const CollectedFieldItemSchema = z.enum([
  "name",
  "phone",
  "address",
  "quantity",
  "payment_preference",
]);

export const CollectedFieldsSchema = z.array(CollectedFieldItemSchema);
export type CollectedFields = z.infer<typeof CollectedFieldsSchema>;

// 14.13 ai_agents.sales_strategy
export const SalesStrategySchema = z.object({
  upsell: z.boolean(),
  cross_sell: z.boolean(),
  aggressiveness: z.enum(["low", "medium", "high"]),
});
export type SalesStrategy = z.infer<typeof SalesStrategySchema>;

// 14.14 ai_actions.input / output
export const AiActionIOSchema = z.record(z.string(), z.unknown());
export type AiActionIO = z.infer<typeof AiActionIOSchema>;

// 14.15 Evaluation, handoff counts, audit
export const DimensionScoresSchema = z.object({
  correctness: z.number().min(0).max(100).optional(),
  grounding: z.number().min(0).max(100).optional(),
  language: z.number().min(0).max(100).optional(),
  tools: z.number().min(0).max(100).optional(),
  escalation: z.number().min(0).max(100).optional(),
  conversion: z.number().min(0).max(100).optional(),
});
export type DimensionScores = z.infer<typeof DimensionScoresSchema>;

export const HandoffsByReasonSchema = z.record(
  EscalationReasonSchema,
  z.number().int().nonnegative(),
);
export type HandoffsByReason = z.infer<typeof HandoffsByReasonSchema>;

export const AuditPayloadSchema = z.object({
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
});
export type AuditPayload = z.infer<typeof AuditPayloadSchema>;

// 14.0 message_templates.body_params
export const TemplateBodyParamsSchema = z.record(z.string(), z.unknown());
export type TemplateBodyParams = z.infer<typeof TemplateBodyParamsSchema>;
