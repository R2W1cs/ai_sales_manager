import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { LeadTemperature, PrismaClient } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

/**
 * 14 §10 & T-LEAD-01: Factor weights for deterministic lead scoring arithmetic.
 * Clamped to 0–100. Never computed by LLM.
 */
export const FACTOR_WEIGHTS = {
  // Card explicit contract weights
  product_inquiry: 15,
  price_question: 20,
  phone_shared: 25,
  cart_intent: 35,
  negative_sentiment: -20,

  // Spec 14 §10 System Design weights
  purchase_intent: 40,
  order_pending_confirmation: 30,
  availability_check: 15,
  customer_has_phone_or_address: 10,
  specific_variant_collected: 10,
  returning_customer: 10,
  vip_tag: 15,
  bulk_quantity: 10,
  recent_message: 5,
  inactive_48h: -20,
  inactivity_decay_24h: -10,
} as const;

export type FactorWeightKey = keyof typeof FACTOR_WEIGHTS;

export interface LeadScoringThresholds {
  hotMin?: number;
  warmMin?: number;
}

export interface LeadScoringResult {
  score: number;
  temperature: LeadTemperature;
  factors: Record<string, number>;
}

export interface LeadScoringSignals {
  productInquiry?: boolean;
  priceQuestion?: boolean;
  phoneShared?: boolean;
  cartIntent?: boolean;
  negativeSentiment?: boolean;
  purchaseIntent?: boolean;
  orderPendingConfirmation?: boolean;
  availabilityCheck?: boolean;
  customerHasPhoneOrAddress?: boolean;
  specificVariantCollected?: boolean;
  returningCustomer?: boolean;
  vipTag?: boolean;
  bulkQuantity?: boolean;
  recentMessage30Min?: boolean;
  inactive48Hours?: boolean;
  customFactors?: Record<string, number>;
}

export interface ScoreConversationOptions {
  resetToZero?: boolean;
}

@Injectable()
export class LeadScoringService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Derive temperature pill from numeric score (14 §10.2 / T-LEAD-01).
   * Default thresholds: HOT (>= 70), WARM (40-69), COLD (< 40).
   * When configured per business (FR-LEAD-005): hotMin / warmMin passed dynamically.
   */
  public getTemperature(score: number, hotMin = 70, warmMin = 40): LeadTemperature {
    if (score >= hotMin) {
      return "hot";
    }
    if (score >= warmMin) {
      return "warm";
    }
    return "cold";
  }

  /**
   * Compute deterministic lead score from raw applied factors.
   * Clamped strictly between 0 and 100 (FR-LEAD-001, FR-LEAD-002).
   */
  public computeScore(
    factors: Record<string, number>,
    thresholds?: LeadScoringThresholds,
  ): LeadScoringResult {
    const rawScore = Object.values(factors).reduce((acc, pts) => acc + pts, 0);
    const clampedScore = Math.max(0, Math.min(100, rawScore));
    const hotMin = thresholds?.hotMin ?? 70;
    const warmMin = thresholds?.warmMin ?? 40;
    const temperature = this.getTemperature(clampedScore, hotMin, warmMin);

    return {
      score: clampedScore,
      temperature,
      factors: { ...factors },
    };
  }

  /**
   * Helper to compute score directly from boolean signal flags.
   */
  public computeScoreFromSignals(
    signals: LeadScoringSignals,
    thresholds?: LeadScoringThresholds,
  ): LeadScoringResult {
    const factors: Record<string, number> = {};

    if (signals.productInquiry) factors.product_inquiry = FACTOR_WEIGHTS.product_inquiry;
    if (signals.priceQuestion) factors.price_question = FACTOR_WEIGHTS.price_question;
    if (signals.phoneShared) factors.phone_shared = FACTOR_WEIGHTS.phone_shared;
    if (signals.cartIntent) factors.cart_intent = FACTOR_WEIGHTS.cart_intent;
    if (signals.negativeSentiment) factors.negative_sentiment = FACTOR_WEIGHTS.negative_sentiment;
    if (signals.purchaseIntent) factors.purchase_intent = FACTOR_WEIGHTS.purchase_intent;
    if (signals.orderPendingConfirmation) {
      factors.order_pending_confirmation = FACTOR_WEIGHTS.order_pending_confirmation;
    }
    if (signals.availabilityCheck) factors.availability_check = FACTOR_WEIGHTS.availability_check;
    if (signals.customerHasPhoneOrAddress) {
      factors.customer_has_phone_or_address = FACTOR_WEIGHTS.customer_has_phone_or_address;
    }
    if (signals.specificVariantCollected) {
      factors.specific_variant_collected = FACTOR_WEIGHTS.specific_variant_collected;
    }
    if (signals.returningCustomer) factors.returning_customer = FACTOR_WEIGHTS.returning_customer;
    if (signals.vipTag) factors.vip_tag = FACTOR_WEIGHTS.vip_tag;
    if (signals.bulkQuantity) factors.bulk_quantity = FACTOR_WEIGHTS.bulk_quantity;
    if (signals.recentMessage30Min) factors.recent_message = FACTOR_WEIGHTS.recent_message;
    if (signals.inactive48Hours) factors.inactive_48h = FACTOR_WEIGHTS.inactive_48h;

    if (signals.customFactors) {
      Object.assign(factors, signals.customFactors);
    }

    return this.computeScore(factors, thresholds);
  }

  /**
   * Calculate 24h inactivity decay (-10 points after 24h customer inactivity).
   */
  public calculateDecay(
    currentScore: number,
    lastMessageAt: Date | string | null,
    now: Date = new Date(),
    inactivityHours = 24,
    decayPoints = 10,
  ): { decayedScore: number; pointsDecayed: number; isDecayed: boolean } {
    if (!lastMessageAt) {
      const pointsDecayed = Math.min(currentScore, decayPoints);
      return {
        decayedScore: Math.max(0, currentScore - decayPoints),
        pointsDecayed,
        isDecayed: pointsDecayed > 0,
      };
    }

    const lastMsgTime = new Date(lastMessageAt).getTime();
    const elapsedMs = now.getTime() - lastMsgTime;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    if (elapsedHours >= inactivityHours) {
      const pointsDecayed = Math.min(currentScore, decayPoints);
      return {
        decayedScore: Math.max(0, currentScore - decayPoints),
        pointsDecayed,
        isDecayed: pointsDecayed > 0,
      };
    }

    return {
      decayedScore: currentScore,
      pointsDecayed: 0,
      isDecayed: false,
    };
  }

  /**
   * Recompute lead score for a specific conversation in the database.
   * Enforces multi-tenant isolation (business_id).
   * Resets to 0 when status is RESOLVED or resetToZero is passed (FR-LEAD-006).
   */
  public async scoreConversation(
    businessId: string,
    conversationId: string,
    options?: ScoreConversationOptions,
  ): Promise<LeadScoringResult> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, business_id: businessId },
      include: {
        customer: {
          include: {
            tags: true,
          },
        },
      },
    });

    if (!conv) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found for business ${businessId}`,
      );
    }

    // FR-LEAD-006: Reset to 0 when conversation is RESOLVED or on order cancellation reset
    if (conv.status === "RESOLVED" || options?.resetToZero) {
      const resetResult: LeadScoringResult = {
        score: 0,
        temperature: "cold",
        factors: {},
      };

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lead_score: 0,
          lead_temperature: "cold",
          lead_score_factors: {},
          lead_scored_at: new Date(),
        },
      });

      return resetResult;
    }

    // Load business AI settings for configurable temperature thresholds (FR-LEAD-005)
    const aiSettings = await this.prisma.aiSettings.findUnique({
      where: { business_id: businessId },
    });
    const hotMin = aiSettings?.lead_hot_min ?? 70;
    const warmMin = aiSettings?.lead_warm_min ?? 40;

    // Check if an order in PENDING_CONFIRMATION exists for this conversation
    const pendingOrder = await this.prisma.order.findFirst({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
        status: "PENDING_CONFIRMATION",
      },
    });

    // Extract deterministic signals from conversation state & customer relations
    const factors: Record<string, number> = {};

    const intent = conv.last_intent?.toLowerCase().trim();
    if (intent === "purchase_intent") {
      factors.purchase_intent = FACTOR_WEIGHTS.purchase_intent;
    } else if (intent === "cart_intent") {
      factors.cart_intent = FACTOR_WEIGHTS.cart_intent;
    } else if (intent === "price_question") {
      factors.price_question = FACTOR_WEIGHTS.price_question;
    } else if (intent === "product_inquiry" || intent === "availability_check") {
      factors.product_inquiry = FACTOR_WEIGHTS.product_inquiry;
    }

    if (pendingOrder) {
      factors.order_pending_confirmation = FACTOR_WEIGHTS.order_pending_confirmation;
    }

    // Collected fields signals
    const collectedFields = Array.isArray(conv.collected_fields)
      ? (conv.collected_fields as string[])
      : [];

    if (collectedFields.includes("phone")) {
      factors.phone_shared = FACTOR_WEIGHTS.phone_shared;
    }
    if (collectedFields.includes("quantity")) {
      factors.bulk_quantity = FACTOR_WEIGHTS.bulk_quantity;
    }

    // Customer profile signals
    if (conv.customer.phone || conv.customer.address) {
      if (!factors.phone_shared) {
        factors.customer_has_phone_or_address = FACTOR_WEIGHTS.customer_has_phone_or_address;
      }
    }
    if (conv.customer.confirmed_order_count >= 1) {
      factors.returning_customer = FACTOR_WEIGHTS.returning_customer;
    }
    const isVip =
      conv.customer.lifecycle_stage === "vip" ||
      conv.customer.tags.some((t) => t.tag.toLowerCase() === "vip");
    if (isVip) {
      factors.vip_tag = FACTOR_WEIGHTS.vip_tag;
    }

    // Recency & inactivity timing signals
    if (conv.last_message_at) {
      const msSinceLastMessage = Date.now() - new Date(conv.last_message_at).getTime();
      const minsSinceLastMessage = msSinceLastMessage / (1000 * 60);
      const hoursSinceLastMessage = msSinceLastMessage / (1000 * 60 * 60);

      if (minsSinceLastMessage <= 30) {
        factors.recent_message = FACTOR_WEIGHTS.recent_message;
      } else if (hoursSinceLastMessage >= 48) {
        factors.inactive_48h = FACTOR_WEIGHTS.inactive_48h;
      }
    }

    const { score, temperature } = this.computeScore(factors, { hotMin, warmMin });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lead_score: score,
        lead_temperature: temperature,
        lead_score_factors: factors,
        lead_scored_at: new Date(),
      },
    });

    logger.info(
      { conversationId, businessId, score, temperature, factors },
      "Computed lead score for conversation",
    );

    return { score, temperature, factors };
  }

  /**
   * Apply nightly decay worker pass across inactive conversations (FR-LEAD-004 / T-LEAD-01).
   * Applies -10 points after 24h of customer inactivity on non-RESOLVED conversations with score > 0.
   */
  public async runNightlyDecay(
    businessId?: string,
  ): Promise<{ processed: number; decayed: number }> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        ...(businessId ? { business_id: businessId } : {}),
        status: { not: "RESOLVED" },
        lead_score: { gt: 0 },
        OR: [{ last_message_at: { lt: cutoff } }, { last_message_at: null }],
      },
      include: {
        business: {
          include: {
            ai_settings: true,
          },
        },
      },
    });

    const decayUpdates: Promise<unknown>[] = [];

    for (const conv of conversations) {
      const currentScore = conv.lead_score;
      const decayResult = this.calculateDecay(currentScore, conv.last_message_at);

      if (decayResult.isDecayed) {
        const hotMin = conv.business.ai_settings?.lead_hot_min ?? 70;
        const warmMin = conv.business.ai_settings?.lead_warm_min ?? 40;
        const newTemperature = this.getTemperature(decayResult.decayedScore, hotMin, warmMin);

        // Update factors record with decay factor
        const currentFactors =
          typeof conv.lead_score_factors === "object" && conv.lead_score_factors !== null
            ? (conv.lead_score_factors as Record<string, number>)
            : {};

        const updatedFactors: Record<string, number> = {
          ...currentFactors,
          inactivity_decay_24h:
            (currentFactors.inactivity_decay_24h ?? 0) - decayResult.pointsDecayed,
        };

        decayUpdates.push(
          this.prisma.conversation.update({
            where: { id: conv.id },
            data: {
              lead_score: decayResult.decayedScore,
              lead_temperature: newTemperature,
              lead_score_factors: updatedFactors,
              lead_scored_at: new Date(),
            },
          }),
        );
      }
    }

    if (decayUpdates.length > 0) {
      await Promise.all(decayUpdates);
    }
    const decayedCount = decayUpdates.length;

    logger.info(
      { businessId: businessId ?? "all", processed: conversations.length, decayed: decayedCount },
      "Nightly lead scoring decay run completed",
    );

    return {
      processed: conversations.length,
      decayed: decayedCount,
    };
  }
}
