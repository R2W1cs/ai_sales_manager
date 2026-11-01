import type { BusinessRule } from "@prisma/client";

import { GuardrailsService, type GuardrailContext } from "./guardrails.service";

describe("AI guardrails & commercial safety validators (discount, refund, promises) (T-AI-02)", () => {
  let guardrailsService: GuardrailsService;

  beforeEach(() => {
    guardrailsService = new GuardrailsService();
  });

  describe("1. Discount Intercept & Commercial Margin Guardrails", () => {
    it("Discount Intercept: Blocks unauthorized discount requests and promises when no rule allows it", () => {
      const output =
        "Bonjour! Exceptionnellement pour vous, je vous accorde une remise de 50% sur la robe noire.";
      const businessRules: BusinessRule[] = []; // No discount rules configured

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.shouldHandoff).toBe(true);
      expect(result.escalationReason).toBe("negotiation");
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]?.category).toBe("unauthorized_discount");
      expect(result.violations[0]?.severity).toBe("HIGH");
      expect(result.sanitizedOutput).toBeNull();
    });

    it("Blocks discount promises when discount rule has ai_may_offer = false", () => {
      const output = "Je peux vous faire un rabais de 20% sur cet article.";
      const businessRules = [
        {
          id: "rule-1",
          business_id: "biz-1",
          rule_type: "discount",
          payload: {
            ai_may_offer: false,
            max_percent: 20,
          },
          priority: 1,
          enabled: true,
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.shouldHandoff).toBe(true);
      expect(result.violations[0]?.reason).toContain(
        "no active discount policy allowing AI offers",
      );
    });

    it("Ignores expired discount rules when authorizing AI offers", () => {
      const output = "Je peux vous faire un rabais de 5% sur cet article.";
      const businessRules = [
        {
          id: "rule-expired-discount",
          business_id: "biz-1",
          rule_type: "discount",
          payload: {
            ai_may_offer: true,
            max_percent: 10,
          },
          priority: 1,
          enabled: true,
          effective_from: new Date("2024-01-01"),
          effective_to: new Date("2024-12-31"),
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("unauthorized_discount");
    });

    it("Blocks discount promises exceeding the authorized cap (e.g., 50% offered when max allowed is 10%)", () => {
      const output = "3aslema! Najem nna9aslek 50% mel soum mte3 l hoodie.";
      const businessRules = [
        {
          id: "rule-2",
          business_id: "biz-1",
          rule_type: "discount",
          payload: {
            ai_may_offer: true,
            max_percent: 10,
          },
          priority: 1,
          enabled: true,
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.violations[0]?.category).toBe("unauthorized_discount");
      expect(result.violations[0]?.reason).toContain("exceeding maximum authorized cap of 10%");
    });

    it("Allows authorized promotional discounts within configured limits (e.g., 5% when max is 10%)", () => {
      const output =
        "Bonjour! Le prix initial est de 100 TND, mais je peux vous faire bénéficier d'une remise de 5% aujourd'hui.";
      const businessRules = [
        {
          id: "rule-3",
          business_id: "biz-1",
          rule_type: "discount",
          payload: {
            ai_may_offer: true,
            max_percent: 10,
          },
          priority: 1,
          enabled: true,
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(true);
      expect(result.suppressResponse).toBe(false);
      expect(result.shouldHandoff).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.sanitizedOutput).toBe(output);
    });

    it("Intercepts Arabizi and French informal discount promises without numbers (e.g. 'prix d'ami')", () => {
      const outputArabizi = "Men 3andi ena nna9aslek f soum w na3melik promo spéciale pour vous.";
      const resultArabizi = guardrailsService.validateProposedOutput(outputArabizi, []);

      expect(resultArabizi.passed).toBe(false);
      expect(resultArabizi.violations[0]?.category).toBe("unauthorized_discount");

      const outputFrench = "Spécialement pour vous, je vous fais un prix d'ami exceptionnel.";
      const resultFrench = guardrailsService.validateProposedOutput(outputFrench, []);

      expect(resultFrench.passed).toBe(false);
      expect(resultFrench.violations[0]?.category).toBe("unauthorized_discount");
    });

    it("Intercepts Arabic script discount promises", () => {
      const outputArabic = "مرحبا بيك، نعملك تخفيض استثنائي وسعر خاص ليك من عندي.";
      const resultArabic = guardrailsService.validateProposedOutput(outputArabic, []);

      expect(resultArabic.passed).toBe(false);
      expect(resultArabic.violations[0]?.category).toBe("unauthorized_discount");
    });

    it("Blocks unquantified discount promises even when ai_may_offer is true with a cap", () => {
      const output = "Spécialement pour vous, je vous fais un prix d'ami exceptionnel.";
      const businessRules = [
        {
          id: "rule-disc-cap",
          business_id: "biz-1",
          rule_type: "discount",
          payload: {
            ai_may_offer: true,
            max_percent: 10,
          },
          priority: 1,
          enabled: true,
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.violations[0]?.category).toBe("unauthorized_discount");
      expect(result.violations[0]?.reason).toContain("unquantified discount promise");
    });

    it("Does not falsely flag generic percentages (cotton composition, satisfaction) as discounts", () => {
      const output =
        "Ce t-shirt est 100% coton de haute qualité et 95% de nos clients en sont ravis!";
      const businessRules: BusinessRule[] = [];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(true);
      expect(result.suppressResponse).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.sanitizedOutput).toBe(output);
    });
  });

  describe("2. Refund Intercept & Zero-Tolerance Guarantees", () => {
    it("Refund Intercept: Escalates refund inquiries to human agent with critical priority", () => {
      const inboundRefund = "Le t-shirt est déchiré, je veux un remboursement complet svp.";
      const checkInbound = guardrailsService.validateInbound(inboundRefund);

      expect(checkInbound.passed).toBe(false);
      expect(checkInbound.shouldHandoff).toBe(true);
      expect(checkInbound.escalationReason).toBe("refund_request");
      expect(checkInbound.handoffPriority).toBe("CRITICAL");
      expect(checkInbound.violations[0]?.category).toBe("unauthorized_refund");
      expect(checkInbound.violations[0]?.severity).toBe("CRITICAL");
    });

    it("Inbound Guard: Handles null, undefined, and whitespace gracefully", () => {
      expect(guardrailsService.validateInbound(null).passed).toBe(true);
      expect(guardrailsService.validateInbound(undefined).passed).toBe(true);
      expect(guardrailsService.validateInbound("").passed).toBe(true);
      expect(guardrailsService.validateInbound("   ").passed).toBe(true);
    });

    it("Inbound Guard: Escalates customer discount negotiation when no discount rule allows AI offers", () => {
      const inboundDiscount = "3aslema, tnajjem ta3malli remise f soum l veste?";
      const checkInbound = guardrailsService.validateInbound(inboundDiscount, undefined, []);

      expect(checkInbound.passed).toBe(false);
      expect(checkInbound.shouldHandoff).toBe(true);
      expect(checkInbound.escalationReason).toBe("negotiation");
      expect(checkInbound.handoffPriority).toBe("HIGH");
      expect(checkInbound.violations[0]?.category).toBe("unauthorized_discount");
    });

    it("Inbound Guard: Escalates customer discount negotiation in Arabic script", () => {
      const inboundDiscount = "عسلامة، تنجم تنقصلي في السوم وتعملي تخفيض باهي؟";
      const checkInbound = guardrailsService.validateInbound(inboundDiscount, undefined, []);

      expect(checkInbound.passed).toBe(false);
      expect(checkInbound.shouldHandoff).toBe(true);
      expect(checkInbound.escalationReason).toBe("negotiation");
      expect(checkInbound.violations[0]?.category).toBe("unauthorized_discount");
    });

    it("Inbound Guard: Allows customer discount negotiation to proceed when rule allows AI offers", () => {
      const inboundDiscount = "Est-ce que je peux avoir un code promo ou une réduction ?";
      const rules = [
        {
          id: "rule-disc-allow",
          business_id: "biz-1",
          rule_type: "discount",
          payload: {
            ai_may_offer: true,
            max_percent: 15,
          },
          priority: 1,
          enabled: true,
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ];

      const checkInbound = guardrailsService.validateInbound(inboundDiscount, undefined, rules);

      expect(checkInbound.passed).toBe(true);
      expect(checkInbound.shouldHandoff).toBe(false);
      expect(checkInbound.violations).toHaveLength(0);
    });

    it("Inbound Guard: Does not falsely trigger refund escalation on navigation containing 'retourner'", () => {
      const inboundNav = "Je vais retourner voir le catalogue sur votre site plus tard.";
      const checkInbound = guardrailsService.validateInbound(inboundNav);

      expect(checkInbound.passed).toBe(true);
      expect(checkInbound.shouldHandoff).toBe(false);
      expect(checkInbound.violations).toHaveLength(0);
    });

    it("Inbound Guard: Does not falsely trigger return handoff on non-merchandise exchange phrasing", () => {
      expect(
        guardrailsService.validateInbound("What is the current currency exchange rate?").passed,
      ).toBe(true);
      expect(
        guardrailsService.validateInbound("Can we exchange messages on WhatsApp?").passed,
      ).toBe(true);
    });

    it("Inbound Guard: Does not falsely trigger handoff on general refund or return policy inquiries", () => {
      expect(
        guardrailsService.validateInbound("Quelle est votre politique de remboursement ?").passed,
      ).toBe(true);
      expect(guardrailsService.validateInbound("What is your refund policy?").passed).toBe(true);
      expect(
        guardrailsService.validateInbound("Quelle est votre politique de retour ?").passed,
      ).toBe(true);
    });

    it("Inbound Guard: Does not escalate on generic standalone tokens like 'flousi' or 'sa3edni'", () => {
      expect(guardrailsService.validateInbound("ok flousi merci").passed).toBe(true);
      expect(guardrailsService.validateInbound("sa3edni svp").passed).toBe(true);
      expect(guardrailsService.validateInbound("ساعدني من فضلك").passed).toBe(true);
    });

    it("Inbound Guard: Still escalates specific refund and discount phrasing", () => {
      expect(guardrailsService.validateInbound("nheb flousi").shouldHandoff).toBe(true);
      expect(
        guardrailsService.validateInbound("sa3edni fel soum", undefined, []).escalationReason,
      ).toBe("negotiation");
    });

    it("Inbound Guard: Correctly escalates merchandise return requests", () => {
      const inboundReturn = "Je souhaite retourner le produit car la taille ne me convient pas.";
      const checkInbound = guardrailsService.validateInbound(inboundReturn);

      expect(checkInbound.passed).toBe(false);
      expect(checkInbound.shouldHandoff).toBe(true);
      expect(checkInbound.escalationReason).toBe("return_exchange");
      expect(checkInbound.violations[0]?.category).toBe("unauthorized_refund");
    });

    it("Inbound Guard: Correctly escalates Arabic script refund inquiries", () => {
      const inboundReturn = "المنتج تالف نحب نرجع فلوسي ونعمل طلب استرجاع.";
      const checkInbound = guardrailsService.validateInbound(inboundReturn);

      expect(checkInbound.passed).toBe(false);
      expect(checkInbound.shouldHandoff).toBe(true);
      expect(checkInbound.escalationReason).toBe("refund_request");
      expect(checkInbound.violations[0]?.category).toBe("unauthorized_refund");
    });

    it("Intercepts unauthorized refund commitments in French and triggers immediate suppression", () => {
      const output =
        "Votre demande est bien reçue. Votre remboursement immédiat est accepté et vous sera restitué.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.shouldHandoff).toBe(true);
      expect(result.escalationReason).toBe("refund_request");
      expect(result.violations[0]?.category).toBe("unauthorized_refund");
      expect(result.violations[0]?.severity).toBe("CRITICAL");
    });

    it("Intercepts unauthorized refund commitments in Arabizi / Tunizi", () => {
      const output = "3aslema! Ma t9alla9ch rou7ek jemla, nrajja3lek flousek lkol fi a9reb wa9t.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.violations[0]?.category).toBe("unauthorized_refund");
      expect(result.violations[0]?.matchedText).toContain("nrajja3lek flousek");
    });

    it("Intercepts unauthorized refund commitments in Arabic script", () => {
      const output = "لا تقلق أبدا، استرجاع أموالك مضمون وسنقوم بإرجاع المبلغ لحسابك.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.violations[0]?.category).toBe("unauthorized_refund");
    });

    it("Intercepts unauthorized refund commitments in English", () => {
      const output = "Don't worry, your full refund confirmed and money back guaranteed.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.violations[0]?.category).toBe("unauthorized_refund");
    });
  });

  describe("3. Complaint Safety & Anti-Upselling Guardrails", () => {
    it("Complaint Safety: Suppresses product upselling during customer complaints", () => {
      const output =
        "Je suis désolé pour le retard. Découvrez également notre nouvelle collection de pulls pour compléter votre garde-robe!";
      const context: GuardrailContext = {
        isComplaint: true,
        customerIntent: "complaint",
      };

      const result = guardrailsService.validateProposedOutput(output, [], context);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.shouldHandoff).toBe(true);
      expect(result.escalationReason).toBe("complaint");
      expect(result.handoffPriority).toBe("CRITICAL");
      expect(result.violations.some((v) => v.category === "complaint_upsell")).toBe(true);
      expect(result.violations[0]?.severity).toBe("CRITICAL");
      expect(result.violations[0]?.reason).toContain(
        "Suppressed product upselling during customer complaint",
      );
    });

    it("Suppresses Arabizi cross-sell/upsell during customer refund inquiry", () => {
      const output = "Désolé pour le problème. T7eb tchouf zeda produit a5er fi blasethou?";
      const context: GuardrailContext = {
        isRefund: true,
        customerIntent: "refund_request",
      };

      const result = guardrailsService.validateProposedOutput(output, [], context);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.violations.some((v) => v.category === "complaint_upsell")).toBe(true);
    });

    it("Suppresses Arabic script cross-sell/upsell during customer complaint", () => {
      const output = "نعتذر بشدة عن التأخير. تحب تشوف زادة منتجاتنا الأخرى وتشكيلة جديدة متوفرة؟";
      const context: GuardrailContext = {
        isComplaint: true,
        customerIntent: "complaint",
      };

      const result = guardrailsService.validateProposedOutput(output, [], context);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.violations.some((v) => v.category === "complaint_upsell")).toBe(true);
    });

    it("Allows empathetic, non-promotional apology response during complaints", () => {
      const output =
        "Bonjour, nous sommes sincèrement désolés pour ce désagrément. Je transmets immédiatement votre dossier à un responsable de notre équipe.";
      const context: GuardrailContext = {
        isComplaint: true,
        customerIntent: "complaint",
      };

      const result = guardrailsService.validateProposedOutput(output, [], context);

      expect(result.passed).toBe(true);
      expect(result.suppressResponse).toBe(false);
      expect(result.shouldHandoff).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.sanitizedOutput).toBe(output);
    });

    it("Allows product recommendations during regular shopping conversations", () => {
      const output =
        "La robe noire est magnifique! Vous pourriez aussi aimer nos escarpins assortis en cuir.";
      const context: GuardrailContext = {
        isComplaint: false,
        customerIntent: "product_inquiry",
      };

      const result = guardrailsService.validateProposedOutput(output, [], context);

      expect(result.passed).toBe(true);
      expect(result.suppressResponse).toBe(false);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("4. Payment Promise & Direct Link Intercept", () => {
    it("Intercepts unauthorized payment link and wire transfer instructions", () => {
      const output =
        "Voici le lien de paiement envoyé ci-dessous pour régler votre commande par carte.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.suppressResponse).toBe(true);
      expect(result.shouldHandoff).toBe(true);
      expect(result.violations[0]?.category).toBe("payment_promise");
      expect(result.violations[0]?.severity).toBe("CRITICAL");
    });

    it("Intercepts bank account RIB sharing promises in Arabizi", () => {
      const output = "3aslema, ab3ath flous al compte hedha mte3na bech nvalidiw commande.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("payment_promise");
    });

    it("Intercepts payment link and bank transfer promises in Arabic script", () => {
      const output = "تفضل رابط الدفع بالبطاقة البنكية أو قم بالتحويل البنكي على الحساب التالي.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("payment_promise");
    });
  });

  describe("5. False Delivery Guarantees & Blocked Topics", () => {
    it("Intercepts unconditional free delivery promises when no free shipping rule is set", () => {
      const output = "Chez nous, la livraison gratuite sans condition est toujours assurée.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("delivery_guarantee");
    });

    it("Intercepts unconditional free delivery in Arabic script", () => {
      const output = "التوصيل دائما مجاني وبدون أي مصاريف شحن دائما.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("delivery_guarantee");
    });

    it("Ignores expired free_shipping rules when validating unconditional delivery claims", () => {
      const output = "Chez nous, la livraison gratuite sans condition est offerte!";
      const businessRules = [
        {
          id: "rule-expired-free-ship",
          business_id: "biz-1",
          rule_type: "free_shipping",
          payload: { threshold: 0, currency: "TND" },
          priority: 1,
          enabled: true,
          effective_from: new Date("2024-01-01"),
          effective_to: new Date("2024-12-31"),
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("delivery_guarantee");
    });

    it("Allows free delivery mention when free_shipping rule with threshold 0 exists", () => {
      const output = "Chez nous, la livraison gratuite sans condition est offerte!";
      const businessRules = [
        {
          id: "rule-free-ship",
          business_id: "biz-1",
          rule_type: "free_shipping",
          payload: { threshold: 0, currency: "TND" },
          priority: 1,
          enabled: true,
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(true);
    });

    it("Intercepts false immediate delivery guarantees (e.g. within 1 hour)", () => {
      const output = "Votre colis a une livraison garantie dans l'heure chez vous.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("delivery_guarantee");
    });

    it("Intercepts false immediate delivery in Arabic script", () => {
      const output = "الطلب يوصلك في ساعة مضمون وبدون أي تأخير.";
      const result = guardrailsService.validateProposedOutput(output, []);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("delivery_guarantee");
    });

    it("Intercepts merchant configured blocked topics", () => {
      const output = "Nous pouvons discuter de contrefaçon et de produits non authentiques.";
      const context: GuardrailContext = {
        blockedTopics: ["contrefaçon", "réplique", "grossiste"],
      };

      const result = guardrailsService.validateProposedOutput(output, [], context);

      expect(result.passed).toBe(false);
      expect(result.violations[0]?.category).toBe("blocked_topic");
      expect(result.escalationReason).toBe("legal_sensitive");
      expect(result.handoffPriority).toBe("CRITICAL");
    });

    it("Allows express / immediate delivery promise when matching delivery zone with ETA exists", () => {
      const output = "Votre colis a une livraison garantie dans l'heure chez vous.";
      const context: GuardrailContext = {
        deliveryZones: [
          {
            name: "Grand Tunis Express",
            fee: 8,
            etaHours: 1,
          },
        ],
      };

      const result = guardrailsService.validateProposedOutput(output, [], context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("Allows express delivery promise when delivery rule with fast ETA exists in business rules", () => {
      const output = "Votre commande arrivera garantie demain matin sans faute.";
      const businessRules = [
        {
          id: "rule-deliv-express",
          business_id: "biz-1",
          rule_type: "delivery",
          payload: {
            zones: [
              {
                name: "Tunis Overnight",
                fee: 7,
                currency: "TND",
                eta_hours: 12,
              },
            ],
          },
          priority: 1,
          enabled: true,
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ];

      const result = guardrailsService.validateProposedOutput(output, businessRules);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("6. Edge Cases & Helper Utilities", () => {
    it("Handles null, undefined, or empty outputs gracefully", () => {
      expect(guardrailsService.validateProposedOutput(null).passed).toBe(true);
      expect(guardrailsService.validateProposedOutput("").passed).toBe(true);
      expect(guardrailsService.validateProposedOutput("   ").passed).toBe(true);
    });

    it("Accurately extracts discount percentage from various multi-lingual expressions", () => {
      expect(guardrailsService.extractDiscountPercentage("remise de 30%")).toBe(30);
      expect(guardrailsService.extractDiscountPercentage("20% de réduction")).toBe(20);
      expect(guardrailsService.extractDiscountPercentage("nna9aslek 15%")).toBe(15);
      expect(guardrailsService.extractDiscountPercentage("give you 25% off")).toBe(25);
      expect(guardrailsService.extractDiscountPercentage("-10% sur la commande")).toBe(10);
      expect(guardrailsService.extractDiscountPercentage("bénéficiez de 5% de remise")).toBe(5);
      expect(guardrailsService.extractDiscountPercentage("تخفيض 20%")).toBe(20);
      expect(guardrailsService.extractDiscountPercentage("نقصتلك 15%")).toBe(15);
      expect(guardrailsService.extractDiscountPercentage("pas de remise")).toBeNull();
      // Generic non-discount percentages must return null
      expect(guardrailsService.extractDiscountPercentage("100% coton")).toBeNull();
      expect(guardrailsService.extractDiscountPercentage("95% satisfaction")).toBeNull();
      expect(guardrailsService.extractDiscountPercentage("batterie à 80%")).toBeNull();
    });
  });
});
