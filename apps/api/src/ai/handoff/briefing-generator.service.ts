import { Injectable } from "@nestjs/common";

import {
  type EscalationReason,
  type HandoffContext,
  HandoffContextSchema,
  type HandoffPriority,
  type HandoffTrigger,
  HandoffTriggerSchema,
  type CanonicalIntent,
  CanonicalIntentSchema,
  type CollectedField,
  type HandoffConfidenceSource,
  getDefaultActionRequired,
  getHandoffTriggerPriority,
  mapTriggerToEscalationReason,
  sanitizeCustomerMessageForHandoff,
} from "@app/shared";

export interface GenerateBriefingInput {
  customer: {
    id: string;
    name?: string | null;
    phone?: string | null;
    channel: "instagram" | "messenger" | "whatsapp";
    lifecycle_stage:
      | "unknown_visitor"
      | "interested"
      | "qualified_lead"
      | "order_pending"
      | "customer"
      | "returning_customer"
      | "vip";
  };
  trigger: HandoffTrigger;
  escalationReason?: EscalationReason;
  priority?: HandoffPriority;
  intent?: CanonicalIntent;
  confidence?: number | null;
  confidenceSource?: HandoffConfidenceSource | null;
  lastMessage?: string;
  productsDiscussed?: {
    product_id: string;
    variant_id: string;
    name: string;
    sku?: string | null;
    price: number;
    currency: string;
  }[];
  collectedFields?: CollectedField[];
  missingFields?: CollectedField[];
  pendingOrder?: {
    id: string;
    amount: number;
    currency: string;
    item_count: number;
  } | null;
  aiRecommendation?: string;
  actionRequired?: string;
  alsoMatched?: (EscalationReason | HandoffTrigger)[];
  decisionTraceId?: string | null;
  evaluatorVersion?: string;
  customSummary?: string;
}

@Injectable()
export class BriefingGeneratorService {
  /**
   * Generates a schema_version: 1 HandoffContext object validated by HandoffContextSchema.
   * Uses deterministic fallback template if no external LLM summary is provided.
   */
  generateBriefing(input: GenerateBriefingInput): HandoffContext {
    const trigger = input.trigger;
    const priority: HandoffPriority = input.priority ?? getHandoffTriggerPriority(trigger);
    const escalationReason: EscalationReason =
      input.escalationReason ?? mapTriggerToEscalationReason(trigger);

    const parsedIntent = CanonicalIntentSchema.safeParse(input.intent);
    const intent: CanonicalIntent = parsedIntent.success ? parsedIntent.data : "unknown";

    // 🔒 Invariant: Never default missing confidence to 1.0; preserve null when unscored
    const confidence =
      typeof input.confidence === "number" && !Number.isNaN(input.confidence)
        ? Math.min(1, Math.max(0, input.confidence))
        : null;

    const summary =
      input.customSummary && input.customSummary.trim().length > 0
        ? input.customSummary.trim()
        : this.buildFallbackSummary(input);

    const actionRequired =
      input.actionRequired && input.actionRequired.trim().length > 0
        ? input.actionRequired.trim()
        : getDefaultActionRequired(trigger);

    const aiRecommendation =
      input.aiRecommendation && input.aiRecommendation.trim().length > 0
        ? input.aiRecommendation.trim()
        : this.buildDefaultAiRecommendation(trigger, input);

    const alsoMatchedEscalations: EscalationReason[] = (input.alsoMatched ?? []).map((item) => {
      const parsed = HandoffTriggerSchema.safeParse(item);
      if (parsed.success) {
        return mapTriggerToEscalationReason(parsed.data);
      }
      return item as EscalationReason;
    });

    // "unknown" instead of "llm" to avoid silently mis-attributing scores from
    // rule-based or hybrid classifiers. Callers that know the source must pass it explicitly.
    const confidenceSource: HandoffConfidenceSource | null =
      confidence !== null ? (input.confidenceSource ?? "unknown") : null;

    const rawContext = {
      schema_version: 1 as const,
      customer: {
        id: input.customer.id,
        name: input.customer.name ?? null,
        phone: input.customer.phone ?? null,
        channel: input.customer.channel,
        lifecycle_stage: input.customer.lifecycle_stage,
      },
      summary,
      intent,
      confidence,
      confidence_source: confidenceSource,
      products_discussed: input.productsDiscussed ?? [],
      collected_fields: input.collectedFields ?? [],
      missing_fields: input.missingFields ?? [],
      ai_recommendation: aiRecommendation,
      action_required: actionRequired,
      escalation_reason: escalationReason,
      handoff_priority: priority,
      also_matched: alsoMatchedEscalations,
      pending_order: input.pendingOrder ?? null,
      decision_trace_id: input.decisionTraceId ?? null,
      evaluator_version: input.evaluatorVersion ?? "1.0.0",
    };

    return HandoffContextSchema.parse(rawContext);
  }

  /**
   * Formats a structured markdown briefing note for the conversation timeline.
   */
  formatBriefingNote(briefing: HandoffContext, trigger?: HandoffTrigger): string {
    const triggerLabel = trigger ?? briefing.escalation_reason.toUpperCase();
    const customerName = briefing.customer.name || "Customer";
    const customerContact = briefing.customer.phone
      ? `(${briefing.customer.phone})`
      : `[${briefing.customer.channel}]`;

    const confidenceLabel =
      briefing.confidence !== null
        ? `${Math.round(briefing.confidence * 100)}% confidence`
        : "unscored";

    const lines: string[] = [
      `📋 **AI-to-Human Handoff Briefing**`,
      `• **Trigger**: \`${triggerLabel}\` (Escalation Reason: \`${briefing.escalation_reason}\`, Priority: \`${briefing.handoff_priority.toUpperCase()}\`)`,
      `• **Customer**: ${customerName} ${customerContact} — Stage: \`${briefing.customer.lifecycle_stage}\``,
      `• **Intent**: \`${briefing.intent}\` (${confidenceLabel})`,
      `• **Action Required**: ${briefing.action_required}`,
      `• **Summary**: ${briefing.summary}`,
      `• **AI Recommendation**: ${briefing.ai_recommendation}`,
    ];

    if (briefing.pending_order) {
      lines.push(
        `• **Pending Order**: ID \`${briefing.pending_order.id}\`, ${briefing.pending_order.amount} ${briefing.pending_order.currency} (${briefing.pending_order.item_count} items)`,
      );
    }

    if (briefing.products_discussed.length > 0) {
      const prods = briefing.products_discussed
        .map((p) => `${p.name} (${p.price} ${p.currency})`)
        .join(", ");
      lines.push(`• **Products Discussed**: ${prods}`);
    }

    if (briefing.also_matched.length > 0) {
      lines.push(`• **Also Matched**: ${briefing.also_matched.join(", ")}`);
    }

    return lines.join("\n");
  }

  private buildFallbackSummary(input: GenerateBriefingInput): string {
    const name = input.customer.name || `Customer (ID: ${input.customer.id.slice(0, 6)})`;
    const channel = input.customer.channel;
    const trigger = input.trigger;
    const action =
      input.actionRequired && input.actionRequired.trim().length > 0
        ? input.actionRequired.trim()
        : getDefaultActionRequired(trigger);

    const triggerActions: Record<HandoffTrigger, string> = {
      EXPLICIT_HUMAN_REQUEST: "requested to speak directly with a human agent",
      COMPLEX_NEGOTIATION: "requested custom pricing or discount outside standard rules",
      COMPLAINT_OR_DISPUTE: "raised a complaint or dispute requiring staff intervention",
      RETURN_OR_REFUND: "requested return, refund, or item exchange",
      CUSTOM_MODIFICATION: "requested bespoke tailoring or custom product modification",
      BULK_ORDER: "inquired about bulk or wholesale order pricing and quantity",
      REPEATED_CONFUSION: "experienced repeated confusion during automated conversation",
      LOW_CONFIDENCE: "sent an inquiry with low automated classification confidence",
      PAYMENT_FAILURE: "reported payment confirmation or bank transfer issue",
      STOCK_OUTAGE: "encountered stock outage or reservation conflict",
      OUT_OF_SCOPE: "requested capabilities outside automated AI scope",
      SENSITIVE_TOPIC: "mentioned sensitive legal or regulatory topic requiring staff review",
      POLICY_CONFLICT: "encountered conflicting store policies or promotions",
      HIGH_VALUE_LEAD: "identified as a VIP customer requiring dedicated handling",
      MANUAL_OVERRIDE: "was taken over via manual staff intervention",
    };

    const actionText = triggerActions[trigger];
    const parts: string[] = [`${name} on ${channel} ${actionText} [${trigger}].`];

    if (input.productsDiscussed && input.productsDiscussed.length > 0) {
      const prodList = input.productsDiscussed
        .map((p) => (p.sku ? `${p.name} (${p.sku})` : p.name))
        .join(", ");
      parts.push(`Product: ${prodList}.`);
    } else if (input.pendingOrder) {
      parts.push(
        `Pending Order: ${input.pendingOrder.id} (${input.pendingOrder.amount} ${input.pendingOrder.currency}, ${input.pendingOrder.item_count} items).`,
      );
    }

    if (input.lastMessage) {
      const sanitized = sanitizeCustomerMessageForHandoff(input.lastMessage);
      if (sanitized) {
        parts.push(`Last message: "${sanitized.slice(0, 100)}".`);
      }
    }

    parts.push(`Action: ${action}.`);

    return parts.join(" ").trim();
  }

  private buildDefaultAiRecommendation(
    trigger: HandoffTrigger,
    _input?: GenerateBriefingInput,
  ): string {
    switch (trigger) {
      case "EXPLICIT_HUMAN_REQUEST":
        return "Connect immediately and greet the customer politely without sales pressure.";
      case "COMPLEX_NEGOTIATION":
        return "Review customer requested discount against current sales promotions and margins.";
      case "COMPLAINT_OR_DISPUTE":
        return "Acknowledge frustration with empathy; do not attempt upselling or automated replies.";
      case "RETURN_OR_REFUND":
        return "Verify return policy eligibility and inspect customer order history.";
      case "CUSTOM_MODIFICATION":
        return "Assess requested bespoke modification feasibility and provide quote.";
      case "BULK_ORDER":
        return "Calculate wholesale volume discount and confirm delivery timeline.";
      case "REPEATED_CONFUSION":
      case "LOW_CONFIDENCE":
        return "Clarify customer needs directly in simple, clear terms.";
      case "PAYMENT_FAILURE":
        return "Verify bank receipt / payment status in financial records; do not confirm receipt blindly.";
      case "STOCK_OUTAGE":
        return "Check restock schedule or propose closest available catalogue alternatives.";
      case "OUT_OF_SCOPE":
        return "Assist customer manually with request outside automated agent scope.";
      case "SENSITIVE_TOPIC":
        return "Escalate to admin / manager; adhere strictly to company policy.";
      case "POLICY_CONFLICT":
        return "Resolve rule conflict between promotional and delivery constraints.";
      case "HIGH_VALUE_LEAD":
        return "Prioritize VIP inquiry with dedicated personal service.";
      case "MANUAL_OVERRIDE":
        return "Staff takeover active. AI responses paused.";
      default:
        return "Review conversation history and respond to customer.";
    }
  }
}
