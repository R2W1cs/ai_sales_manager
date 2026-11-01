import type { CanonicalIntent, ExtractedEntities, RuleMatch } from "@app/shared";

/**
 * Clean & normalize text for deterministic pattern matching.
 * Preserves Arabic script, Arabizi digits (3, 7, 5, 9), and accents.
 * Does NOT normalize Arabizi to MSA or transliterate Arabic.
 */
export function normalizeMessage(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove zero-width chars
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Boundary-aware match checker.
 * Matches word or phrase boundaries across Unicode letters, Arabic script, and Arabizi numbers.
 * Supports attached Arabic single-letter prefixes (لـ, بـ, وـ, كـ).
 */
export function containsPhrase(normalizedText: string, phrase: string): boolean {
  if (!normalizedText || !phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isArabic = /^[\u0600-\u06FF]/.test(phrase);
  const prefixPattern = isArabic ? "(?:^|[^\\p{L}\\p{N}])[لبوك]?" : "(?:^|[^\\p{L}\\p{N}])";
  const pattern = new RegExp(`${prefixPattern}${escaped}(?:$|[^\\p{L}\\p{N}])`, "u");
  return pattern.test(normalizedText);
}

/**
 * Extract explicit entities mentioned in message
 */
export function extractRuleEntities(normalizedText: string): ExtractedEntities {
  const entities: ExtractedEntities = {};

  // Size extraction (taille M, size L, 38, 40, etc.)
  const sizeMatch =
    /\b(?:taille|talle|size|t)\s*(xxl|xl|xs|[smlx]|\d{2})\b/i.exec(normalizedText) ??
    /(?:^|\s)(xxl|xl|xs|[smlx]|\d{2})(?:$|\s)/i.exec(normalizedText);
  if (sizeMatch?.[1]) {
    entities.size = sizeMatch[1].toUpperCase();
  }

  // Color extraction (French, English, Derja/Arabizi, Arabic script)
  const colors: Record<string, string> = {
    noir: "Noir",
    noire: "Noir",
    black: "Noir",
    akhel: "Noir",
    اكحل: "Noir",
    أكحل: "Noir",
    أسود: "Noir",
    blanc: "Blanc",
    blanche: "Blanc",
    white: "Blanc",
    abyedh: "Blanc",
    ابيض: "Blanc",
    أبيض: "Blanc",
    rouge: "Rouge",
    red: "Rouge",
    a7mer: "Rouge",
    احمر: "Rouge",
    أحمر: "Rouge",
    bleu: "Bleu",
    blue: "Bleu",
    azre9: "Bleu",
    ازرق: "Bleu",
    أزرق: "Bleu",
    vert: "Vert",
    green: "Vert",
    akhdher: "Vert",
    اخضر: "Vert",
    أخضر: "Vert",
    rose: "Rose",
    pink: "Rose",
    وردي: "Rose",
    gris: "Gris",
    grey: "Gris",
    rmedi: "Gris",
    رمادي: "Gris",
    marron: "Marron",
    brown: "Marron",
    kahwi: "Marron",
    بني: "Marron",
    beige: "Beige",
    بيج: "Beige",
  };

  for (const [key, val] of Object.entries(colors)) {
    if (containsPhrase(normalizedText, key)) {
      entities.color = val;
      break;
    }
  }

  // Tunisian Location extraction (Latin & Arabic script)
  const locations: Record<string, string> = {
    tunis: "Tunis",
    تونس: "Tunis",
    ariana: "Ariana",
    أريانة: "Ariana",
    اريانة: "Ariana",
    "ben arous": "Ben Arous",
    "بن عروس": "Ben Arous",
    mannouba: "Manouba",
    manouba: "Manouba",
    منوبة: "Manouba",
    sousse: "Sousse",
    سوسة: "Sousse",
    sfax: "Sfax",
    صفاقس: "Sfax",
    bizerte: "Bizerte",
    بنزرت: "Bizerte",
    nabeul: "Nabeul",
    نابل: "Nabeul",
    monastir: "Monastir",
    المنستير: "Monastir",
    منستير: "Monastir",
    gabes: "Gabes",
    قابس: "Gabes",
    kairouan: "Kairouan",
    القيروان: "Kairouan",
    قيروان: "Kairouan",
    gafsa: "Gafsa",
    قفصة: "Gafsa",
    mahdia: "Mahdia",
    المهدية: "Mahdia",
    مهدية: "Mahdia",
    djerba: "Djerba",
    جربة: "Djerba",
    tozeur: "Tozeur",
    توزر: "Tozeur",
    kasserine: "Kasserine",
    القصرين: "Kasserine",
    beja: "Beja",
    باجة: "Beja",
    jendouba: "Jendouba",
    جندوبة: "Jendouba",
    kef: "Kef",
    الكاف: "Kef",
    siliana: "Siliana",
    سليانة: "Siliana",
    zaghouan: "Zaghouan",
    زغوان: "Zaghouan",
    medenine: "Medenine",
    مدنين: "Medenine",
    tataouine: "Tataouine",
    تطاوين: "Tataouine",
    kebili: "Kebili",
    قبلي: "Kebili",
    hammamet: "Hammamet",
    الحمامات: "Hammamet",
    marsa: "Marsa",
    المرسى: "Marsa",
  };

  for (const [key, val] of Object.entries(locations)) {
    if (containsPhrase(normalizedText, key)) {
      entities.location = val;
      break;
    }
  }

  // Quantity extraction
  const qtyMatch =
    /\b(\d+)\s*(?:pieces|pièces|ka3ba|ka3bet|paires|articles)\b/i.exec(normalizedText) ??
    /\b(\d+)\s*menha\b/i.exec(normalizedText);
  if (qtyMatch?.[1]) {
    const qty = parseInt(qtyMatch[1], 10);
    if (!isNaN(qty) && qty > 0) {
      entities.quantity = qty;
    }
  }

  return entities;
}

export interface RuleDefinition {
  id: string;
  intent: CanonicalIntent;
  confidence: number;
  phrases: string[];
  patterns?: RegExp[];
  priority: number;
}

/**
 * Centralized, structured rule catalog for high-confidence cases.
 * Ordered by strict priority: Human Safety / Escalation > Commercial Intent > Queries > Greetings.
 */
export const DETERMINISTIC_RULES: RuleDefinition[] = [
  // 1. Human Request (Highest Safety Priority)
  {
    id: "rule_human_request",
    intent: "human_request",
    confidence: 0.98,
    priority: 100,
    phrases: [
      "choufli 3abd",
      "nkalem 3abd",
      "choufli 7ad",
      "nkalem 7ad",
      "n7ki m3a responsable",
      "nhki m3a responsable",
      "nheb nahki m3a personne",
      "nheb نحكي مع personne",
      "nheb agent",
      "nheb quelqu'un",
      "khalleli quelqu'un",
      "parler à un humain",
      "parler a un conseiller",
      "parler à un conseiller",
      "parler a un responsable",
      "parler avec quelqu'un",
      "transferer a un humain",
      "transferer vers un conseiller",
      "service client",
      "service apres vente",
      "sav",
      "human agent",
      "talk to human",
      "operator",
      "agent commercial",
      "agent",
      "responsable",
      "conseiller",
      "besoin d'aide humaine",
      "نحب نحكي مع انسان",
      "نحب نحكي مع حد",
      "نحب مسؤول",
      "نحب عبد",
      "حولني لمسؤول",
      "كلمني عبد",
      "خدمة الحرفاء",
      "خدمة ما بعد البيع",
    ],
  },

  // 2. Complaint
  {
    id: "rule_complaint",
    intent: "complaint",
    confidence: 0.95,
    priority: 95,
    phrases: [
      "reclamation",
      "réclamation",
      "mouch behi",
      "khed3ouni",
      "khde3touni",
      "khed3a",
      "khad3a",
      "defectueux",
      "défectueux",
      "retard kbir",
      "service décevant",
      "grosse arnaque",
      "mauvaise qualité",
      "mouch kima fl tsawer",
      "qualite khayba",
      "qualite 0",
      "produit endommagé",
      "produit casse",
      "produit cassé",
      "commande na9sa",
      "retard abusif",
      "mouch normal",
      "sayeb 3likom",
      "mahich beya",
      "سلعة خايبة",
      "شكاية",
      "تأخير كبير",
      "غشيتوني",
      "سلعة مكسرة",
      "كوموند ناقصة",
      "جودة رديئة",
      "كارثة",
    ],
  },

  // 3. Purchase Intent
  {
    id: "rule_purchase_intent",
    intent: "purchase_intent",
    confidence: 0.92,
    priority: 90,
    phrases: [
      "nheb nechri",
      "n7eb nechri",
      "nheb neshri",
      "n7eb neshri",
      "nheb nchri",
      "n7eb nchri",
      "neshri",
      "nechri",
      "nchri",
      "nheb menha",
      "n7eb menha",
      "nheb hethi",
      "n7eb hethi",
      "nheb hetha",
      "n7eb hetha",
      "ab3athli",
      "ab3atli",
      "nvalidi",
      "ncommander",
      "n3adi commande",
      "nheb n3adiha",
      "n7eb n3adiha",
      "passer commande",
      "passi commande",
      "npassi commande",
      "je veux acheter",
      "je veux passer commande",
      "je souhaite commander",
      "je passe commande",
      "enregistrer ma commande",
      "confirmer ma commande",
      "take my order",
      "i want to buy",
      "نحب نشري",
      "نحب نشريها",
      "نحب نعدي كومند",
      "نحب نعدي commande",
      "عديلي كوموند",
      "سجللي طلب",
      "نحب نثبت الكومند",
    ],
  },

  // 4. Return & Exchange Inquiry
  {
    id: "rule_return_inquiry",
    intent: "return_inquiry",
    confidence: 0.9,
    priority: 85,
    phrases: [
      "nheb nbaddel",
      "n7eb nbaddel",
      "najem nbaddel",
      "najjem nbaddel",
      "tbaddlou",
      "tbadlou",
      "tbaddlou taille",
      "tbadlou taille",
      "rechange",
      "retours",
      "retour",
      "famma retour",
      "famma retours",
      "retourner",
      "retourner l'article",
      "politique de retour",
      "procedure de retour",
      "échange de produit",
      "échange",
      "echange",
      "échanger",
      "echanger",
      "changer de taille",
      "changer d'article",
      "demande d'échange",
      "demande d'echange",
      "remboursement",
      "rembourser",
      "نحب نبدل",
      "نجم نبدل",
      "نحب نرجع",
      "ترجيع",
      "تبديل",
      "استرجاع",
      "ارجاع المنتج",
    ],
  },

  // 5. Payment Inquiry (COD / Payment methods take precedence)
  {
    id: "rule_payment_inquiry",
    intent: "payment_inquiry",
    confidence: 0.88,
    priority: 82,
    phrases: [
      "paiement a la livraison",
      "paiement à la livraison",
      "payable à la livraison",
      "payable a la livraison",
      "paiement",
      "kifech n5ales",
      "kifech nkhales",
      "kifeh n5ales",
      "kifeh nkhalles",
      "kifech el paiement",
      "kifeh el khlas",
      "khlas a la livraison",
      "khlas d17",
      "flouci",
      "virement",
      "t9eblou chèque",
      "t9eblou carte",
      "par carte",
      "espece",
      "espèce",
      "moyens de paiement",
      "modes de paiement",
      "mode de paiement",
      "payer par carte",
      "règlement",
      "reglement",
      "cash on delivery",
      "كيفاش نخلص",
      "كيفاش الخلاص",
      "خلاص عند التوصيل",
      "طريقة الدفع",
      "بالبطاقة البنكية",
    ],
  },

  // 6. Delivery Inquiry
  {
    id: "rule_delivery_inquiry",
    intent: "delivery_inquiry",
    confidence: 0.9,
    priority: 80,
    phrases: [
      "famma livraison",
      "fama livraison",
      "famma livrezon",
      "9addeh livraison",
      "9adeh livraison",
      "b9adech livraison",
      "b9adeh livraison",
      "frais de livraison",
      "frais de port",
      "délai de livraison",
      "délai d'expédition",
      "delai d'expedition",
      "zone de livraison",
      "livraison à domicile",
      "livraison a domicile",
      "livraison gratuite",
      "twaslou l",
      "twaslou",
      "livrez-vous",
      "livrez vous",
      "wa9tech tousel",
      "wa9teh tousel",
      "livraison",
      "فما توصيل",
      "بقداش التوصيل",
      "قداش التوصيل",
      "توصيل ل",
      "قداش وقت التوصيل",
      "وقتاش توصل",
      "توصيل مجاني",
      "شكون يوصل",
    ],
  },

  // 7. Order Status
  {
    id: "rule_order_status",
    intent: "order_status",
    confidence: 0.9,
    priority: 75,
    phrases: [
      "win woslet el commande",
      "win woslet commande",
      "win weslet",
      "win woslet",
      "win woslet el coli",
      "statut mte3 commande",
      "suivi de commande",
      "statut commande",
      "commande mte3i",
      "numéro de commande",
      "suivi de ma commande",
      "numéro de suivi",
      "numero de suivi",
      "tracking",
      "suivi colis",
      "état de ma commande",
      "où en est ma commande",
      "ou en est ma commande",
      "mon colis est où",
      "suivre ma commande",
      "where is my order",
      "وين وصلت الكومند",
      "وين وصلت commande",
      "وين وصلت",
      "وين وصل الكولي",
      "حالة الطلب",
      "رقم التتبع",
    ],
  },

  // 8. Discount & Promo Inquiry
  {
    id: "rule_discount_inquiry",
    intent: "discount_inquiry",
    confidence: 0.88,
    priority: 70,
    phrases: [
      "code promo",
      "famma promo",
      "famma un code promo",
      "famma solde",
      "famma rkhos",
      "tna9asli",
      "tna9asli f soum",
      "tna9sou",
      "a3mali remise",
      "remise",
      "réduction",
      "reduction",
      "reduction speciale",
      "offre speciale",
      "offre spéciale",
      "promo flash",
      "solde",
      "code promotionnel",
      "remise spéciale",
      "un code promo",
      "promo",
      "فما برومو",
      "فما تخفيض",
      "تنقصلي في السوم",
      "كود برومو",
      "تخفيض خاص",
      "عرض خاص",
    ],
  },

  // 9. Stock & Availability Check
  {
    id: "rule_stock_check",
    intent: "stock_check",
    confidence: 0.85,
    priority: 60,
    phrases: [
      "famma f stock",
      "fama f stock",
      "famma menha",
      "fama menha",
      "mazel famma",
      "mazel mawjoud",
      "mazelt mawjouda",
      "mawjoud",
      "mawjouda",
      "dispo",
      "dispos",
      "fama stock",
      "famma stock",
      "wfa el stock",
      "wfa",
      "en rupture",
      "rupture de stock",
      "rupture",
      "en stock",
      "du stock",
      "dispo f stock",
      "dispo tawa",
      "disponible tawa",
      "disponible en stock",
      "disponible actuellement",
      "disponibilité immédiate",
      "disponible",
      "disponibles",
      "disponibilité",
      "disponibilite",
      "avez-vous du stock",
      "est-ce disponible",
      "is this in stock",
      "فما في الستوك",
      "فما منها",
      "مازال موجود",
      "مازالت متوفرة",
      "مازال متوفر",
      "متوفر في المخزون",
      "متوفر",
      "متوفرة",
      "وفى الستوك",
    ],
  },

  // 10. Price Question
  {
    id: "rule_price_question",
    intent: "price_question",
    confidence: 0.85,
    priority: 55,
    phrases: [
      "b9adech",
      "9addeh",
      "b9adeh",
      "9adeh",
      "ch7al",
      "ch7al el prix",
      "soumou",
      "soum",
      "soum el pack",
      "soum el article",
      "9adeh soumou",
      "bch7al",
      "tarifs",
      "tarif",
      "cout",
      "coût",
      "c'est combien",
      "c combien",
      "quel est le prix",
      "combien ça coûte",
      "combien coute",
      "combien",
      "prix",
      "price",
      "how much",
      "بقداش",
      "قداش السوم",
      "شحال سومو",
      "كم السعر",
      "قداش الباك",
      "السعر من فضلك",
    ],
  },

  // 11. Product Inquiry
  {
    id: "rule_product_inquiry",
    intent: "product_inquiry",
    confidence: 0.85,
    priority: 50,
    phrases: [
      "fiche produit",
      "fiche technique",
      "détails du modèle",
      "details du modele",
      "détails du produit",
      "details du produit",
      "information sur l'article",
      "information sur le produit",
      "guide des tailles",
      "tableau des tailles",
      "composition du produit",
      "matière",
      "matiere",
      "photos réelles",
      "tsawer réelles",
      "catalogue",
      "ch3andkom",
      "sh3andkom",
      "chneya 3andkom",
      "chnawa 3andkom",
      "chnowa 3andkom",
      "chfamma jdid",
      "chfama jdid",
      "warini ch3andkom",
      "warina ch3andkom",
      "a3tini les articles",
      "a3tini les modeles",
      "famma sbabet",
      "fama sbabet",
      "3andkom sbabet",
      "famma hweyej",
      "fama hweyej",
      "3andkom hweyej",
      "famma chemise",
      "3andkom chemise",
      "famma des modeles",
      "famma des articles",
      "qu'est-ce que vous avez",
      "qu'est ce que vous avez",
      "vous avez quoi",
      "vos articles",
      "vos modeles",
      "vos modèles",
      "quels sont vos produits",
      "شنوة عندكم",
      "شنية عندكم",
      "شعندكم",
      "وريني",
      "شنية الموديلات",
      "فما سبابط",
      "عندكم سبابط",
      "معلومات على المنتج",
      "تفاصيل الموديل",
      "جدول المقاسات",
      "مكونات المنتج",
    ],
  },

  // 12. Greeting
  {
    id: "rule_greeting",
    intent: "greeting",
    confidence: 0.85,
    priority: 40,
    phrases: [
      "3aslema",
      "aslema",
      "3aslem",
      "aslem",
      "slem",
      "slm",
      "salem",
      "ahla",
      "ahla bik",
      "ahla w sahla",
      "mar7ba",
      "marhaba",
      "marhba bik",
      "salam",
      "salam alaykom",
      "bonjour",
      "bonjour à tous",
      "bonsoir",
      "salut",
      "salut cv",
      "coucou",
      "hello",
      "hi",
      "hi there",
      "سلام",
      "عسلامة",
      "مرحبا",
      "صباح الخير",
      "مساء الخير",
      "أهلا",
      "أهلا وسهلا",
      "تحياتي",
    ],
  },
];

/**
 * Match inbound message against structured deterministic rules.
 * Returns RuleMatch with entities if a high-confidence match is found; otherwise returns null.
 */
export function matchRuleIntent(text: string): RuleMatch | null {
  const normalized = normalizeMessage(text);
  if (!normalized) {
    return null;
  }

  const matchedRules: { rule: RuleDefinition; confidence: number }[] = [];

  for (const rule of DETERMINISTIC_RULES) {
    const isMatched = rule.phrases.some((phrase) => containsPhrase(normalized, phrase));
    if (isMatched) {
      matchedRules.push({ rule, confidence: rule.confidence });
    }
  }

  if (matchedRules.length === 0) {
    return null;
  }

  // Sort matches by priority descending, then confidence descending
  matchedRules.sort((a, b) => {
    if (b.rule.priority !== a.rule.priority) {
      return b.rule.priority - a.rule.priority;
    }
    return b.confidence - a.confidence;
  });

  const primary = matchedRules[0];
  if (!primary || primary.confidence < 0.85) {
    return null;
  }

  const secondary: CanonicalIntent[] = [];
  const seenIntents = new Set<CanonicalIntent>([primary.rule.intent]);
  for (let i = 1; i < matchedRules.length; i++) {
    const matched = matchedRules[i];
    if (matched) {
      const intent = matched.rule.intent;
      if (!seenIntents.has(intent)) {
        seenIntents.add(intent);
        secondary.push(intent);
      }
    }
  }

  const entities = extractRuleEntities(normalized);

  return {
    intent: primary.rule.intent,
    confidence: primary.confidence,
    matchedRule: primary.rule.id,
    secondary,
    entities,
  };
}

const TUNIZI_MARKERS = [
  "3aslema",
  "3aslama",
  "salem",
  "famma",
  "famech",
  "9addeh",
  "9adeh",
  "b9adech",
  "soum",
  "nheb",
  "twaslou",
  "livraison",
  "choufli",
  "nkalem",
  "sbabet",
  "mte3na",
  "barcha",
  "kifech",
  "chbih",
  "chkoun",
  "brabi",
];

/**
 * Detects if the text contains Tunisian Arabic / Arabizi markers.
 */
export function isTunisianDialect(text: string): boolean {
  if (!text) return false;
  const normalized = normalizeMessage(text);
  return TUNIZI_MARKERS.some((marker) => containsPhrase(normalized, marker));
}

export const RuleIntentClassifier = {
  match: matchRuleIntent,
  isTunisianDialect,
};
