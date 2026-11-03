import { Injectable, Optional } from "@nestjs/common";
import { z } from "zod";

import {
  type CanonicalIntent,
  type ExtractedEntities,
  type IntentClassification,
  IntentClassificationSchema,
  CanonicalIntentSchema,
} from "@app/shared";

import { logger } from "../../lib/logger";
import { AiGatewayService, resolveGatewayModelId } from "../gateway/ai-gateway.service";
import { extractRuleEntities, normalizeMessage } from "./rule-intent-classifier";

export const CLASSIFIER_MODEL = "gpt-5.6-luna";

const IntentClassifierLlmOutputSchema = z.object({
  intent: CanonicalIntentSchema,
  confidence: z.number().min(0).max(1),
  secondary: z.array(CanonicalIntentSchema),
  entities: z.object({
    product: z.string().nullable(),
    variant: z.string().nullable(),
    size: z.string().nullable(),
    color: z.string().nullable(),
    quantity: z.number().nullable(),
    orderReference: z.string().nullable(),
    location: z.string().nullable(),
  }),
});

export const INTENT_CLASSIFIER_SYSTEM_PROMPT = `You are a high-speed, structured Intent Classifier for an e-commerce AI Sales Assistant operating in Tunisia.
Your task is to classify customer inquiries across Tunisian Arabizi (Latin script with numbers: 3=ع, 7=ح, 5=خ, 9=ق), Tunisian Arabic in Arabic script, French, English, and code-switching.

Canonical 13 Intents:
1. "greeting": Hello, welcome, introductory pleasantries (e.g., "3aslema", "slem", "bonjour").
2. "product_inquiry": Features, sizing, details, colors, catalog queries for store products (e.g., "robe noire", "fiche produit").
3. "stock_check": Availability, size/color in stock (e.g., "famma taille M?", "disponible?").
4. "price_question": Asking for price or costs of store items (e.g., "b9adech?", "9addeh soum?", "combien ça coûte?").
5. "delivery_inquiry": Store shipping cost, store delivery timeframe, store regional coverage (e.g., "twaslou l Sousse?", "frais de livraison?").
6. "payment_inquiry": Payment methods, cash on delivery, card payment (e.g., "kifech n5ales?", "paiement à la livraison?").
7. "return_inquiry": Return, exchange, refund policies (e.g., "tbaddlou?", "politique de retour?").
8. "discount_inquiry": Promo codes, discounts, bulk price reduction (e.g., "famma promo?", "code promo?", "tna9asli?").
9. "purchase_intent": Explicit desire to buy or place an order with this store (e.g., "nheb nechri", "nvalidi", "passer commande").
10. "order_status": Tracking existing orders, package status with this store (e.g., "win woslet el commande?", "statut commande?").
11. "complaint": Customer dissatisfaction, damaged items, anger, late delivery (e.g., "reclamation", "mouch behi", "khed3ouni").
12. "human_request": Explicit request to talk to a human manager/agent/staff (e.g., "choufli 3abd", "nkalem 3abd", "parler à un humain", "conseiller").
13. "unknown": Out-of-domain questions, unrelated services (e.g., repairing electronics/phones, car dealerships, weather, public post office hours, external questions unrelated to buying products from this store), or unintelligible input.

CRITICAL INSTRUCTIONS:
- If a message asks about services or products completely unrelated to the store (e.g. car sales, repairing phones, weather, public administration/post office hours), classify as "unknown".
- Return ONLY a valid JSON object matching the requested schema.
- NEVER invent customer replies, business facts, prices, or inventory counts.
- Identify primary intent and confidence (0.0 to 1.0).
- If multiple intents are present, list other intents in "secondary".
- Extract explicit entities if mentioned: product, variant, size, color, quantity, orderReference, location (use null for any unmentioned entity).`;

@Injectable()
export class LlmIntentClassifierService {
  private readonly aiGateway: AiGatewayService;

  constructor(@Optional() aiGateway?: AiGatewayService) {
    this.aiGateway = aiGateway ?? new AiGatewayService();
  }

  /**
   * Classify inbound message using structured LLM via Vercel AI SDK + AI Gateway.
   */
  async classify(text: string): Promise<IntentClassification> {
    const startTime = Date.now();
    const normalized = normalizeMessage(text);

    if (!normalized) {
      return {
        intent: "unknown",
        confidence: 0,
        secondary: [],
        entities: {},
        source: "llm",
        latencyMs: Date.now() - startTime,
        model: CLASSIFIER_MODEL,
      };
    }

    // Call Vercel AI SDK + AI Gateway with structured output if Gateway is configured
    if (this.aiGateway.isConfigured()) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per 11 §9.6

        const result = await this.aiGateway.generateStructured<
          z.infer<typeof IntentClassifierLlmOutputSchema>
        >({
          model: CLASSIFIER_MODEL,
          schema: IntentClassifierLlmOutputSchema,
          system: INTENT_CLASSIFIER_SYSTEM_PROMPT,
          prompt: text,
          temperature: 0,
          maxTokens: 200,
          abortSignal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (result?.object) {
          const rawEntities = result.object.entities;
          const cleanedEntities: ExtractedEntities = {};
          if (rawEntities.product) cleanedEntities.product = rawEntities.product;
          if (rawEntities.variant) cleanedEntities.variant = rawEntities.variant;
          if (rawEntities.size) cleanedEntities.size = rawEntities.size;
          if (rawEntities.color) cleanedEntities.color = rawEntities.color;
          if (typeof rawEntities.quantity === "number")
            cleanedEntities.quantity = rawEntities.quantity;
          if (rawEntities.orderReference)
            cleanedEntities.orderReference = rawEntities.orderReference;
          if (rawEntities.location) cleanedEntities.location = rawEntities.location;

          const validated = IntentClassificationSchema.safeParse({
            intent: result.object.intent,
            confidence: result.object.confidence,
            secondary: result.object.secondary,
            entities: cleanedEntities,
            source: "llm",
            latencyMs: Date.now() - startTime,
            model: resolveGatewayModelId(CLASSIFIER_MODEL),
          });

          if (validated.success) {
            return validated.data;
          }
        }
      } catch (err) {
        logger.warn({ err }, "LLM intent classifier call failed; falling back to offline logic");
      }
    }

    // Offline / test fallback classification
    return this.classifyDeterministicFallback(text, startTime);
  }

  /**
   * Deterministic semantic heuristic fallback for testing & offline mode.
   * Phrase lists stay in declaration order so the first match wins, matching
   * the previous else-if chain.
   */
  private classifyDeterministicFallback(text: string, startTime: number): IntentClassification {
    const lower = normalizeMessage(text);
    const matched = matchFallbackIntent(lower);

    return {
      intent: matched.intent,
      confidence: matched.confidence,
      secondary: matched.secondary,
      entities: extractRuleEntities(lower),
      source: "llm",
      latencyMs: Date.now() - startTime,
      model: CLASSIFIER_MODEL,
    };
  }
}

interface FallbackRule {
  intent: CanonicalIntent;
  confidence: number;
  phrases: readonly string[];
  secondary?: { intent: CanonicalIntent; phrases: readonly string[] };
}

const FALLBACK_RULES: readonly FallbackRule[] = [
  {
    intent: "human_request",
    confidence: 0.95,
    phrases: ["personne", "humain", "3abd", "responsable"],
  },
  {
    intent: "complaint",
    confidence: 0.92,
    phrases: ["reclamation", "mouch behi", "khed3ouni", "defectueux"],
  },
  {
    intent: "purchase_intent",
    confidence: 0.9,
    phrases: ["nechri", "commander", "validi", "acheter"],
  },
  { intent: "return_inquiry", confidence: 0.88, phrases: ["retour", "baddel", "échange"] },
  { intent: "delivery_inquiry", confidence: 0.88, phrases: ["livraison", "delivery", "twaslou"] },
  { intent: "order_status", confidence: 0.88, phrases: ["suivi", "woslet", "commande mte3i"] },
  {
    intent: "discount_inquiry",
    confidence: 0.85,
    phrases: ["promo", "remise", "reduction", "solde"],
  },
  {
    intent: "payment_inquiry",
    confidence: 0.85,
    phrases: ["kifech n5ales", "paiement", "espece", "carte"],
  },
  {
    intent: "stock_check",
    confidence: 0.82,
    phrases: ["dispo", "stock", "famma", "mawjoud"],
    secondary: { intent: "price_question", phrases: ["prix", "9addeh", "soum"] },
  },
  {
    intent: "price_question",
    confidence: 0.82,
    phrases: ["prix", "combien", "9addeh", "b9adech", "soum"],
    secondary: { intent: "stock_check", phrases: ["dispo", "taille"] },
  },
  { intent: "product_inquiry", confidence: 0.8, phrases: ["robe", "hoodie", "modele", "article"] },
  {
    intent: "greeting",
    confidence: 0.85,
    phrases: ["3aslema", "bonjour", "salut", "salam", "ahla"],
  },
];

function includesAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function matchFallbackIntent(text: string): {
  intent: CanonicalIntent;
  confidence: number;
  secondary: CanonicalIntent[];
} {
  for (const rule of FALLBACK_RULES) {
    if (!includesAny(text, rule.phrases)) continue;
    const secondary =
      rule.secondary && includesAny(text, rule.secondary.phrases) ? [rule.secondary.intent] : [];
    return { intent: rule.intent, confidence: rule.confidence, secondary };
  }
  return { intent: "unknown", confidence: 0.5, secondary: [] };
}
