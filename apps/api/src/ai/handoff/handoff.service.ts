import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Conversation, ConversationNote, HandoffPriority, PrismaClient } from "@prisma/client";

import {
  type EscalationReason,
  type HandoffConfidenceSource,
  type HandoffContext,
  type HandoffTrigger,
  type HandoffTriggeredEvent,
  type TriggerMatchResult,
  CanonicalIntentSchema,
  type CanonicalIntent,
  type Channel,
  type LifecycleStage,
  type RuleType,
  getHandoffTriggerPriority,
  mapTriggerToEscalationReason,
} from "@app/shared";

import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { BriefingGeneratorService, type GenerateBriefingInput } from "./briefing-generator.service";

export interface HandoffEvaluationContext {
  message?: string;
  intent?: CanonicalIntent;
  confidence?: number;
  confidenceSource?: HandoffConfidenceSource | null;
  consecutiveLowConfidence?: number;
  customer?: {
    id?: string;
    name?: string | null;
    phone?: string | null;
    channel?: Channel;
    lifecycle_stage?: LifecycleStage;
    tags?: string[];
  };
  businessRules?: {
    rule_type: RuleType;
    payload?: unknown;
  }[];
  aiSettings?: {
    blocked_topics?: string[];
    confidence_threshold?: number;
    vip_auto_handoff?: boolean;
    bulk_threshold_quantity?: number;
    bulk_threshold_amount?: number;
  };
  cart?: {
    items?: {
      quantity: number;
      unit_price?: number;
      product_name?: string;
      variant_name?: string;
    }[];
    totalAmount?: number;
  };
  stockAvailable?: boolean;
  reservationFailed?: boolean;
  outOfScope?: boolean;
  integrationError?: boolean;
  policyConflict?: boolean;
  manualOverride?: boolean;
  isRefund?: boolean;
}

export interface ExecuteHandoffParams {
  businessId: string;
  conversationId: string;
  trigger: HandoffTrigger;
  evaluationContext?: HandoffEvaluationContext;
  customBriefing?: Partial<GenerateBriefingInput>;
}

export interface HandoffExecutionResult {
  conversation: Conversation;
  briefing: HandoffContext;
  note: ConversationNote | null;
  event: HandoffTriggeredEvent;
}

export interface RealtimeEmitter {
  emitToTenant(businessId: string, event: string, payload: unknown): void;
  emitToConversation(conversationId: string, event: string, payload: unknown): void;
}

@Injectable()
export class HandoffService {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly briefingGenerator: BriefingGeneratorService,
    @Optional() prismaClient?: PrismaClient,
    @Optional() private readonly realtimeGateway?: RealtimeEmitter,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Evaluates all 15 canonical handoff triggers against the turn context.
   * Uses priority weighting and arbitration when multiple triggers match.
   */
  evaluateTriggers(context: HandoffEvaluationContext): TriggerMatchResult {
    const matches: {
      trigger: HandoffTrigger;
      priority: "critical" | "high" | "normal";
      escalationReason: EscalationReason;
      reasonDetails: string;
      weight: number;
    }[] = [];

    const msg = (context.message ?? "").trim();
    const intent = context.intent ?? "";
    const confidence = context.confidence;
    const aiSettings = context.aiSettings ?? {};

    // 1. MANUAL_OVERRIDE (high - explicit staff intervention takes precedence)
    if (context.manualOverride) {
      matches.push({
        trigger: "MANUAL_OVERRIDE",
        priority: "high",
        escalationReason: "human_request",
        reasonDetails: "Explicit manual staff intervention override",
        weight: 50,
      });
    }

    // 2. SENSITIVE_TOPIC (critical)
    const blockedTopics = aiSettings.blocked_topics ?? [];
    const isBlockedTopic = blockedTopics.some(
      (topic) => topic.trim() && msg.toLowerCase().includes(topic.toLowerCase().trim()),
    );
    const sensitiveRegex =
      /\b(lawyer|avocat|police|court|tribunal|poursuite|sue you|juridique|gdpr|rgpd|harassment|harcelement|insult)\b/i;
    if (isBlockedTopic || (msg && sensitiveRegex.test(msg))) {
      matches.push({
        trigger: "SENSITIVE_TOPIC",
        priority: "critical",
        escalationReason: "legal_sensitive",
        reasonDetails: isBlockedTopic
          ? "Message matches merchant blocked topics"
          : "Message contains legal/sensitive keywords",
        weight: 35,
      });
    }

    // 3. COMPLAINT_OR_DISPUTE (critical)
    const complaintRegex =
      /\b(arnaque|voleur|ser9a|scam|fraud|police|plainte|complaint|unacceptable|service khayeb|furious|terrible service|dispute)\b/i;
    if (intent === "complaint" || (msg && complaintRegex.test(msg))) {
      matches.push({
        trigger: "COMPLAINT_OR_DISPUTE",
        priority: "critical",
        escalationReason: "complaint",
        reasonDetails: "Customer expressed anger, complaint, or dispute",
        weight: 34,
      });
    }

    // 4. PAYMENT_FAILURE (critical)
    const paymentRegex =
      /\b(virement|khallast|deja paye|déjà payé|already paid|proof of payment|recu|reçu|screenshot|card failed|payment failed|echec paiement|twice|double debit)\b/i;
    if (msg && paymentRegex.test(msg)) {
      matches.push({
        trigger: "PAYMENT_FAILURE",
        priority: "critical",
        escalationReason: "payment_issue",
        reasonDetails: "Customer reported payment dispute or unverified payment confirmation",
        weight: 33,
      });
    }

    // 5. HIGH_VALUE_LEAD (critical when vip_auto_handoff enabled)
    const isVip =
      context.customer?.lifecycle_stage === "vip" ||
      context.customer?.tags?.includes("vip") ||
      false;
    if (isVip && aiSettings.vip_auto_handoff !== false) {
      matches.push({
        trigger: "HIGH_VALUE_LEAD",
        priority: "critical",
        escalationReason: "vip_customer",
        reasonDetails: "VIP / high-LTV customer auto-handoff enabled",
        weight: 32,
      });
    }

    // 6. OUT_OF_SCOPE (critical)
    const outOfScopeRegex = /\b(integration_failure|api error|service unavailable|out of scope)\b/i;
    if (context.outOfScope || context.integrationError || (msg && outOfScopeRegex.test(msg))) {
      matches.push({
        trigger: "OUT_OF_SCOPE",
        priority: "critical",
        escalationReason: "integration_failure",
        reasonDetails: "Integration error or unsupported capability outside AI scope",
        weight: 31,
      });
    }

    // 7. EXPLICIT_HUMAN_REQUEST (high)
    const humanRegex =
      /\b(agent|responsable|insan|bachar|humain|khdem|n7eb n7ki m3a|nheb nehki maa|kalemli|rabbi yehdik|human|person|representative|operator|manager|supervisor|support|parler à quelqu'un|parler a quelqu'un|service client|conseiller)\b/i;
    if (intent === "human_request" || (msg && humanRegex.test(msg))) {
      matches.push({
        trigger: "EXPLICIT_HUMAN_REQUEST",
        priority: "high",
        escalationReason: "human_request",
        reasonDetails: "Customer explicitly requested a human agent",
        weight: 25,
      });
    }

    // 8. RETURN_OR_REFUND (critical if refund, high if return)
    const refundRegex = /\b(remboursement|refund|money back|flousi|rajja3li)\b/i;
    const returnRegex = /\b(return|retour|échange|echange|swap size|change size)\b/i;
    const isRefund =
      context.isRefund || (msg && refundRegex.test(msg)) || (intent as string) === "refund_request";
    const isReturn = (msg && returnRegex.test(msg)) || intent === "return_inquiry";
    if (isRefund || isReturn) {
      const priority = isRefund ? "critical" : "high";
      matches.push({
        trigger: "RETURN_OR_REFUND",
        priority,
        escalationReason: isRefund ? "refund_request" : "return_exchange",
        reasonDetails: isRefund
          ? "Customer requested refund/reimbursement"
          : "Customer requested return/exchange",
        weight: isRefund ? 33 : 23,
      });
    }

    // 9. COMPLEX_NEGOTIATION (high)
    const negotiationRegex =
      /\b(remise|rabais|discount|prix ami|soum behy|a3melli soum|tan9is|n9asli|promo code|reduction|réduction)\b/i;
    const hasDiscountRule = context.businessRules?.some((r) => r.rule_type === "discount");
    if (
      (msg && negotiationRegex.test(msg)) ||
      (intent === "discount_inquiry" && !hasDiscountRule)
    ) {
      matches.push({
        trigger: "COMPLEX_NEGOTIATION",
        priority: "high",
        escalationReason: "negotiation",
        reasonDetails: "Customer requested price discount outside standard catalog rules",
        weight: 24,
      });
    }

    // 10. BULK_ORDER (high)
    const bulkQuantityThreshold = aiSettings.bulk_threshold_quantity ?? 5;
    const bulkAmountThreshold = aiSettings.bulk_threshold_amount ?? 500;
    const bulkRegex = /\b(en gros|gros|wholesale|bulk|barcha pices)\b/i;
    const hasBulkCartQty =
      context.cart?.items?.some((i) => i.quantity >= bulkQuantityThreshold) ?? false;
    const hasBulkCartTotal = (context.cart?.totalAmount ?? 0) >= bulkAmountThreshold;
    if (hasBulkCartQty || hasBulkCartTotal || (msg && bulkRegex.test(msg))) {
      matches.push({
        trigger: "BULK_ORDER",
        priority: "high",
        escalationReason: "bulk_order",
        reasonDetails: `Bulk quantity or order amount exceeding threshold (${bulkQuantityThreshold} units / ${bulkAmountThreshold} DT)`,
        weight: 22,
      });
    }

    // 11. CUSTOM_MODIFICATION (high)
    const customRegex =
      /\b(sur mesure|custom|modification|khyata|ala 9yasi|tailor made|bespoke|gravure|engraving)\b/i;
    if (msg && customRegex.test(msg)) {
      matches.push({
        trigger: "CUSTOM_MODIFICATION",
        priority: "high",
        escalationReason: "custom_order",
        reasonDetails: "Customer requested custom tailoring or out-of-catalog modification",
        weight: 21,
      });
    }

    // 12. STOCK_OUTAGE (high)
    const stockOutageRegex = /\b(rupture|wfe el stock|out of stock|hors stock|epuise|épuisé)\b/i;
    if (
      context.stockAvailable === false ||
      context.reservationFailed === true ||
      (msg && stockOutageRegex.test(msg))
    ) {
      matches.push({
        trigger: "STOCK_OUTAGE",
        priority: "high",
        escalationReason: "inventory_conflict",
        reasonDetails: "Stock unavailable or inventory reservation failure",
        weight: 21,
      });
    }

    // 13. POLICY_CONFLICT (normal)
    if (context.policyConflict) {
      matches.push({
        trigger: "POLICY_CONFLICT",
        priority: "normal",
        escalationReason: "policy_conflict",
        reasonDetails: "Contradictory business rules detected across promotion and delivery",
        weight: 12,
      });
    }

    // 14. REPEATED_CONFUSION (normal)
    const confusionRegex =
      /\b(ma fhemt chay|mouch heka|you don't understand|tu ne comprends rien|what are you saying|n'importe quoi)\b/i;
    const hasConsecutiveConfusion = (context.consecutiveLowConfidence ?? 0) >= 2;
    if (hasConsecutiveConfusion || (msg && confusionRegex.test(msg))) {
      matches.push({
        trigger: "REPEATED_CONFUSION",
        priority: "normal",
        escalationReason: "low_confidence",
        reasonDetails: "Customer indicated repeated confusion or multiple unclassified turns",
        weight: 11,
      });
    }

    // 15. LOW_CONFIDENCE (normal)
    const threshold = aiSettings.confidence_threshold ?? 0.65;
    const isLowConfidence =
      (confidence !== undefined && confidence < threshold) || intent === "unknown";
    if (isLowConfidence) {
      matches.push({
        trigger: "LOW_CONFIDENCE",
        priority: "normal",
        escalationReason: "low_confidence",
        reasonDetails: `Confidence (${confidence ?? 0}) below threshold (${threshold})`,
        weight: 10,
      });
    }

    if (matches.length === 0) {
      return {
        matched: false,
        alsoMatched: [],
        allMatches: [],
      };
    }

    // Sort by weight descending: higher priority wins; specific reason wins over low confidence
    matches.sort((a, b) => b.weight - a.weight);

    const winner = matches[0];
    if (!winner) {
      return {
        matched: false,
        alsoMatched: [],
        allMatches: [],
      };
    }

    const alsoMatched = matches.slice(1).map((m) => m.trigger);

    return {
      matched: true,
      trigger: winner.trigger,
      priority: winner.priority,
      escalationReason: winner.escalationReason,
      reasonDetails: winner.reasonDetails,
      alsoMatched,
      allMatches: matches,
    };
  }

  /**
   * Executes AI-to-Human handoff transition:
   * 1. Sets conversation.ai_enabled = false
   * 2. Sets status = HUMAN_REQUIRED
   * 3. Persists briefing JSON in handoff_context
   * 4. Inserts ConversationStatusEvent
   * 5. Inserts ConversationNote (briefing system note)
   * 6. Emits conversation.handoff_triggered event
   */
  async executeHandoff(params: ExecuteHandoffParams): Promise<HandoffExecutionResult> {
    const { businessId, conversationId, trigger, evaluationContext, customBriefing } = params;

    // Multi-tenant scoped fetch
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        business_id: businessId,
      },
      include: {
        customer: true,
        channel_account: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found for business ${businessId}`,
      );
    }

    // 🛡️ Canonical mapping is authoritative (06 §4 & §5).
    // Custom overrides are only accepted if explicitly supplied on manual override paths.
    const isManualOverride =
      trigger === "MANUAL_OVERRIDE" || evaluationContext?.manualOverride === true;
    const canonicalPriority = getHandoffTriggerPriority(trigger, {
      isRefund: evaluationContext?.isRefund,
    });
    const canonicalEscalationReason = mapTriggerToEscalationReason(trigger, {
      isRefund: evaluationContext?.isRefund,
    });

    const priority: HandoffPriority =
      isManualOverride && customBriefing?.priority ? customBriefing.priority : canonicalPriority;

    const escalationReason: EscalationReason =
      isManualOverride && customBriefing?.escalationReason
        ? customBriefing.escalationReason
        : canonicalEscalationReason;

    // Derive customer channel safely
    const channelAccountChannel = conversation.channel_account?.channel;
    const conversationSource = conversation.source as "instagram" | "messenger" | "whatsapp";
    const channel = channelAccountChannel ?? conversationSource;

    // Generate compliant HandoffContext
    const customerLifecycleStage = conversation.customer.lifecycle_stage;

    let derivedAlsoMatched: (EscalationReason | HandoffTrigger)[] =
      customBriefing?.alsoMatched ?? [];
    if (derivedAlsoMatched.length === 0 && evaluationContext) {
      const evalResult = this.evaluateTriggers(evaluationContext);
      if (evalResult.matched && evalResult.alsoMatched.length > 0) {
        derivedAlsoMatched = evalResult.alsoMatched.map((t) => mapTriggerToEscalationReason(t));
      }
    }

    const rawIntent = evaluationContext?.intent ?? conversation.last_intent ?? "unknown";
    const parsedIntent = CanonicalIntentSchema.safeParse(rawIntent);
    const intent: CanonicalIntent = parsedIntent.success ? parsedIntent.data : "unknown";

    const derivedConfidenceSource: HandoffConfidenceSource | null =
      customBriefing?.confidenceSource !== undefined
        ? customBriefing.confidenceSource
        : evaluationContext?.confidenceSource !== undefined
          ? evaluationContext.confidenceSource
          : evaluationContext?.confidence !== undefined
            ? "unknown"
            : null;

    const briefingInput: GenerateBriefingInput = {
      customer: {
        id: conversation.customer_id,
        name: conversation.customer.name,
        phone: conversation.customer.phone,
        channel,
        lifecycle_stage: customerLifecycleStage,
      },
      trigger,
      escalationReason,
      priority,
      intent,
      confidence: evaluationContext?.confidence ?? null,
      confidenceSource: derivedConfidenceSource,
      lastMessage: evaluationContext?.message ?? conversation.last_message_preview ?? undefined,
      alsoMatched: derivedAlsoMatched,
      productsDiscussed: customBriefing?.productsDiscussed ?? [],
      collectedFields: customBriefing?.collectedFields ?? [],
      missingFields: customBriefing?.missingFields ?? [],
      pendingOrder: customBriefing?.pendingOrder ?? null,
      aiRecommendation: customBriefing?.aiRecommendation,
      actionRequired: customBriefing?.actionRequired,
      decisionTraceId: customBriefing?.decisionTraceId ?? null,
      customSummary: customBriefing?.customSummary,
    };

    const briefing = this.briefingGenerator.generateBriefing(briefingInput);
    const briefingNoteText = this.briefingGenerator.formatBriefingNote(briefing, trigger);

    const now = new Date();

    // 🔒 Atomic transaction with conditional state transition and idempotency guard
    const txResult = await this.prisma.$transaction(async (tx) => {
      // Re-fetch conversation state inside transaction to ensure atomicity
      const currentConv = await tx.conversation.findFirst({
        where: {
          id: conversationId,
          business_id: businessId,
        },
      });

      if (!currentConv) {
        throw new NotFoundException(
          `Conversation ${conversationId} not found for business ${businessId}`,
        );
      }

      const getLatestSystemNote = () =>
        tx.conversationNote.findFirst({
          where: {
            conversation_id: conversationId,
            business_id: businessId,
            author_user_id: "system",
          },
          orderBy: { created_at: "desc" },
        });

      // 🛡️ Idempotency check: If conversation is already HUMAN_REQUIRED, return existing state as a no-op
      if (currentConv.status === "HUMAN_REQUIRED") {
        logger.info(
          { conversationId, businessId },
          "Conversation already in HUMAN_REQUIRED status; skipping duplicate handoff execution",
        );
        const existingNote = await getLatestSystemNote();

        return {
          isNewTransition: false,
          conversation: currentConv,
          note: existingNote,
        };
      }

      const previousStatus = currentConv.status;

      // Atomic update with status guard (status != HUMAN_REQUIRED)
      const updateResult = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          business_id: businessId,
          status: { not: "HUMAN_REQUIRED" },
        },
        data: {
          ai_enabled: false, // 🛡️ Immediate pause: AI turns immediately halt
          status: "HUMAN_REQUIRED",
          escalation_reason: escalationReason,
          handoff_priority: priority,
          handoff_context: briefing,
          handoff_at: now,
        },
      });

      if (updateResult.count === 0) {
        logger.info(
          { conversationId, businessId },
          "Status guard prevented duplicate transition; returning existing state",
        );
        const existingConv = await tx.conversation.findFirst({
          where: {
            id: conversationId,
            business_id: businessId,
          },
        });
        const existingNote = await getLatestSystemNote();

        return {
          isNewTransition: false,
          conversation: existingConv ?? currentConv,
          note: existingNote,
        };
      }

      const [updatedConversation, statusEvent, note] = await Promise.all([
        tx.conversation.findFirstOrThrow({
          where: {
            id: conversationId,
            business_id: businessId,
          },
        }),
        tx.conversationStatusEvent.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            from_status: previousStatus,
            to_status: "HUMAN_REQUIRED",
            escalation_reason: escalationReason,
            actor_type: "system",
            is_test: conversation.is_test,
          },
        }),
        tx.conversationNote.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            author_user_id: "system",
            body: briefingNoteText,
          },
        }),
      ]);

      return {
        isNewTransition: true,
        conversation: updatedConversation,
        statusEvent,
        note,
      };
    });

    const savedBriefing = txResult.conversation.handoff_context
      ? (txResult.conversation.handoff_context as unknown as HandoffContext)
      : briefing;

    const eventPayload: HandoffTriggeredEvent = {
      conversationId,
      businessId,
      trigger,
      escalationReason,
      priority,
      briefing: savedBriefing,
      noteId: txResult.note?.id,
      timestamp: now.toISOString(),
    };

    // 📡 Emit realtime event ONLY when new transition occurred (idempotency: no duplicate events on retry)
    if (txResult.isNewTransition && this.realtimeGateway) {
      try {
        this.realtimeGateway.emitToTenant(
          businessId,
          "conversation.handoff_triggered",
          eventPayload,
        );
        this.realtimeGateway.emitToConversation(
          conversationId,
          "conversation.handoff_triggered",
          eventPayload,
        );
      } catch (err) {
        logger.warn({ err, conversationId, businessId }, "Failed to emit realtime handoff event");
      }
    }

    return {
      conversation: txResult.conversation,
      briefing: savedBriefing,
      note: txResult.note ?? null,
      event: eventPayload,
    };
  }
}
