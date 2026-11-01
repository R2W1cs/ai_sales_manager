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
   * Deterministic semantic heuristic fallback for testing & offline mode
   */
  private classifyDeterministicFallback(text: string, startTime: number): IntentClassification {
    const lower = normalizeMessage(text);
    const entities: ExtractedEntities = extractRuleEntities(lower);

    let intent: CanonicalIntent = "unknown";
    let confidence = 0.5;
    const secondary: CanonicalIntent[] = [];

    // Complex / multi-intent disambiguation heuristics
    if (
      lower.includes("personne") ||
      lower.includes("humain") ||
      lower.includes("3abd") ||
      lower.includes("responsable")
    ) {
      intent = "human_request";
      confidence = 0.95;
    } else if (
      lower.includes("reclamation") ||
      lower.includes("mouch behi") ||
      lower.includes("khed3ouni") ||
      lower.includes("defectueux")
    ) {
      intent = "complaint";
      confidence = 0.92;
    } else if (
      lower.includes("nechri") ||
      lower.includes("commander") ||
      lower.includes("validi") ||
      lower.includes("acheter")
    ) {
      intent = "purchase_intent";
      confidence = 0.9;
    } else if (lower.includes("retour") || lower.includes("baddel") || lower.includes("échange")) {
      intent = "return_inquiry";
      confidence = 0.88;
    } else if (
      lower.includes("livraison") ||
      lower.includes("delivery") ||
      lower.includes("twaslou")
    ) {
      intent = "delivery_inquiry";
      confidence = 0.88;
    } else if (
      lower.includes("suivi") ||
      lower.includes("woslet") ||
      lower.includes("commande mte3i")
    ) {
      intent = "order_status";
      confidence = 0.88;
    } else if (
      lower.includes("promo") ||
      lower.includes("remise") ||
      lower.includes("reduction") ||
      lower.includes("solde")
    ) {
      intent = "discount_inquiry";
      confidence = 0.85;
    } else if (
      lower.includes("kifech n5ales") ||
      lower.includes("paiement") ||
      lower.includes("espece") ||
      lower.includes("carte")
    ) {
      intent = "payment_inquiry";
      confidence = 0.85;
    } else if (
      lower.includes("dispo") ||
      lower.includes("stock") ||
      lower.includes("famma") ||
      lower.includes("mawjoud")
    ) {
      intent = "stock_check";
      confidence = 0.82;
      if (lower.includes("prix") || lower.includes("9addeh") || lower.includes("soum")) {
        secondary.push("price_question");
      }
    } else if (
      lower.includes("prix") ||
      lower.includes("combien") ||
      lower.includes("9addeh") ||
      lower.includes("b9adech") ||
      lower.includes("soum")
    ) {
      intent = "price_question";
      confidence = 0.82;
      if (lower.includes("dispo") || lower.includes("taille")) {
        secondary.push("stock_check");
      }
    } else if (
      lower.includes("robe") ||
      lower.includes("hoodie") ||
      lower.includes("modele") ||
      lower.includes("article")
    ) {
      intent = "product_inquiry";
      confidence = 0.8;
    } else if (
      lower.includes("3aslema") ||
      lower.includes("bonjour") ||
      lower.includes("salut") ||
      lower.includes("salam") ||
      lower.includes("ahla")
    ) {
      intent = "greeting";
      confidence = 0.85;
    }

    return {
      intent,
      confidence,
      secondary,
      entities,
      source: "llm",
      latencyMs: Date.now() - startTime,
      model: CLASSIFIER_MODEL,
    };
  }
}
