import { Injectable } from "@nestjs/common";
import type { AiAgent, AiSettings, BusinessRule, Customer, Message } from "@prisma/client";

import type {
  DeliveryRulePayload,
  PaymentRulePayload,
  ReturnsRulePayload,
  DiscountRulePayload,
  FreeShippingPayload,
  WorkingHoursPayload,
  MinOrderPayload,
} from "@app/shared";

export interface PromptContext {
  businessId: string;
  conversationId: string;
  inboundMessage: string;
  business?: {
    name?: string;
    industry?: string;
    currency?: string;
    country?: string;
    timezone?: string;
  } | null;
  agent?: AiAgent | null;
  settings?: AiSettings | null;
  rules?: BusinessRule[];
  history?: Message[];
  customer?: Customer | null;
  toolResultsSummary?: string;
  ragContextSummary?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
}

@Injectable()
export class PromptBuilderService {
  /**
   * Build complete LLM prompt stack adhering to 05_AI_BEHAVIOR_SPECIFICATION and 15_AI_ARCHITECTURE
   */
  buildPrompt(context: PromptContext): BuiltPrompt {
    const {
      business,
      agent,
      settings,
      rules = [],
      history = [],
      customer,
      inboundMessage,
      toolResultsSummary,
      ragContextSummary,
    } = context;

    const storeName = business?.name || "Notre Boutique";
    const storeIndustry = business?.industry || "Commerce de détail";
    const storeCurrency = business?.currency || "TND";

    const agentName = agent?.name ?? "Assistant";
    const personality =
      agent?.personality ?? "Chaleureux, professionnel, orienté vente et conseil client.";
    const tone = agent?.tone ?? "Amical et direct, typique du commerce tunisien.";
    const defaultLanguage = agent?.language ?? "ar";
    const customAppend = settings?.custom_system_append ?? "";
    const blockedTopics = settings?.blocked_topics ?? [];

    const salesStrategy = (agent?.sales_strategy as {
      upsell?: boolean;
      cross_sell?: boolean;
      aggressiveness?: "low" | "medium" | "high";
    } | null) ?? { upsell: true, cross_sell: true, aggressiveness: "medium" };

    // Format business rules summary
    const formattedRules = this.formatRulesSummary(rules);

    // Assemble System Prompt
    const systemPromptParts: string[] = [
      `You are "${agentName}", an expert AI sales and customer service advisor representing the store "${storeName}" (${storeIndustry}), based in Tunisia.`,
      `Store Name: ${storeName}`,
      `Industry: ${storeIndustry}`,
      `Store Currency: ${storeCurrency}`,
      `Your Persona: ${personality}`,
      `Your Tone: ${tone}`,
      `Default Language: ${defaultLanguage}`,
      "",
      "=== 1. LANGUAGE & DIALECT CONTRACT (CANONICAL) ===",
      "- Primary Audience: Tunisian shoppers messaging on Instagram, Facebook Messenger, and WhatsApp.",
      "- Shoppers frequently write in Tunisian Arabic using Latin script (Tunizi / Arabizi, e.g., '3aslema', '9addeh el prix', 'famma taille M?', 'nheb nechri', 'chneya el alwen el mawjouda', 'b9adech livraison?').",
      "- Script and Language Invariant: ALWAYS detect and mirror the shopper's exact language and script.",
      "  * If customer writes in Tunizi / Arabizi (Latin script) -> Reply in natural Tunisian Derja using Latin script.",
      "  * If customer writes in Arabic script (الدارجة التونسية) -> Reply in Arabic script.",
      "  * If customer writes in French -> Reply in fluent French.",
      "  * If customer writes in English -> Reply in English.",
      "  * If customer code-switches (mixes Tunizi and French) -> Mirror the code-switching naturally.",
      "- NEVER correct Tunisian Derja/Arabizi into Modern Standard Arabic (MSA / الفصحى).",
      "- Product names, SKUs, brand names, and sizes (e.g. S, M, L, XL) MUST remain exact and untranslated.",
      "",
      "=== 2. STRICT GROUNDING INVARIANTS (LAW 1 & LAW 2 - ZERO TOLERANCE) ===",
      "- ZERO HALLUCINATION POLICY: You must NEVER invent, assume, or guess prices, stock levels, discounts, delivery fees, or store terms.",
      "- Every single commerce fact (price in TND, available quantity, delivery cost, return duration) MUST strictly originate from tool execution outputs or stored business rules provided in the prompt.",
      "- If a product is out of stock or not found in the verified tool results, or if the customer asks about an item the store does not carry, politely tell the customer in natural conversational language (mirroring their dialect) that the item is currently unavailable or not in stock, and suggest available alternatives or ask how else you can assist them.",
      "- Never authorize custom discounts outside official promotional rules.",
      "- Keep direct message replies short (1 to 3 sentences max), warm, helpful, and focused on guiding the shopper toward a verified purchase.",
      "",
      "=== 3. CONVERSATIONAL INTEGRITY & FORBIDDEN TOOL OUTPUTS ===",
      "- You are generating the FINAL, direct message sent to the customer on chat.",
      "- You do NOT execute tools during generation. All catalog lookups and checks have already been executed by the backend before your turn.",
      "- NEVER output simulated tool calls, code blocks, parameter dictionaries, or internal tool syntax (e.g. NEVER output '**Searching for products:**', '**Tool**:', '`search_products`', 'Parameters:', or function call JSON).",
      "- NEVER expose internal reasoning tags, function names, or technical instructions to the shopper.",
      "- Speak directly to the customer as a warm, human salesperson.",
      "",
      `=== 4. SALES STRATEGY & BEHAVIOR ===`,
      `- Aggressiveness: ${salesStrategy.aggressiveness ?? "medium"}. Guide customers naturally to confirm their orders.`,
      `- Upselling: ${salesStrategy.upsell ? "Enabled - recommend complementary products or higher-tier variants when helpful." : "Disabled."}`,
      `- Cross-selling: ${salesStrategy.cross_sell ? "Enabled." : "Disabled."}`,
    ];

    if (blockedTopics.length > 0) {
      systemPromptParts.push(
        "",
        `=== 5. BLOCKED TOPICS ===`,
        `Decline to answer and escalate immediately if the customer asks about: ${blockedTopics.join(", ")}.`,
      );
    }

    if (formattedRules) {
      systemPromptParts.push("", "=== 6. STORE BUSINESS RULES & POLICIES ===", formattedRules);
    }

    if (ragContextSummary) {
      systemPromptParts.push("", "=== 7. KNOWLEDGE BASE & FAQ CONTEXT ===", ragContextSummary);
    }

    if (customAppend) {
      systemPromptParts.push("", "=== 8. MERCHANT INSTRUCTIONS ===", customAppend);
    }

    const systemPrompt = systemPromptParts.join("\n");

    // Format Messages History (prior turns)
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];

    // Exclude current inbound message if it is already in DB history to avoid duplicate final turns
    const priorHistory = history.filter((msg, idx) => {
      if (
        idx === history.length - 1 &&
        msg.direction === "inbound" &&
        msg.content?.trim() === inboundMessage.trim()
      ) {
        return false;
      }
      return true;
    });

    for (const msg of priorHistory) {
      const content = msg.content?.trim();
      if (!content) continue;
      const role =
        msg.direction === "inbound" || msg.sender_type === "customer" ? "user" : "assistant";
      messages.push({ role, content });
    }

    // Build Current User Turn Prompt
    const userTurnParts: string[] = [];

    if (customer) {
      const customerDetails = [
        customer.name ? `Name: ${customer.name}` : null,
        customer.phone ? `Phone: ${customer.phone}` : null,
        `Stage: ${customer.lifecycle_stage}`,
      ]
        .filter((part): part is string => part !== null)
        .join(", ");

      if (customerDetails.length > 0) {
        userTurnParts.push(`[Customer Profile: ${customerDetails}]`);
      }
    }

    if (toolResultsSummary && toolResultsSummary.length > 0) {
      userTurnParts.push(`[Verified Real-Time Tool Results:\n${toolResultsSummary}\n]`);
    }

    userTurnParts.push(inboundMessage);

    const userPrompt = userTurnParts.join("\n\n");

    return {
      systemPrompt,
      userPrompt,
      messages: [...messages, { role: "user", content: userPrompt }],
    };
  }

  private formatRulesSummary(rules: BusinessRule[]): string {
    if (rules.length === 0) return "";

    const lines: string[] = [];
    for (const rule of rules) {
      if (!rule.enabled || !rule.payload || typeof rule.payload !== "object") continue;
      const rawPayload = rule.payload as Record<string, unknown>;

      switch (rule.rule_type) {
        case "delivery": {
          const payload = rawPayload as unknown as DeliveryRulePayload;
          if (Array.isArray(payload.zones)) {
            const zonesStr = payload.zones
              .map((z) => `${z.name}: ${z.fee.toFixed(3)} ${z.currency} (~${z.eta_hours}h)`)
              .join(", ");
            lines.push(`- Delivery: ${zonesStr}`);
          }
          break;
        }
        case "payment": {
          const payload = rawPayload as unknown as PaymentRulePayload;
          if (Array.isArray(payload.methods)) {
            const methodsStr = payload.methods.map((m) => m.label).join(", ");
            lines.push(`- Payment methods: ${methodsStr}`);
          }
          break;
        }
        case "returns": {
          const payload = rawPayload as unknown as ReturnsRulePayload;
          lines.push(`- Returns: ${payload.window_days} days window. ${payload.conditions || ""}`);
          break;
        }
        case "discount": {
          const payload = rawPayload as unknown as DiscountRulePayload;
          if (payload.ai_may_offer && payload.max_percent !== null) {
            lines.push(`- Allowed discount: up to ${payload.max_percent}% for hesitating buyers.`);
          } else {
            lines.push(`- Discounts: AI not authorized to give ad-hoc discounts.`);
          }
          break;
        }
        case "free_shipping": {
          const payload = rawPayload as unknown as FreeShippingPayload;
          lines.push(
            `- Free Shipping: on orders above ${payload.threshold.toFixed(3)} ${payload.currency}.`,
          );
          break;
        }
        case "working_hours": {
          const payload = rawPayload as unknown as WorkingHoursPayload;
          lines.push(`- Working Hours: ${payload.timezone}`);
          break;
        }
        case "min_order": {
          const payload = rawPayload as unknown as MinOrderPayload;
          lines.push(`- Min Order: ${payload.amount.toFixed(3)} ${payload.currency}`);
          break;
        }
      }
    }
    return lines.join("\n");
  }
}
