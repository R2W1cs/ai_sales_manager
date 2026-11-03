import { z } from "zod";

import {
  EscalationReasonSchema,
  HandoffPrioritySchema,
  CanonicalIntentSchema,
  type CanonicalIntent,
  CollectedFieldSchema,
  type CollectedField,
} from "./enums";
import {
  HandoffContextSchema,
  type HandoffContext,
  HandoffCustomerSchema,
  HandoffProductDiscussedSchema,
  HandoffPendingOrderSchema,
  HandoffConfidenceSourceSchema,
  type HandoffConfidenceSource,
} from "./jsonb";

export type EscalationReason = z.infer<typeof EscalationReasonSchema>;
export type HandoffPriority = z.infer<typeof HandoffPrioritySchema>;

/**
 * 06_AI_HUMAN_HANDOFF_RULES & T-HAND-01:
 * The 15 Canonical HUMAN_REQUIRED Handoff Triggers
 */
export const HANDOFF_TRIGGERS = [
  "EXPLICIT_HUMAN_REQUEST",
  "COMPLEX_NEGOTIATION",
  "COMPLAINT_OR_DISPUTE",
  "RETURN_OR_REFUND",
  "CUSTOM_MODIFICATION",
  "BULK_ORDER",
  "REPEATED_CONFUSION",
  "LOW_CONFIDENCE",
  "PAYMENT_FAILURE",
  "STOCK_OUTAGE",
  "OUT_OF_SCOPE",
  "SENSITIVE_TOPIC",
  "POLICY_CONFLICT",
  "HIGH_VALUE_LEAD",
  "MANUAL_OVERRIDE",
] as const;

export const HandoffTriggerSchema = z.enum(HANDOFF_TRIGGERS);
export type HandoffTrigger = z.infer<typeof HandoffTriggerSchema>;

/**
 * Explicit mapping from all 15 triggers to canonical DB escalation_reason (06 §4).
 * Note: The 16 canonical escalation reasons are:
 * - 14 reasons mapped from the 15 conversational triggers below
 * - `purchase_handoff`: Originates from the purchase completion pipeline (06 §3 & §7)
 * - `ai_timeout`: System fallback for AI processing timeout (06 §4.15)
 */
export const TRIGGER_TO_ESCALATION_REASON_MAP: Record<
  HandoffTrigger,
  EscalationReason | ((context?: { isRefund?: boolean }) => EscalationReason)
> = {
  EXPLICIT_HUMAN_REQUEST: "human_request",
  COMPLEX_NEGOTIATION: "negotiation",
  COMPLAINT_OR_DISPUTE: "complaint",
  RETURN_OR_REFUND: (ctx) => (ctx?.isRefund ? "refund_request" : "return_exchange"),
  CUSTOM_MODIFICATION: "custom_order",
  BULK_ORDER: "bulk_order",
  REPEATED_CONFUSION: "low_confidence",
  LOW_CONFIDENCE: "low_confidence",
  PAYMENT_FAILURE: "payment_issue",
  STOCK_OUTAGE: "inventory_conflict",
  OUT_OF_SCOPE: "integration_failure",
  SENSITIVE_TOPIC: "legal_sensitive",
  POLICY_CONFLICT: "policy_conflict",
  HIGH_VALUE_LEAD: "vip_customer",
  MANUAL_OVERRIDE: "human_request",
};

/**
 * Priority mapping for handoff triggers per 06 §4 & §5:
 * - critical: payment_issue, complaint, legal_sensitive, vip_customer, integration_failure, refund_request
 * - high: human_request, negotiation, return_exchange, custom_order, bulk_order, inventory_conflict, manual_override
 * - normal: low_confidence, repeated_confusion, policy_conflict
 */
export function getHandoffTriggerPriority(
  trigger: HandoffTrigger,
  context?: { isRefund?: boolean },
): "critical" | "high" | "normal" {
  if (trigger === "RETURN_OR_REFUND" && context?.isRefund) {
    return "critical";
  }
  switch (trigger) {
    case "PAYMENT_FAILURE":
    case "COMPLAINT_OR_DISPUTE":
    case "HIGH_VALUE_LEAD":
    case "SENSITIVE_TOPIC":
    case "OUT_OF_SCOPE":
      return "critical";
    case "EXPLICIT_HUMAN_REQUEST":
    case "COMPLEX_NEGOTIATION":
    case "RETURN_OR_REFUND":
    case "CUSTOM_MODIFICATION":
    case "BULK_ORDER":
    case "STOCK_OUTAGE":
    case "MANUAL_OVERRIDE":
      return "high";
    case "LOW_CONFIDENCE":
    case "REPEATED_CONFUSION":
    case "POLICY_CONFLICT":
      return "normal";
  }
}

/**
 * Maps task trigger enum to canonical DB escalation reason from 06 §4
 */
export function mapTriggerToEscalationReason(
  trigger: HandoffTrigger,
  context?: { isRefund?: boolean },
): EscalationReason {
  const mapped = TRIGGER_TO_ESCALATION_REASON_MAP[trigger];
  if (typeof mapped === "function") {
    return mapped(context);
  }
  return mapped;
}

/**
 * Default action_required strings from 06 §6.2
 * Distinguishes concrete next operator action from high-level reasoning (ai_recommendation).
 */
export const DEFAULT_ACTIONS_REQUIRED: Record<HandoffTrigger, string> = {
  EXPLICIT_HUMAN_REQUEST: "Customer asked for a person — reply as a person",
  COMPLEX_NEGOTIATION: "Approve or refuse the discount; listed price is in the briefing",
  COMPLAINT_OR_DISPUTE: "Respond personally; do not upsell",
  RETURN_OR_REFUND: "Decide return/refund against the policy window; AI has not approved or denied",
  CUSTOM_MODIFICATION: "Accept, refuse, or quote; nothing was priced by the AI",
  BULK_ORDER: "Confirm quantity and price; no wholesale figure was quoted",
  REPEATED_CONFUSION: "Read the last customer message and reply; AI could not classify twice",
  LOW_CONFIDENCE: "Read the last customer message and reply; AI could not classify intent",
  PAYMENT_FAILURE:
    "Verify whether payment was received; do not let the AI's last message stand as a receipt",
  STOCK_OUTAGE: "Resolve stock; customer may still want the original variant",
  OUT_OF_SCOPE: "Reply manually; the AI could not complete the turn",
  SENSITIVE_TOPIC: "Owner/Admin only; do not improvise a legal position",
  POLICY_CONFLICT: "Pick which rule wins; both are named in the summary",
  HIGH_VALUE_LEAD: "Priority handling; treat as relationship-critical",
  MANUAL_OVERRIDE: "Staff member intervened; manual takeover active",
};

export function getDefaultActionRequired(trigger: HandoffTrigger): string {
  return DEFAULT_ACTIONS_REQUIRED[trigger];
}

/**
 * Sanitizes and redacts sensitive PII from customer messages before persisting in summaries/notes.
 */
export function sanitizeCustomerMessageForHandoff(rawMessage?: string): string {
  if (!rawMessage) return "";
  let text = rawMessage.trim();
  // 1. Redact phone numbers (+216... or 8 digits)
  text = text.replace(/(\+?216\s*)?[2459]\d{7}/g, "[REDACTED_PHONE]");
  // 2. Redact email addresses
  text = text.replace(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]");
  // 3. Redact credit card / IBAN sequences (16 or 20 digits)
  text = text.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "[REDACTED_CARD]");
  return text.slice(0, 160);
}

/**
 * Event schema for conversation.handoff_triggered
 */
export const HandoffTriggeredEventSchema = z.object({
  conversationId: z.string(),
  businessId: z.string(),
  trigger: HandoffTriggerSchema,
  escalationReason: EscalationReasonSchema,
  priority: HandoffPrioritySchema,
  briefing: HandoffContextSchema,
  noteId: z.string().optional(),
  timestamp: z.string(),
});
export type HandoffTriggeredEvent = z.infer<typeof HandoffTriggeredEventSchema>;

/**
 * Rich trigger match item preserving fired trigger, weight, and reason details
 */
export const TriggerMatchItemSchema = z.object({
  trigger: HandoffTriggerSchema,
  priority: HandoffPrioritySchema,
  escalationReason: EscalationReasonSchema,
  reasonDetails: z.string(),
  weight: z.number(),
});
export type TriggerMatchItem = z.infer<typeof TriggerMatchItemSchema>;

/**
 * Trigger match outcome schema
 */
export const TriggerMatchResultSchema = z.object({
  matched: z.boolean(),
  trigger: HandoffTriggerSchema.optional(),
  priority: HandoffPrioritySchema.optional(),
  escalationReason: EscalationReasonSchema.optional(),
  reasonDetails: z.string().optional(),
  alsoMatched: z.array(HandoffTriggerSchema).default([]),
  allMatches: z.array(TriggerMatchItemSchema).default([]),
});
export type TriggerMatchResult = z.infer<typeof TriggerMatchResultSchema>;

export {
  HandoffContextSchema,
  type HandoffContext,
  HandoffCustomerSchema,
  HandoffProductDiscussedSchema,
  HandoffPendingOrderSchema,
  HandoffConfidenceSourceSchema,
  type HandoffConfidenceSource,
  CanonicalIntentSchema,
  type CanonicalIntent,
  CollectedFieldSchema,
  type CollectedField,
};
