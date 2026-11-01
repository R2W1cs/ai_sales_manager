import { Injectable } from "@nestjs/common";
import type { BusinessRule } from "@prisma/client";

import type { DiscountRulePayload } from "@app/shared";

export type GuardrailViolationCategory =
  | "unauthorized_discount"
  | "unauthorized_refund"
  | "complaint_upsell"
  | "payment_promise"
  | "delivery_guarantee"
  | "blocked_topic"
  | "unauthorized_promise";

export type GuardrailSeverity = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface GuardrailViolation {
  category: GuardrailViolationCategory;
  reason: string;
  matchedText?: string;
  severity: GuardrailSeverity;
  ruleType?: string;
}

export interface GuardrailCheckResult {
  passed: boolean;
  violations: GuardrailViolation[];
  sanitizedOutput: string | null;
  shouldHandoff: boolean;
  escalationReason?: string;
  handoffPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  suppressResponse: boolean;
}

export interface GuardrailContext {
  customerIntent?: string;
  isComplaint?: boolean;
  isRefund?: boolean;
  isOrderPending?: boolean;
  blockedTopics?: string[];
  activeDiscounts?: {
    name?: string;
    percentage?: number;
    maxPercent?: number;
    aiMayOffer?: boolean;
    code?: string;
  }[];
  deliveryZones?: {
    name: string;
    fee: number;
    etaHours: number;
  }[];
  customerMessage?: string;
  channel?: string;
}

export type BusinessRuleLike =
  | BusinessRule
  | {
      rule_type?: string;
      enabled?: boolean;
      payload?: unknown;
      effective_from?: Date | string;
      effective_to?: Date | string | null;
    };

/** Returns true when a business rule is effective at the given point in time. */
export function isBusinessRuleEffective(rule: BusinessRuleLike, asOf: Date = new Date()): boolean {
  const fromRaw =
    "effective_from" in rule && rule.effective_from !== undefined ? rule.effective_from : null;
  const toRaw = "effective_to" in rule ? rule.effective_to : null;

  if (fromRaw) {
    const effectiveFrom = fromRaw instanceof Date ? fromRaw : new Date(fromRaw);
    if (effectiveFrom > asOf) {
      return false;
    }
  }

  if (toRaw) {
    const effectiveTo = toRaw instanceof Date ? toRaw : new Date(toRaw);
    if (effectiveTo <= asOf) {
      return false;
    }
  }

  return true;
}

/** Escalation descriptor per violation category matching 06_AI_HUMAN_HANDOFF_RULES */
const VIOLATION_ESCALATION_MAP: Record<
  GuardrailViolationCategory,
  { reason: string; priority: "CRITICAL" | "HIGH" | "NORMAL" }
> = {
  unauthorized_refund: { reason: "refund_request", priority: "CRITICAL" },
  complaint_upsell: { reason: "complaint", priority: "CRITICAL" },
  payment_promise: { reason: "payment_issue", priority: "CRITICAL" },
  blocked_topic: { reason: "legal_sensitive", priority: "CRITICAL" },
  unauthorized_discount: { reason: "negotiation", priority: "HIGH" },
  delivery_guarantee: { reason: "policy_conflict", priority: "NORMAL" },
  unauthorized_promise: { reason: "policy_conflict", priority: "NORMAL" },
};

/** First substring match from a list of hoisted regexes. */
function firstRegexMatch(text: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[0]) {
      return match[0];
    }
  }
  return null;
}

const DISCOUNT_PHRASE_RE =
  /(?:remise|réduction|rabais|discount|réduire|nna9aslek|nna9soulek|na3mik remise|na3melik remise|na3tiwk remise|promo spéciale|prix d'ami|special deal|special discount|tarif préférentiel|prix cassé|prix réduit|geste commercial|ta5fidh|soum a9al|تخفيض|خصم|تنقيص|حسم|سعر خاص|سعر تفضيلي)/i;

const AFFIRMATIVE_DISCOUNT_RE =
  /(?:je vous (?:fais|accorde|donne|offre)|nous vous (?:faisons|accordons|offrons)|nna9aslek|nna9soulek|na3melik|na3mik|na3tiwk|je peux vous faire|je peux vous accorder|je peux vous offrir|nous pouvons vous faire|nous pouvons vous accorder|vous bénéficiez d'une (?:remise|réduction)|vous avez droit à une (?:réduction|remise)|rabais exceptionnel|remise exceptionnelle|geste commercial|i can offer you|give you a discount|i will give you a discount|we will give you a discount|i can make you a special price|prix d'ami|promo spéciale|special deal|special discount|tarif préférentiel|a3maltlek (?:soum|remise)|bech nna9aslek|bch nna9aslek|najem nna9aslek|najmou nna9soulek|soum d'ami|soum s7ab|sa3edtek fel soum|sa3ednek fel soum|نعمل(?:و)?لك تخفيض|نعطي(?:و)?ك تخفيض|نقص(?:ت|نا)لك في السوم|نجم(?:و)? ننقص(?:و)?لك|سعر خاص ليك|سوم صحاب|تخفيض استثنائي|نمنحك خصم|نقدم لك تخفيض)/i;

/** Zero-tolerance outbound refund approvals — variants folded into regex. */
const UNAUTHORIZED_REFUND_PATTERNS: readonly RegExp[] = [
  /remboursement\s+(?:accepté|accordé|validé|confirmé|garanti|immédiat|intégral|total|automatique|sans frais|sous\s+(?:24h|48h|72h|peu)|sera effectué|en cours|rapide)/i,
  /(?:je|nous|on)\s+(?:vous\s+)?(?:rembours(?:e(?:rai|rons|ra)?|ons)|(?:vais|allons|va)\s+vous\s+rembourser|vous\s+remboursera)/i,
  /(?:je|nous)\s+(?:valide|validons|accepte|acceptons|approuve|approuvons)\s+votre\s+remboursement/i,
  /(?:argent|somme|montant|totalité)\s+rembours/i,
  /votre\s+argent(?:\s+vous)?\s+sera\s+restitué/i,
  /fonds\s+restitués|récupérer\s+la\s+totalité\s+de\s+votre\s+argent|restitution\s+de\s+votre\s+argent|restituer\s+le\s+montant/i,
  /retour\s+gratuit\s+accordé|(?:retour|renvoi)\s+et\s+remboursement\s+(?:immédiat|garanti)|échange\s+ou\s+remboursement\s+immédiat\s+garanti/i,
  /(?:garantie\s+)?satisfait\s+ou\s+remboursé(?:\s+garanti)?/i,
  /nrajj?a?3(?:ou)?lek?\s+(?:flous(?:ek|k|ik)?|kol\s+frank)/i,
  /nrajj?3ou(?:lek)?\s+flous/i,
  /flous(?:ek|k|ik)\s+(?:(?:bech|bch)\s+)?tarja3/i,
  /flous(?:ek|k|ik)\s+(?:mraw7a|madhmouna|5alasa|ma\s+tdhi3ech)/i,
  /flous(?:ek|k)\s+f(?:i)?\s+jibek/i,
  /n3aw[ad]?dh?ou?l?k?\s+flous(?:ek|k)?/i,
  /nrod(?:ou)?lek?\s+flous(?:ek|k)?/i,
  /remboursement\s+(?:mawjoud|madhmoun|validé|accepté|direct)/i,
  /tarja3l[ie]k\s+flous(?:ek|k)?/i,
  /tarji3\s+el\s+flous\s+madhmoun|nrajj3oulek\s+kol\s+chay/i,
  /نرجع(?:و)?لك\s+فلوسك|فلوسك\s+(?:ترجع|في جيبك|مضمونة)/,
  /نعوض(?:و)?لك\s+فلوسك|نرد(?:و)?لك\s+فلوسك/,
  /استرجاع(?:\s+(?:المبلغ|أموالك))?\s*(?:مقبول|مضمون)|استرجاع فوري للأموال|استرجاع مجاني مضمون/,
  /تم قبول استرجاع الأموال|سنقوم بإرجاع أموالك|المبلغ سيرجع لك/,
  /إرجاع كامل المبلغ مضمون|استرداد(?:\s+المبلغ)?\s+مضمون|استرداد نقدي فوري/,
  /نضمن لك استرجاع أموالك|تمت الموافقة على (?:الاسترجاع|إرجاع المبلغ)/,
  /refund\s+(?:approved|accepted|confirmed|processed|guaranteed|your payment)/i,
  /(?:instant|full|100%)\s+refund(?:\s+(?:confirmed|guaranteed))?/i,
  /money[\s-]back\s+guarant/i,
  /refund\s+(?:is on its way|will be issued|will be processed)/i,
  /(?:we|i)\s+(?:will|are|'ll|am)\s+(?:refund(?:\s+you)?|refunding you|give you a full refund|process your refund)/i,
  /i will refund(?:\s+your money)?/i,
  /your money will be refunded|you will get your money back|send your refund immediately/i,
];

const COMPLAINT_UPSELL_PATTERNS: readonly RegExp[] = [
  /vous (?:pourriez|aimerez|apprécierez) aussi/i,
  /découvrez (?:également|aussi|notre collection)/i,
  /regardez (?:également|aussi)/i,
  /profitez (?:aussi|également) de/i,
  /nous vous (?:recommandons|conseillons) également|je vous conseille aussi/i,
  /(?:achetez|prenez|commandez|tentez) aussi/i,
  /pour compléter votre (?:achat|commande)|pour aller avec/i,
  /notre(?:s)? autre(?:s)? produit|notre nouvelle collection/i,
  /promotion spéciale sur notre|jet(?:er|ez) un [œoe]il à notre/i,
  /nous avons aussi(?:\s+(?:en stock|disponible))?/i,
  /vous seriez peut-être intéressé par|intéressé par notre autre/i,
  /consultez notre catalogue|voir nos nouveautés|notre sélection du moment|complétez avec notre/i,
  /t7eb t(?:chouf|echri) zeda|(?:3anna|famma) zeda/i,
  /produit a5er|a3mel talla|chouf (?:collection ejdida|les autres produits|zeda)/i,
  /techri maah|nrodlek produit a5er|(?:tjarreb|echri|5oudh|commandi) zeda|zid chouf/i,
  /تحب تش(?:وف|ري) زادة|عندنا زادة|فما زادة/,
  /شوف (?:منتج آخر|الكولكشن الجديدة)|اعمل طلة على/,
  /نقترح عليك زادة|ننصحك تشوف زادة|قد يعجبك أيضا|اكتشف أيضا|تسوق أيضا|ننصحك أيضا/,
  /منتجاتنا الأخرى|تشكيلة جديدة متوفرة|ألق نظرة على منتجنا|عرض خاص على منتجات أخرى|أضف لطلبك أيضا/,
  /you m(?:ight|ay) also like|check out our other|take a look at our (?:other|catalog)/i,
  /(?:we|i) also recommend|(?:buy|order) also|add to your order/i,
  /to complement your purchase|to go with this|special offer on our/i,
  /explore our collection|discover our new arrivals|we also have in stock|our other items|bundle with our/i,
];

/** High-risk outbound payment / RIB / untrusted pay-link commitments. */
const PAYMENT_PROMISE_PATTERNS: readonly RegExp[] = [
  /lien de paiement(?:\s+(?:envoyé|ci-dessous|direct|heda|par carte bancaire))?/i,
  /voici le lien de paiement|cliquez(?:\s+sur ce lien)?\s+pour payer/i,
  /payez directement via ce lien|réglez par carte sur ce lien/i,
  /paiement sécurisé en ligne|carte bancaire acceptée sur ce lien/i,
  /insérez vos coordonnées bancaires|formulaire de paiement par carte/i,
  /compte bancaire pour virement|voici notre (?:compte bancaire|rib)|rib pour virement/i,
  /virement(?:\s+bancaire)?\s+accepté|envoyez l'argent sur le compte|effectuez le virement sur ce compte/i,
  /votre paiement (?:est validé|a été reçu)|paiement par carte confirmé|paiement en ligne confirmé/i,
  /notre compte ccp pour virement|numéro de compte bancaire pour paiement/i,
  /ab3ath flous (?:al|3al) (?:compte|rib)|virement bancaire (?:al|3al) compte/i,
  /rib mte3na|compte (?:bancaire |ccp )mte3na/i,
  /(?:khalasni|5allas(?:ni)?) par virement|5allas par carte 3al lien/i,
  /cliqui al lien bech t5allas|ab3ath el virement|a3mel virement 3al rib|virement 3al compte|5allas en ligne 3al lien/i,
  /رابط الدفع(?:\s+(?:مرسل|بالبطاقة البنكية))?|اضغط هنا للدفع|ادفع عبر هذا الرابط/,
  /حسابنا البنكي للتحويل|رقم الحساب البنكي لتحويل الأموال|أرسل الأموال إلى الحساب التالي/,
  /بيانات الحساب البنكي للتحويل|قم بالتحويل البنكي على الحساب/,
  /تم استلام دفعتك بنجاح|تم تأكيد الدفع عبر البطاقة|ادفع أونلاين عبر هذا الرابط/,
  /ابعث (?:الفلوس|فيرمون) على الحساب|ريب البنك متاعنا|خلص بالبطاقة على الرابط/,
  /payment link (?:sent|below)|(?:click here to|pay via this|direct payment) link/i,
  /enter your card details on this link|secure online payment link|pay with credit card using this link/i,
  /bank account (?:details for transfer|info for wire)|transfer money to our account|wire transfer to this account/i,
  /our bank routing details|your payment has been confirmed|online payment verified/i,
];

const UNCONDITIONAL_FREE_DELIVERY_PATTERNS: readonly RegExp[] = [
  /livraison (?:gratuite sans condition|gratuite pour tous|toujours gratuite|100% gratuite|offerte sans minimum|gratuit dima)/i,
  /frais de livraison offerts pour tous|aucun frais de livraison jamais|frais de port gratuits sans condition/i,
  /livraison blech flous (?:dima|l ness lkol)|livraison gratuite l ness lkol|blech flous dima livraison/i,
  /men ghir frais de livraison jemla|livraison blech ma t5allas chay/i,
  /توصيل مجاني\s+(?:بدون شروط|للجميع|100%|دائما|ديما)|التوصيل دائما مجاني|توصيل مجاني بدون أي شرط/,
  /بدون أي مصاريف شحن دائما|توصيل بلاش فلوس ديما|شحن مجاني لكافة الطلبات بدون شرط/,
  /free shipping unconditionally|free delivery for everyone|delivery is always free/i,
  /100% free shipping with no minimum|shipping is completely free for all orders|zero delivery fees always/i,
];

const FALSE_IMMEDIATE_DELIVERY_PATTERNS: readonly RegExp[] = [
  /livraison garantie dans (?:l'heure|1 heure|2 heures|les 2 heures)|livraison garantie demain matin sans faute/i,
  /garantie d'arriver dans les 2 heures|livraison immédiate garantie|livraison express garantie en 30 minutes/i,
  /arrivée garantie dans l'heure|livraison assurée dans l'heure|livré obligatoirement demain matin/i,
  /twaslek ghodwa sbe7(?:\s+100%)?\s+garanti|twaslek f(?:i)?\s+s[ae]3a/i,
  /livraison f(?:i)?\s+s[ae]3a(?:\s+garanti)?|twaslek ba3d se3a madhmouna|livraison express madhmouna f se3a/i,
  /توصيل مضمون خلال ساعة(?: واحدة)?|توصيل مضمون في ساعتين|توصيل فوري مضمون/,
  /يصلك غدا صباحا بدون أي تأخير مضمون|شحن فوري ومضمون خلال 60 دقيقة|يوصلك في ساعة مضمون/,
  /guaranteed delivery (?:in|within) (?:1 hour|2 hours)|guaranteed to arrive in one hour/i,
  /instant delivery guaranteed|guaranteed tomorrow morning without fail|delivered in 30 minutes guaranteed/i,
];

const INBOUND_REFUND_PATTERNS: readonly RegExp[] = [
  /(?:demande|demander|vouloir|veux|souhaite|exige|obtenir|avoir|faire une demande de)\s+(?:un\s+)?remboursement/i,
  /(?:me|se|être|vous devez me|veuillez me)\s+(?:faire\s+)?rembourser|me\s+rembourser|remboursez[- ](?:moi|mon|mes|le|la|ce|cette)/i,
  /(?:je veux|j'aimerais|je souhaite|je demande)\s+(?:à\s+)?(?:me faire |être )?rembours/i,
  /remboursement\s+(?:de\s+)?(?:ma\s+commande|mon\s+article|mon\s+produit|mon\s+colis)/i,
  /récupérer mon argent|restitution d'argent|rendre mon argent/i,
  /tarji3\s+flousi?/i,
  /n[h7]eb flousi|flousi tarja3|rajja?3(?:ou)?li\s+(?:flousi|el flous)|n[h7]eb nrajja3 flousi/i,
  /استرجاع\s+(?:الفلوس|الأموال|المبلغ|أموال|فلوسي)|استرداد\s*(?:المبلغ|أموال|الفلوس|فلوسي)?|ترجيع\s+(?:الفلوس|فلوسي)|نرجع\s+فلوسي|نحب\s+(?:نرجع\s+)?فلوسي|رجعولي\s+فلوسي|طلب\s+(?:استرداد|استرجاع)/,
  /request (?:a )?refund|order refund|damaged item refund|want (?:my )?money (?:back|refunded)|get my money back|refund my (?:order|item|money)|demand (?:a )?refund/i,
];

const INBOUND_RETURN_PATTERNS: readonly RegExp[] = [
  /demande de retour|faire un retour/i,
  /(?:retourner|rendre|renvoyer)\s+(?:le |l'|la |mon |ma )?(?:produit|article|commande|colis)/i,
  /retour (?:de commande|d'article|de produit|colis)/i,
  /reprendre (?:l'article|le produit)/i,
  /demande d'échange|faire un échange/i,
  /(?:échanger|changer)\s+(?:le |l'|la |mon |ma )?(?:produit|article|taille)/i,
  /nrajj?a?3\s+(?:l |el )?(?:produit|commande|colis)/i,
  /tarji3\s+(?:l |el )(?:produit|commande|colis)/i,
  /n[h7]eb nrajj?a?3|n[h7]eb nrod (?:l produit|el commande)|nheb nrajj3ou/i,
  /إرجاع|ترجيع (?:الكوموند|المنتج)|نرجع (?:المنتج|الكوموند|الكولي)/,
  /return (?:my order|the product|the item|my parcel)|(?:exchange|swap) (?:my order|the product|the item|size|article)|request (?:an? )?(?:return|exchange)|send back my order/i,
];

const INBOUND_DISCOUNT_PATTERNS: readonly RegExp[] = [
  /remise|réduction|rabais|prix d'ami|geste commercial|faire un prix/i,
  /(?:diminuer|baisser|réduire)\s+le prix|promo spéciale|code (?:promo|réduction)/i,
  /tarif (?:préférentiel|de gros)|prix (?:négociable|réduit)|négocier le prix|avoir une remise|obtenir une réduction/i,
  /(?:nna9asli|na9asli|tna9asli)|(?:tna9as|na9as|tan9is)\s+fel soum/i,
  /ta3malli (?:remise|promo)|famma (?:remise|promo|ta5fidh)|soum a9al/i,
  /a3mall?i soum|a3mel(?:li)? soum|sa3edni f(?:el)? soum|rkhasli|ar5as chwaya|tna9asli chwaya/i,
  /تخفيض|خصم|تنقيص|نقصلي|تنقصلي في السوم|نقص في السوم/,
  /تعملي (?:تخفيض|رميز)|فما (?:تخفيض|برومو|رميز)|ساعدني في السوم/,
  /اعملي سوم|اعمل سوم باهي|سوم أرخص|كود (?:برومو|خصم)|تنقيص في السعر/,
  /discount|price cut|lower price|cheaper price|promo code|coupon code|special deal|best price/i,
  /negotiate price|can you reduce price|any discount|can you lower the price|wholesale price|student discount|first order discount/i,
];

@Injectable()
export class GuardrailsService {
  /**
   * Technical Contract:
   * GuardrailsService.validateProposedOutput(output, businessRules, context): GuardrailCheckResult
   *
   * Validates proposed LLM output before delivery.
   * Intercepts unauthorized discounts, refund promises, payment guarantees, false delivery promises,
   * complaint upselling, and blocked topics.
   * Violations trigger immediate suppression and escalate to human handoff.
   */
  validateProposedOutput(
    output: string | null | undefined,
    businessRules?: BusinessRuleLike[],
    context?: GuardrailContext,
  ): GuardrailCheckResult {
    if (!output?.trim()) {
      return {
        passed: true,
        violations: [],
        sanitizedOutput: output ?? null,
        shouldHandoff: false,
        suppressResponse: false,
      };
    }

    const violations: GuardrailViolation[] = [];
    const normalizedRules = Array.isArray(businessRules) ? businessRules : [];

    // 1. Check for Blocked Topics
    const blockedTopicViolation = this.validateBlockedTopics(output, context?.blockedTopics);
    if (blockedTopicViolation) {
      violations.push(blockedTopicViolation);
    }

    // 2. Check for Unauthorized Refund Promises (Law 2: Zero Tolerance)
    const refundViolation = this.validateRefund(output, context);
    if (refundViolation) {
      violations.push(refundViolation);
    }

    // 3. Check for Unauthorized Discounts (Law 2: No Unapproved Margin Concessions)
    const discountViolation = this.validateDiscount(output, normalizedRules, context);
    if (discountViolation) {
      violations.push(discountViolation);
    }

    // 4. Check for Complaint Safety & Anti-Upselling
    const complaintViolation = this.validateComplaintUpsell(output, context);
    if (complaintViolation) {
      violations.push(complaintViolation);
    }

    // 5. Check for Unauthorized Payment Promises & Untrusted Links
    const paymentViolation = this.validatePaymentPromises(output);
    if (paymentViolation) {
      violations.push(paymentViolation);
    }

    // 6. Check for False Delivery Guarantees
    const deliveryViolation = this.validateDeliveryGuarantees(output, normalizedRules, context);
    if (deliveryViolation) {
      violations.push(deliveryViolation);
    }

    if (violations.length > 0) {
      // Determine highest priority violation based on order of precedence
      const primaryViolation =
        violations.find((v) => v.category === "unauthorized_refund") ??
        violations.find((v) => v.category === "complaint_upsell") ??
        violations.find((v) => v.category === "payment_promise") ??
        violations.find((v) => v.category === "blocked_topic") ??
        violations.find((v) => v.category === "unauthorized_discount") ??
        violations[0];

      const mapping = primaryViolation
        ? VIOLATION_ESCALATION_MAP[primaryViolation.category]
        : { reason: "policy_conflict", priority: "NORMAL" as const };

      const isCritical =
        violations.some((v) => v.severity === "CRITICAL") || mapping.priority === "CRITICAL";
      const isHigh = violations.some((v) => v.severity === "HIGH") || mapping.priority === "HIGH";

      const handoffPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" = isCritical
        ? "CRITICAL"
        : isHigh
          ? "HIGH"
          : mapping.priority;

      return {
        passed: false,
        violations,
        sanitizedOutput: null,
        shouldHandoff: true,
        escalationReason: mapping.reason,
        handoffPriority,
        suppressResponse: true,
      };
    }

    return {
      passed: true,
      violations: [],
      sanitizedOutput: output,
      shouldHandoff: false,
      suppressResponse: false,
    };
  }

  /**
   * Pre-generation Inbound Message Guardrail
   * Evaluates incoming user messages to intercept discount demands, refund requests, or returns.
   */
  validateInbound(
    inboundText: string | null | undefined,
    context?: GuardrailContext,
    businessRules?: BusinessRuleLike[],
  ): GuardrailCheckResult {
    if (!inboundText?.trim()) {
      return {
        passed: true,
        violations: [],
        sanitizedOutput: inboundText ?? null,
        shouldHandoff: false,
        suppressResponse: false,
      };
    }

    const lower = inboundText.toLowerCase();
    const violations: GuardrailViolation[] = [];

    // 1. Check refund request (Trigger #3)
    if (this.isRefundInquiry(lower)) {
      violations.push({
        category: "unauthorized_refund",
        reason: "Customer inquiry requested refund requiring human authorization",
        matchedText: inboundText,
        severity: "CRITICAL",
      });
      return {
        passed: false,
        violations,
        sanitizedOutput: null,
        shouldHandoff: true,
        escalationReason: "refund_request",
        handoffPriority: "CRITICAL",
        suppressResponse: false,
      };
    }

    // 2. Check return/exchange inquiry (Trigger #4)
    if (this.isReturnInquiry(lower)) {
      violations.push({
        category: "unauthorized_refund",
        reason:
          "Customer inquiry requested merchandise return or exchange requiring human authorization",
        matchedText: inboundText,
        severity: "HIGH",
      });
      return {
        passed: false,
        violations,
        sanitizedOutput: null,
        shouldHandoff: true,
        escalationReason: "return_exchange",
        handoffPriority: "HIGH",
        suppressResponse: false,
      };
    }

    // 3. Check discount negotiation demands (Trigger #8)
    if (this.isDiscountInquiry(lower)) {
      const { aiMayOffer } = this.resolveDiscountPolicy(businessRules, context);

      if (!aiMayOffer) {
        violations.push({
          category: "unauthorized_discount",
          reason:
            "Customer inquiry requested discount or price negotiation with no active discount policy allowing AI concessions",
          matchedText: inboundText,
          severity: "HIGH",
          ruleType: "discount",
        });
        return {
          passed: false,
          violations,
          sanitizedOutput: null,
          shouldHandoff: true,
          escalationReason: "negotiation",
          handoffPriority: "HIGH",
          suppressResponse: false,
        };
      }
    }

    return {
      passed: true,
      violations: [],
      sanitizedOutput: inboundText,
      shouldHandoff: false,
      suppressResponse: false,
    };
  }

  /**
   * Resolves authorized discount limits from BusinessRules and context.
   */
  resolveDiscountPolicy(
    businessRules?: BusinessRuleLike[],
    context?: GuardrailContext,
  ): { aiMayOffer: boolean; maxAllowedPercent: number } {
    let aiMayOffer = false;
    let maxAllowedPercent = 0;

    const normalizedRules = Array.isArray(businessRules) ? businessRules : [];

    for (const rule of normalizedRules) {
      if (
        rule.rule_type === "discount" &&
        rule.enabled !== false &&
        rule.payload &&
        isBusinessRuleEffective(rule)
      ) {
        const payload = rule.payload as DiscountRulePayload;
        if (payload.ai_may_offer) {
          aiMayOffer = true;
          if (typeof payload.max_percent === "number") {
            maxAllowedPercent = Math.max(maxAllowedPercent, payload.max_percent);
          }
        }
      }
    }

    if (context?.activeDiscounts && context.activeDiscounts.length > 0) {
      for (const disc of context.activeDiscounts) {
        if (disc.aiMayOffer) {
          aiMayOffer = true;
          const maxP = disc.maxPercent ?? disc.percentage ?? 0;
          maxAllowedPercent = Math.max(maxAllowedPercent, maxP);
        }
      }
    }

    return { aiMayOffer, maxAllowedPercent };
  }

  /**
   * Discount Validator:
   * Detects percentage cuts, unapproved promotional offers, and promises in output.
   * Compares with active business rules (rule_type: discount).
   */
  validateDiscount(
    output: string,
    businessRules: BusinessRuleLike[],
    context?: GuardrailContext,
  ): GuardrailViolation | null {
    const lower = output.toLowerCase();

    // 1. Extract discount percentage mentioned in output
    const extractedPercent = this.extractDiscountPercentage(lower);
    const hasDiscountPhrase = DISCOUNT_PHRASE_RE.test(lower);

    if (extractedPercent === null && !hasDiscountPhrase) {
      return null;
    }

    // 2. Resolve authorized discount policy
    const { aiMayOffer, maxAllowedPercent } = this.resolveDiscountPolicy(businessRules, context);
    const isAffirmativePromise = AFFIRMATIVE_DISCOUNT_RE.test(lower);

    // If AI is not permitted to offer discounts at all:
    if (!aiMayOffer) {
      if (extractedPercent !== null || isAffirmativePromise) {
        return {
          category: "unauthorized_discount",
          reason: `AI output offered unauthorized discount (${extractedPercent !== null ? `${extractedPercent}%` : "promotional discount"}) with no active discount policy allowing AI offers.`,
          matchedText: output,
          severity: "HIGH",
          ruleType: "discount",
        };
      }
      return null;
    }

    // If AI is allowed to offer discounts up to maxAllowedPercent:
    if (extractedPercent !== null && extractedPercent > maxAllowedPercent) {
      return {
        category: "unauthorized_discount",
        reason: `AI output offered ${extractedPercent}% discount exceeding maximum authorized cap of ${maxAllowedPercent}%.`,
        matchedText: output,
        severity: "HIGH",
        ruleType: "discount",
      };
    }

    // When AI may offer discounts up to a cap, unquantified/unbounded discount promises bypass the cap
    if (extractedPercent === null && isAffirmativePromise) {
      return {
        category: "unauthorized_discount",
        reason: `AI output made an unquantified discount promise without a verifiable percentage within the authorized cap of ${maxAllowedPercent}%.`,
        matchedText: output,
        severity: "HIGH",
        ruleType: "discount",
      };
    }

    return null;
  }

  /**
   * Refund Validator:
   * Zero-tolerance detection of unauthorized refund approvals or promises.
   */
  validateRefund(output: string, _context?: GuardrailContext): GuardrailViolation | null {
    const matched = firstRegexMatch(output.toLowerCase(), UNAUTHORIZED_REFUND_PATTERNS);
    if (!matched) {
      return null;
    }

    return {
      category: "unauthorized_refund",
      reason: `Response contains unauthorized refund approval: "${matched}"`,
      matchedText: matched,
      severity: "CRITICAL",
      ruleType: "returns",
    };
  }

  /**
   * Complaint Safety & Anti-Upselling:
   * Suppresses product upselling, cross-selling, and promotions during complaints or refunds.
   */
  validateComplaintUpsell(output: string, context?: GuardrailContext): GuardrailViolation | null {
    const isComplaintOrRefund =
      context?.isComplaint === true ||
      context?.isRefund === true ||
      context?.customerIntent === "complaint" ||
      context?.customerIntent === "refund_request";

    if (!isComplaintOrRefund) {
      return null;
    }

    const matched = firstRegexMatch(output.toLowerCase(), COMPLAINT_UPSELL_PATTERNS);
    if (!matched) {
      return null;
    }

    return {
      category: "complaint_upsell",
      reason: `Suppressed product upselling during customer complaint or refund inquiry (matched: "${matched}")`,
      matchedText: matched,
      severity: "CRITICAL",
    };
  }

  /**
   * Payment Promises Validator:
   * Intercepts unapproved payment links, bank account sharing, or wire transfer promises.
   */
  validatePaymentPromises(output: string): GuardrailViolation | null {
    const matched = firstRegexMatch(output.toLowerCase(), PAYMENT_PROMISE_PATTERNS);
    if (!matched) {
      return null;
    }

    return {
      category: "payment_promise",
      reason: `Response contains unauthorized payment link or wire transfer promise: "${matched}"`,
      matchedText: matched,
      severity: "CRITICAL",
      ruleType: "payment",
    };
  }

  /**
   * False Delivery Guarantees Validator:
   * Intercepts ungrounded or exaggerated delivery promises.
   */
  validateDeliveryGuarantees(
    output: string,
    businessRules: BusinessRuleLike[],
    context?: GuardrailContext,
  ): GuardrailViolation | null {
    const lower = output.toLowerCase();

    const unconditionalMatch = firstRegexMatch(lower, UNCONDITIONAL_FREE_DELIVERY_PATTERNS);
    if (unconditionalMatch) {
      const hasZeroThresholdFreeShipping = businessRules.some((r) => {
        if (
          r.rule_type === "free_shipping" &&
          r.enabled !== false &&
          r.payload &&
          isBusinessRuleEffective(r)
        ) {
          const payload = r.payload as { threshold?: number };
          return payload.threshold === 0;
        }
        return false;
      });

      if (!hasZeroThresholdFreeShipping) {
        return {
          category: "delivery_guarantee",
          reason: `Response promises unconditional free delivery without matching business rule.`,
          matchedText: unconditionalMatch,
          severity: "HIGH",
          ruleType: "delivery",
        };
      }
    }

    const immediateMatch = firstRegexMatch(lower, FALSE_IMMEDIATE_DELIVERY_PATTERNS);
    if (immediateMatch) {
      const isOneOrTwoHours = /heure|hour|30 minutes|60 minute|ساعة|ساعتين|f(?:i)?\s+s[ae]3a/i.test(
        immediateMatch,
      );
      const targetMaxEtaHours = isOneOrTwoHours ? 2 : 24;

      const hasMatchingDeliveryZone =
        context?.deliveryZones?.some((z) => z.etaHours > 0 && z.etaHours <= targetMaxEtaHours) ||
        businessRules.some((r) => {
          if (r.rule_type === "delivery" && r.enabled !== false && r.payload) {
            const payload = r.payload as { zones?: { eta_hours?: number; etaHours?: number }[] };
            return payload.zones?.some((z) => {
              const eta = z.eta_hours ?? z.etaHours;
              return eta !== undefined && eta > 0 && eta <= targetMaxEtaHours;
            });
          }
          return false;
        });

      if (!hasMatchingDeliveryZone) {
        return {
          category: "delivery_guarantee",
          reason: `Response gives ungrounded specific delivery guarantee: "${immediateMatch}"`,
          matchedText: immediateMatch,
          severity: "HIGH",
          ruleType: "delivery",
        };
      }
    }

    return null;
  }

  /**
   * Blocked Topics Validator:
   * Checks for merchant-configured forbidden keywords.
   */
  validateBlockedTopics(output: string, blockedTopics?: string[]): GuardrailViolation | null {
    if (!blockedTopics || blockedTopics.length === 0) return null;

    const lower = output.toLowerCase();
    for (const topic of blockedTopics) {
      const t = topic.toLowerCase().trim();
      if (t && lower.includes(t)) {
        return {
          category: "blocked_topic",
          reason: `Response mentions blocked topic: "${topic}"`,
          matchedText: topic,
          severity: "CRITICAL",
        };
      }
    }

    return null;
  }

  /**
   * Extracts discount percentage from text using regex matching across languages.
   * Prevents false positives on product composition, satisfaction ratings, or general percentages.
   */
  extractDiscountPercentage(text: string): number | null {
    const patterns = [
      /(\d+)\s*%\s*(?:de\s+)?(?:remise|réduction|rabais|discount|off|de\s+moins|moins|solde|promo(?:tion)?|ta5fidh|تخفيض|خصم|حسم)/i,
      /(?:remise|réduction|rabais|discount|off|ta5fidh|promo(?:tion)?|solde|baisse|geste\s+commercial|تخفيض|خصم|حسم)\s*(?:de\s+|d'un\s+taux\s+de\s+|exceptionnelle\s+de\s+)?(\d+)\s*%/i,
      /(?:nna9aslek|na3mik\s+remise|nna9as|nna9soulek|ta5fidh|soum\s+a9al|نقصتلك|ننقصلك|نعملك\s+تخفيض)\s*(?:b\s*|بـ\s*)?(\d+)\s*%/i,
      /(?:cut|reduce|give\s+you|discount\s+of|save)\s*(\d+)\s*%/i,
      /(?:bénéficiez|profitez|obtenir|avoir|accorde|accordons|offre|offrons|faisons|fais)\s*(?:d'une?|d'un|une|un)?\s*(?:remise|réduction|rabais|promo)?\s*(?:de\s+)?(\d+)\s*%/i,
      /-\s*(\d+)\s*%\s*(?:sur|pour|de)?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const percentStr = match[1];
        if (percentStr) {
          const num = parseInt(percentStr, 10);
          if (!isNaN(num) && num > 0 && num <= 100) {
            return num;
          }
        }
      }
    }

    return null;
  }

  /**
   * Inbound refund inquiry (Trigger #3). Avoids generic tokens like standalone "flousi".
   */
  private isRefundInquiry(text: string): boolean {
    return firstRegexMatch(text, INBOUND_REFUND_PATTERNS) !== null;
  }

  /**
   * Inbound return/exchange inquiry (Trigger #4).
   */
  private isReturnInquiry(text: string): boolean {
    return firstRegexMatch(text, INBOUND_RETURN_PATTERNS) !== null;
  }

  /**
   * Inbound discount / price negotiation. Avoids generic tokens like standalone "sa3edni".
   */
  private isDiscountInquiry(text: string): boolean {
    return firstRegexMatch(text, INBOUND_DISCOUNT_PATTERNS) !== null;
  }
}
