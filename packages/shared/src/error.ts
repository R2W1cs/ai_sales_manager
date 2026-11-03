import { z } from "zod";

export * from "./enums";

/**
 * 13 §2.6 Error envelope
 * Source of truth for error codes.
 */
export const ErrorCodeSchema = z.enum([
  "unauthorized",
  "forbidden",
  "no_business",
  "not_found",
  "validation_error",
  "business_required",
  "conflict",
  "idempotency_key_conflict",
  "invalid_transition",
  "pending_order_blocks_resume",
  "ambiguous_pending_order",
  "quota_exceeded",
  "rate_limited",
  "feature_disabled",
  "activation_not_ready",
  "ai_paused",
  "webhook_invalid_signature",
  "oauth_expired",
  "payload_too_large",
  "not_implemented",
  "internal_error",
  "service_unavailable",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * Field errors: details.fields = { "<path>": ["message"] } (BAC-3)
 */
export const FieldErrorsSchema = z.record(z.string(), z.array(z.string()));

export const ErrorDetailsSchema = z
  .object({
    fields: FieldErrorsSchema.optional(),
    metric: z
      .enum([
        "seats",
        "channel_accounts",
        "ai_messages_per_month",
        "max_ai_replies_per_month",
        "max_conversations",
        "monthly_ai_budget_usd",
      ])
      .optional(),
    unmet_gates: z.array(z.string()).optional(),
  })
  // Zod 4: `.loose()` allows unknown keys (same semantics as Zod 3 `.passthrough()`).
  .loose();

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: ErrorDetailsSchema.optional(),
  }),
  request_id: z.uuid(),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
