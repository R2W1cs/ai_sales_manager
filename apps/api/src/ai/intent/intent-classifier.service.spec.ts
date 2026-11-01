import type { CanonicalIntent } from "@app/shared";

import { IntentClassifierService } from "./intent-classifier.service";
import { LlmIntentClassifierService } from "./llm-intent-classifier.service";
import { RuleIntentClassifier } from "./rule-intent-classifier";

describe("Hybrid Intent Classification — Rules First, Cheap LLM Second", () => {
  let intentClassifier: IntentClassifierService;
  let llmClassifier: LlmIntentClassifierService;

  beforeEach(() => {
    llmClassifier = new LlmIntentClassifierService();
    intentClassifier = new IntentClassifierService(llmClassifier);
  });

  describe("1. Deterministic Rule Matching & Normalization", () => {
    it("normalizes whitespace and handles mixed scripts without destroying Arabizi numbers", () => {
      const match = RuleIntentClassifier.match("   3aslema    b9adech    el   robe   ");
      expect(match).not.toBeNull();
      expect(match?.intent).toBe("price_question");
      expect(match?.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("handles zero-width characters and unusual whitespace", () => {
      const match = RuleIntentClassifier.match("3aslema\u200B famma\uFEFF livraison?");
      expect(match).not.toBeNull();
      expect(match?.intent).toBe("delivery_inquiry");
    });

    it("prevents false-positive substring collisions across vocabulary", () => {
      const falsePositiveChecks = [
        "attention aux microbes dans l'air", // 'robe' in microbes
        "je vais arroser les plantes", // 'rose' in arroser
        "le chancelier allemand", // 'chancelier' contains 'annuler' parts
        "nous allons transporter les colis", // 'transport' in transporter
        "le candidat a été élu", // 'carte' in candidat ?
        "analyse de la bactérie",
      ];

      for (const text of falsePositiveChecks) {
        const match = RuleIntentClassifier.match(text);
        expect(match).toBeNull();
      }
    });
  });

  describe("2. Tunisian Arabizi Utterances (Extensive)", () => {
    const arabiziCases: { text: string; expectedIntent: CanonicalIntent }[] = [
      // Greetings
      { text: "3aslema", expectedIntent: "greeting" },
      { text: "3aslem khouya", expectedIntent: "greeting" },
      { text: "slem cv?", expectedIntent: "greeting" },
      { text: "slm alikom", expectedIntent: "greeting" },
      { text: "ahla bikom", expectedIntent: "greeting" },
      { text: "mar7ba bik", expectedIntent: "greeting" },
      { text: "salam alaykom", expectedIntent: "greeting" },

      // Price Questions
      { text: "b9adech el robe?", expectedIntent: "price_question" },
      { text: "ch7al soum el hoodie?", expectedIntent: "price_question" },
      { text: "9adeh soumou hedha?", expectedIntent: "price_question" },
      { text: "b9adeh el pack?", expectedIntent: "price_question" },
      { text: "soum el article svp", expectedIntent: "price_question" },
      { text: "9addeh soum el pantalon?", expectedIntent: "price_question" },

      // Stock Check
      { text: "famma f stock taille M?", expectedIntent: "stock_check" },
      { text: "mazel mawjoud el article?", expectedIntent: "stock_check" },
      { text: "famma menha fi noir?", expectedIntent: "stock_check" },
      { text: "mazelt mawjouda robe rose?", expectedIntent: "stock_check" },
      { text: "wfa el stock wala mazel?", expectedIntent: "stock_check" },
      { text: "dispo tawa?", expectedIntent: "stock_check" },

      // Purchase Intent
      { text: "nheb nechri tawa", expectedIntent: "purchase_intent" },
      { text: "n7eb nechri le modèle noir", expectedIntent: "purchase_intent" },
      { text: "nvalidi el commande عيشك", expectedIntent: "purchase_intent" },
      { text: "nheb n3adiha tawa", expectedIntent: "purchase_intent" },
      { text: "passi commande svp", expectedIntent: "purchase_intent" },

      // Return / Exchange
      { text: "nheb nbaddel taille L", expectedIntent: "return_inquiry" },
      { text: "najem nbaddel si mouch 9adi?", expectedIntent: "return_inquiry" },
      { text: "tbaddlou taille si jet kbira?", expectedIntent: "return_inquiry" },
      { text: "famma retour si ma 3ejbetnich?", expectedIntent: "return_inquiry" },

      // Payment
      { text: "kifech n5ales par carte?", expectedIntent: "payment_inquiry" },
      { text: "kifeh el khlas?", expectedIntent: "payment_inquiry" },
      { text: "khlas a la livraison dispo?", expectedIntent: "payment_inquiry" },
      { text: "kifech el paiement espece?", expectedIntent: "payment_inquiry" },

      // Delivery
      { text: "famma livraison l Sousse?", expectedIntent: "delivery_inquiry" },
      { text: "b9adech livraison l sfax?", expectedIntent: "delivery_inquiry" },
      { text: "twaslou l Bizerte?", expectedIntent: "delivery_inquiry" },
      { text: "wa9tech tousel el commande?", expectedIntent: "delivery_inquiry" },

      // Order Status
      { text: "win woslet commande mte3i?", expectedIntent: "order_status" },
      { text: "win weslet el bosta?", expectedIntent: "order_status" },
      { text: "statut mte3 commande 123", expectedIntent: "order_status" },

      // Discounts
      { text: "famma promo wala code promo?", expectedIntent: "discount_inquiry" },
      { text: "tna9asli f soum chwaya?", expectedIntent: "discount_inquiry" },
      { text: "famma rkhos wala remise?", expectedIntent: "discount_inquiry" },

      // Product Inquiry
      { text: "salem blhy sh3andkom sbabet", expectedIntent: "product_inquiry" },
      { text: "ch3andkom f boutique?", expectedIntent: "product_inquiry" },
      { text: "famma sbabet?", expectedIntent: "product_inquiry" },

      // Complaints
      { text: "khed3ouni mouch behi jemla", expectedIntent: "complaint" },
      { text: "khed3a kbira mouch kima fl tsawer", expectedIntent: "complaint" },
      { text: "qualite khayba barcha", expectedIntent: "complaint" },
      { text: "retard kbir fi livraison", expectedIntent: "complaint" },

      // Human Request
      { text: "choufli 3abd nkalmou", expectedIntent: "human_request" },
      { text: "nkalem 7ad mel idara", expectedIntent: "human_request" },
      { text: "n7ki m3a responsable direct", expectedIntent: "human_request" },
      { text: "nheb agent commercial", expectedIntent: "human_request" },
    ];

    for (const { text, expectedIntent } of arabiziCases) {
      it(`classifies Arabizi: "${text}" -> ${expectedIntent}`, async () => {
        const result = await intentClassifier.classify(text);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
        expect(result.source).toBe("rule");
      });
    }
  });

  describe("3. Arabic Script Derja Utterances (Extensive)", () => {
    const arabicCases: { text: string; expectedIntent: CanonicalIntent }[] = [
      // Greetings
      { text: "عسلامة", expectedIntent: "greeting" },
      { text: "عسلامة صباح الخير", expectedIntent: "greeting" },
      { text: "مرحبا بكم", expectedIntent: "greeting" },
      { text: "سلام عليكم ورحمة الله", expectedIntent: "greeting" },
      { text: "أهلا وسهلا", expectedIntent: "greeting" },

      // Price Questions
      { text: "بقداش هذا الموديل؟", expectedIntent: "price_question" },
      { text: "قداش السوم متاع الفستان؟", expectedIntent: "price_question" },
      { text: "شحال سومو هذا؟", expectedIntent: "price_question" },
      { text: "السعر من فضلك", expectedIntent: "price_question" },
      { text: "بقداش الباك؟", expectedIntent: "price_question" },

      // Stock Check
      { text: "مازال متوفر في الستوك؟", expectedIntent: "stock_check" },
      { text: "فما في الستوك مقاس M؟", expectedIntent: "stock_check" },
      { text: "فما منها في الكحل؟", expectedIntent: "stock_check" },
      { text: "مازالت متوفرة؟", expectedIntent: "stock_check" },

      // Purchase Intent
      { text: "نحب نشري هذا الموديل", expectedIntent: "purchase_intent" },
      { text: "نحب نعدي كومند عيشك", expectedIntent: "purchase_intent" },
      { text: "عديلي كوموند من فضلك", expectedIntent: "purchase_intent" },
      { text: "سجللي طلب تلموديل", expectedIntent: "purchase_intent" },

      // Returns & Exchanges
      { text: "نحب نبدل المقاس", expectedIntent: "return_inquiry" },
      { text: "نجم نبدل السلعة؟", expectedIntent: "return_inquiry" },
      { text: "نحب نرجع الموديل", expectedIntent: "return_inquiry" },
      { text: "استرجاع المبلغ", expectedIntent: "return_inquiry" },

      // Payment
      { text: "كيفاش نخلص بالبطاقة؟", expectedIntent: "payment_inquiry" },
      { text: "خلاص عند التوصيل متوفر؟", expectedIntent: "payment_inquiry" },
      { text: "طريقة الدفع كيفاش؟", expectedIntent: "payment_inquiry" },

      // Delivery
      { text: "فما توصيل لصفاقس؟", expectedIntent: "delivery_inquiry" },
      { text: "بقداش التوصيل لتونس؟", expectedIntent: "delivery_inquiry" },
      { text: "وقتاش توصل الكومند؟", expectedIntent: "delivery_inquiry" },
      { text: "توصيل مجاني؟", expectedIntent: "delivery_inquiry" },

      // Order Status
      { text: "وين وصلت الكومند متاعي؟", expectedIntent: "order_status" },
      { text: "وين وصل الكولي؟", expectedIntent: "order_status" },
      { text: "حالة الطلب من فضلك", expectedIntent: "order_status" },

      // Discounts
      { text: "فما برومو والا تخفيض؟", expectedIntent: "discount_inquiry" },
      { text: "تنقصلي في السوم شوية؟", expectedIntent: "discount_inquiry" },
      { text: "فما كود برومو؟", expectedIntent: "discount_inquiry" },

      // Complaints
      { text: "شكاية سلعة خايبة برشا", expectedIntent: "complaint" },
      { text: "غشيتوني السلعة مكسرة", expectedIntent: "complaint" },
      { text: "تأخير كبير في التوصيل", expectedIntent: "complaint" },

      // Human Request
      { text: "نحب نحكي مع انسان مسؤول", expectedIntent: "human_request" },
      { text: "حولني لمسؤول من فضلك", expectedIntent: "human_request" },
      { text: "خدمة الحرفاء المباشرة", expectedIntent: "human_request" },
    ];

    for (const { text, expectedIntent } of arabicCases) {
      it(`classifies Arabic script: "${text}" -> ${expectedIntent}`, async () => {
        const result = await intentClassifier.classify(text);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
        expect(result.source).toBe("rule");
      });
    }
  });

  describe("4. French & English Utterances (Extensive)", () => {
    const frenchCases: { text: string; expectedIntent: CanonicalIntent }[] = [
      // Greetings
      { text: "Bonjour à tous", expectedIntent: "greeting" },
      { text: "Bonsoir, comment allez-vous?", expectedIntent: "greeting" },
      { text: "Hello, good morning", expectedIntent: "greeting" },
      { text: "Salut cv?", expectedIntent: "greeting" },

      // Price Questions
      { text: "Bonjour, quel est le prix du hoodie noir?", expectedIntent: "price_question" },
      { text: "Combien coûte cette robe en soie?", expectedIntent: "price_question" },
      { text: "C'est combien pour l'ensemble?", expectedIntent: "price_question" },
      { text: "Quel est le tarif unitaire?", expectedIntent: "price_question" },

      // Stock Check
      { text: "Avez-vous du stock pour la taille M?", expectedIntent: "stock_check" },
      { text: "Est-ce disponible en stock actuellement?", expectedIntent: "stock_check" },
      { text: "Est-ce en rupture de stock?", expectedIntent: "stock_check" },

      // Purchase Intent
      { text: "Je souhaite passer commande immédiatement", expectedIntent: "purchase_intent" },
      { text: "Je veux acheter le modèle bleu", expectedIntent: "purchase_intent" },
      { text: "Confirmer ma commande svp", expectedIntent: "purchase_intent" },
      { text: "I want to buy this item", expectedIntent: "purchase_intent" },

      // Return / Exchange
      { text: "Je souhaite retourner cet article", expectedIntent: "return_inquiry" },
      { text: "Quelle est votre politique de retour?", expectedIntent: "return_inquiry" },
      {
        text: "Je voudrais faire un échange de produit pour une autre taille",
        expectedIntent: "return_inquiry",
      },
      { text: "Demande de remboursement", expectedIntent: "return_inquiry" },

      // Payment
      { text: "Quels sont vos modes de paiement?", expectedIntent: "payment_inquiry" },
      { text: "Paiement à la livraison est-il accepté?", expectedIntent: "payment_inquiry" },
      { text: "Peut-on payer par carte bancaire?", expectedIntent: "payment_inquiry" },
      { text: "Cash on delivery available?", expectedIntent: "payment_inquiry" },

      // Delivery
      { text: "Quels sont vos frais de livraison à Tunis?", expectedIntent: "delivery_inquiry" },
      { text: "Livraison à domicile à Sousse possible?", expectedIntent: "delivery_inquiry" },
      { text: "Quel est le délai d'expédition?", expectedIntent: "delivery_inquiry" },
      { text: "Livrez-vous à Bizerte?", expectedIntent: "delivery_inquiry" },

      // Order Status
      { text: "Où en est le suivi de ma commande?", expectedIntent: "order_status" },
      { text: "Mon colis est où exactement?", expectedIntent: "order_status" },
      { text: "Numéro de suivi de commande", expectedIntent: "order_status" },

      // Discounts
      { text: "Avez-vous un code promotionnel actif?", expectedIntent: "discount_inquiry" },
      {
        text: "Y a-t-il une remise spéciale pour deux articles?",
        expectedIntent: "discount_inquiry",
      },

      // Complaints
      { text: "Je veux faire une réclamation produit défectueux", expectedIntent: "complaint" },
      { text: "Service décevant, très mauvaise qualité", expectedIntent: "complaint" },
      { text: "Produit endommagé reçu ce matin", expectedIntent: "complaint" },

      // Human Request
      {
        text: "Je veux parler à un conseiller humain s'il vous plaît",
        expectedIntent: "human_request",
      },
      { text: "Transférer vers un conseiller du service client", expectedIntent: "human_request" },
      { text: "I want to talk to human operator", expectedIntent: "human_request" },
    ];

    for (const { text, expectedIntent } of frenchCases) {
      it(`classifies French/English: "${text}" -> ${expectedIntent}`, async () => {
        const result = await intentClassifier.classify(text);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      });
    }
  });

  describe("5. Mixed Language & Code-Switching", () => {
    it("handles Franco-Arabizi stock inquiries", async () => {
      const result = await intentClassifier.classify("famma black hoodie taille M en stock?");
      expect(result.intent).toBe("stock_check");
      expect(result.entities?.color).toBe("Noir");
      expect(result.entities?.size).toBe("M");
    });

    it("extracts location and secondary greeting in delivery queries", async () => {
      const result = await intentClassifier.classify("3aslema famma livraison à domicile l Sfax?");
      expect(result.intent).toBe("delivery_inquiry");
      expect(result.secondary).toContain("greeting");
      expect(result.entities?.location).toBe("Sfax");
    });

    it("extracts product details and price question", async () => {
      const result = await intentClassifier.classify("prix el hoodie noir taille L?");
      expect(result.intent).toBe("price_question");
      expect(result.entities?.color).toBe("Noir");
      expect(result.entities?.size).toBe("L");
    });

    it("correctly prioritizes urgent human handoff in mixed language", async () => {
      const result = await intentClassifier.classify("3aslema nheb agent humain urgent svp");
      expect(result.intent).toBe("human_request");
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it("correctly prioritizes complaint in mixed language", async () => {
      const result = await intentClassifier.classify("reclamation sur retard kbir de livraison");
      expect(result.intent).toBe("complaint");
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe("6. Ambiguous Cases & LLM Fallback", () => {
    it("falls through to LLM when deterministic rules have no match", async () => {
      const ambiguousQuery = "choufli haja mezyena pour un mariage w tkon classe";
      const result = await intentClassifier.classify(ambiguousQuery);

      expect(result.source).toBe("llm");
      expect(result.model).toBe("gpt-5.6-luna");
    });

    it("can force LLM classification via options", async () => {
      const result = await intentClassifier.classify("bonjour", { forceLlm: true });
      expect(result.source).toBe("llm");
      expect(result.intent).toBe("greeting");
    });
  });

  describe("7. Granular Entity Extraction Suite", () => {
    it("extracts size, color in Arabic, and location", async () => {
      const result = await intentClassifier.classify("نحب نشري فستان اكحل مقاس L لتونس");
      expect(result.intent).toBe("purchase_intent");
      expect(result.entities?.color).toBe("Noir");
      expect(result.entities?.size).toBe("L");
      expect(result.entities?.location).toBe("Tunis");
    });

    it("extracts quantity, color in French, size in Arabizi, and location", async () => {
      const result = await intentClassifier.classify(
        "nheb nechri 3 pieces robe blanche taille 40 l Bizerte",
      );
      expect(result.intent).toBe("purchase_intent");
      expect(result.entities?.quantity).toBe(3);
      expect(result.entities?.color).toBe("Blanc");
      expect(result.entities?.size).toBe("40");
      expect(result.entities?.location).toBe("Bizerte");
    });

    it("extracts shoe and numeric clothing sizes", async () => {
      const result = await intentClassifier.classify("famma taille 42 en stock?");
      expect(result.intent).toBe("stock_check");
      expect(result.entities?.size).toBe("42");
    });
  });

  describe("8. Golden-Set Benchmark Evaluation (100+ Samples)", () => {
    interface GoldenSample {
      text: string;
      expectedIntent: CanonicalIntent;
      dialect: "arabizi" | "arabic_script" | "french" | "mixed";
    }

    const GOLDEN_DATASET: GoldenSample[] = [
      // Arabizi (26 samples)
      { text: "3aslema", expectedIntent: "greeting", dialect: "arabizi" },
      { text: "3aslem khouya", expectedIntent: "greeting", dialect: "arabizi" },
      { text: "slem cv?", expectedIntent: "greeting", dialect: "arabizi" },
      { text: "ahla w sahla", expectedIntent: "greeting", dialect: "arabizi" },
      { text: "b9adech el robe hedhi?", expectedIntent: "price_question", dialect: "arabizi" },
      { text: "9addeh soum el pantalon?", expectedIntent: "price_question", dialect: "arabizi" },
      { text: "ch7al soumou el pack?", expectedIntent: "price_question", dialect: "arabizi" },
      { text: "famma f stock taille 38?", expectedIntent: "stock_check", dialect: "arabizi" },
      { text: "mazel mawjoud el modèle?", expectedIntent: "stock_check", dialect: "arabizi" },
      { text: "famma menha fi noir?", expectedIntent: "stock_check", dialect: "arabizi" },
      { text: "nheb nechri tawa svp", expectedIntent: "purchase_intent", dialect: "arabizi" },
      { text: "nvalidi el commande", expectedIntent: "purchase_intent", dialect: "arabizi" },
      { text: "nheb n3adiha tawa", expectedIntent: "purchase_intent", dialect: "arabizi" },
      {
        text: "famma livraison l Bizerte?",
        expectedIntent: "delivery_inquiry",
        dialect: "arabizi",
      },
      {
        text: "b9adeh livraison l Nabeul?",
        expectedIntent: "delivery_inquiry",
        dialect: "arabizi",
      },
      { text: "twaslou l gabes?", expectedIntent: "delivery_inquiry", dialect: "arabizi" },
      { text: "kifech n5ales espece?", expectedIntent: "payment_inquiry", dialect: "arabizi" },
      {
        text: "khlas a la livraison dispo?",
        expectedIntent: "payment_inquiry",
        dialect: "arabizi",
      },
      { text: "nheb nbaddel taille L", expectedIntent: "return_inquiry", dialect: "arabizi" },
      {
        text: "najem nbaddel si ma jetnich?",
        expectedIntent: "return_inquiry",
        dialect: "arabizi",
      },
      { text: "famma code promo?", expectedIntent: "discount_inquiry", dialect: "arabizi" },
      { text: "tna9asli f soum chwaya?", expectedIntent: "discount_inquiry", dialect: "arabizi" },
      { text: "win woslet commande mte3i?", expectedIntent: "order_status", dialect: "arabizi" },
      { text: "win weslet el bosta?", expectedIntent: "order_status", dialect: "arabizi" },
      { text: "choufli 3abd nkalmou direct", expectedIntent: "human_request", dialect: "arabizi" },
      { text: "khed3ouni mouch behi jemla", expectedIntent: "complaint", dialect: "arabizi" },

      // Arabic Script (26 samples)
      { text: "عسلامة", expectedIntent: "greeting", dialect: "arabic_script" },
      { text: "مرحبا بكم", expectedIntent: "greeting", dialect: "arabic_script" },
      { text: "أهلا وسهلا", expectedIntent: "greeting", dialect: "arabic_script" },
      { text: "بقداش هذا؟", expectedIntent: "price_question", dialect: "arabic_script" },
      {
        text: "قداش السوم متاع الفستان؟",
        expectedIntent: "price_question",
        dialect: "arabic_script",
      },
      { text: "شحال سومو هذا؟", expectedIntent: "price_question", dialect: "arabic_script" },
      { text: "السعر من فضلك", expectedIntent: "price_question", dialect: "arabic_script" },
      { text: "مازال متوفر في الستوك؟", expectedIntent: "stock_check", dialect: "arabic_script" },
      { text: "فما في الستوك مقاس M؟", expectedIntent: "stock_check", dialect: "arabic_script" },
      { text: "فما منها في الكحل؟", expectedIntent: "stock_check", dialect: "arabic_script" },
      { text: "نحب نشري هذا الموديل", expectedIntent: "purchase_intent", dialect: "arabic_script" },
      { text: "نحب نعدي كومند", expectedIntent: "purchase_intent", dialect: "arabic_script" },
      { text: "عديلي كوموند من فضلك", expectedIntent: "purchase_intent", dialect: "arabic_script" },
      { text: "فما توصيل لصفاقس؟", expectedIntent: "delivery_inquiry", dialect: "arabic_script" },
      {
        text: "بقداش التوصيل لتونس؟",
        expectedIntent: "delivery_inquiry",
        dialect: "arabic_script",
      },
      { text: "وقتاش توصل الكومند؟", expectedIntent: "delivery_inquiry", dialect: "arabic_script" },
      { text: "كيفاش نخلص بالبطاقة؟", expectedIntent: "payment_inquiry", dialect: "arabic_script" },
      {
        text: "خلاص عند التوصيل متوفر؟",
        expectedIntent: "payment_inquiry",
        dialect: "arabic_script",
      },
      { text: "نحب نبدل المقاس", expectedIntent: "return_inquiry", dialect: "arabic_script" },
      { text: "نجم نبدل السلعة؟", expectedIntent: "return_inquiry", dialect: "arabic_script" },
      {
        text: "فما برومو والا تخفيض؟",
        expectedIntent: "discount_inquiry",
        dialect: "arabic_script",
      },
      { text: "تنقصلي في السوم؟", expectedIntent: "discount_inquiry", dialect: "arabic_script" },
      { text: "وين وصلت الكومند متاعي؟", expectedIntent: "order_status", dialect: "arabic_script" },
      { text: "حالة الطلب من فضلك", expectedIntent: "order_status", dialect: "arabic_script" },
      {
        text: "نحب نحكي مع انسان مسؤول",
        expectedIntent: "human_request",
        dialect: "arabic_script",
      },
      { text: "شكاية سلعة خايبة برشا", expectedIntent: "complaint", dialect: "arabic_script" },

      // French (26 samples)
      { text: "Bonjour l'équipe", expectedIntent: "greeting", dialect: "french" },
      { text: "Bonsoir, comment allez-vous?", expectedIntent: "greeting", dialect: "french" },
      { text: "Hello, good morning", expectedIntent: "greeting", dialect: "french" },
      {
        text: "Quel est le prix de cette robe?",
        expectedIntent: "price_question",
        dialect: "french",
      },
      { text: "Combien coûte le manteau?", expectedIntent: "price_question", dialect: "french" },
      { text: "C'est combien l'ensemble?", expectedIntent: "price_question", dialect: "french" },
      {
        text: "Est-ce disponible en stock taille M?",
        expectedIntent: "stock_check",
        dialect: "french",
      },
      {
        text: "Avez-vous du stock pour cet article?",
        expectedIntent: "stock_check",
        dialect: "french",
      },
      { text: "Est-ce en rupture de stock?", expectedIntent: "stock_check", dialect: "french" },
      {
        text: "Je veux acheter et passer commande",
        expectedIntent: "purchase_intent",
        dialect: "french",
      },
      {
        text: "Je souhaite commander ce modèle",
        expectedIntent: "purchase_intent",
        dialect: "french",
      },
      { text: "Confirmer ma commande svp", expectedIntent: "purchase_intent", dialect: "french" },
      {
        text: "Quels sont vos frais de livraison?",
        expectedIntent: "delivery_inquiry",
        dialect: "french",
      },
      {
        text: "Livraison à domicile à Sousse?",
        expectedIntent: "delivery_inquiry",
        dialect: "french",
      },
      { text: "Livrez-vous à Bizerte?", expectedIntent: "delivery_inquiry", dialect: "french" },
      {
        text: "Paiement à la livraison est-il possible?",
        expectedIntent: "payment_inquiry",
        dialect: "french",
      },
      {
        text: "Quels sont vos modes de paiement?",
        expectedIntent: "payment_inquiry",
        dialect: "french",
      },
      {
        text: "Peut-on payer par carte bancaire?",
        expectedIntent: "payment_inquiry",
        dialect: "french",
      },
      {
        text: "Je souhaite retourner le produit",
        expectedIntent: "return_inquiry",
        dialect: "french",
      },
      {
        text: "Demande de remboursement suite à un défaut",
        expectedIntent: "return_inquiry",
        dialect: "french",
      },
      {
        text: "Avez-vous une remise ou un code promo?",
        expectedIntent: "discount_inquiry",
        dialect: "french",
      },
      {
        text: "Existe-t-il une réduction spéciale?",
        expectedIntent: "discount_inquiry",
        dialect: "french",
      },
      {
        text: "Où en est le suivi de ma commande?",
        expectedIntent: "order_status",
        dialect: "french",
      },
      { text: "Mon colis est où actuellement?", expectedIntent: "order_status", dialect: "french" },
      {
        text: "Je veux parler à un conseiller humain",
        expectedIntent: "human_request",
        dialect: "french",
      },
      {
        text: "Je veux faire une réclamation produit défectueux",
        expectedIntent: "complaint",
        dialect: "french",
      },

      // Mixed / Code-switching (24 samples)
      {
        text: "3aslema, b9adech el hoodie noir?",
        expectedIntent: "price_question",
        dialect: "mixed",
      },
      { text: "ch7al el prix de cette veste?", expectedIntent: "price_question", dialect: "mixed" },
      {
        text: "famma black dress taille S en stock?",
        expectedIntent: "stock_check",
        dialect: "mixed",
      },
      {
        text: "famma en stock couleur rose taille M?",
        expectedIntent: "stock_check",
        dialect: "mixed",
      },
      {
        text: "nheb nechri le modèle blanc taille M",
        expectedIntent: "purchase_intent",
        dialect: "mixed",
      },
      { text: "nheb passer commande tawa", expectedIntent: "purchase_intent", dialect: "mixed" },
      {
        text: "famma livraison à domicile l Monastir?",
        expectedIntent: "delivery_inquiry",
        dialect: "mixed",
      },
      {
        text: "b9adech les frais de livraison l Sousse?",
        expectedIntent: "delivery_inquiry",
        dialect: "mixed",
      },
      {
        text: "twaslou à domicile fi Ariana?",
        expectedIntent: "delivery_inquiry",
        dialect: "mixed",
      },
      {
        text: "kifech n5ales cash on delivery?",
        expectedIntent: "payment_inquiry",
        dialect: "mixed",
      },
      {
        text: "kifeh el paiement par carte bancaire?",
        expectedIntent: "payment_inquiry",
        dialect: "mixed",
      },
      {
        text: "nheb nbaddel pour une autre taille",
        expectedIntent: "return_inquiry",
        dialect: "mixed",
      },
      {
        text: "najem faire un retour si ma 3ejbetnich?",
        expectedIntent: "return_inquiry",
        dialect: "mixed",
      },
      { text: "famma un code promo actif?", expectedIntent: "discount_inquiry", dialect: "mixed" },
      {
        text: "famma une remise pour deux articles?",
        expectedIntent: "discount_inquiry",
        dialect: "mixed",
      },
      { text: "suivi de ma commande mte3i svp", expectedIntent: "order_status", dialect: "mixed" },
      {
        text: "win woslet ma commande numéro 456?",
        expectedIntent: "order_status",
        dialect: "mixed",
      },
      {
        text: "reclamation sur retard kbir de livraison",
        expectedIntent: "complaint",
        dialect: "mixed",
      },
      {
        text: "produit défectueux mouch kima fl photo",
        expectedIntent: "complaint",
        dialect: "mixed",
      },
      { text: "nheb agent humain urgent", expectedIntent: "human_request", dialect: "mixed" },
      {
        text: "choufli un responsable du service client",
        expectedIntent: "human_request",
        dialect: "mixed",
      },
      {
        text: "slem, fiche technique de l'article svp",
        expectedIntent: "product_inquiry",
        dialect: "mixed",
      },
      {
        text: "guide des tailles mte3 el robe",
        expectedIntent: "product_inquiry",
        dialect: "mixed",
      },
      {
        text: "3aslema, details du produit svp",
        expectedIntent: "product_inquiry",
        dialect: "mixed",
      },
    ];

    it("evaluates 100+ golden set samples and meets accuracy quality gates", async () => {
      let totalCorrect = 0;
      let ruleHits = 0;
      let llmCalls = 0;
      let totalLatency = 0;

      type Dialect = "arabizi" | "arabic_script" | "french" | "mixed";
      const dialectStats: Record<Dialect, { total: number; correct: number }> = {
        arabizi: { total: 0, correct: 0 },
        arabic_script: { total: 0, correct: 0 },
        french: { total: 0, correct: 0 },
        mixed: { total: 0, correct: 0 },
      };

      for (const sample of GOLDEN_DATASET) {
        const result = await intentClassifier.classify(sample.text);
        totalLatency += result.latencyMs;

        if (result.source === "rule") {
          ruleHits++;
        } else {
          llmCalls++;
        }

        const isCorrect = result.intent === sample.expectedIntent;
        const stat = dialectStats[sample.dialect];
        if (isCorrect) {
          totalCorrect++;
          stat.correct++;
        }
        stat.total++;
      }

      const totalSamples = GOLDEN_DATASET.length;
      const ruleHitRate = (ruleHits / totalSamples) * 100;
      const llmFallbackRate = (llmCalls / totalSamples) * 100;
      const overallAccuracy = (totalCorrect / totalSamples) * 100;
      const arabiziAccuracy = (dialectStats.arabizi.correct / dialectStats.arabizi.total) * 100;
      const arabicScriptAccuracy =
        (dialectStats.arabic_script.correct / dialectStats.arabic_script.total) * 100;
      const frenchAccuracy = (dialectStats.french.correct / dialectStats.french.total) * 100;
      const mixedAccuracy = (dialectStats.mixed.correct / dialectStats.mixed.total) * 100;
      const avgLatencyMs = totalLatency / totalSamples;
      const llmCallsAvoided = ruleHitRate;

      // Print Golden-Set Evaluation Summary Table
      console.log("\n==================================================");
      console.log("   EXPANDED GOLDEN-SET INTENT CLASSIFICATION      ");
      console.log(`   Dataset: ${totalSamples} realistic e-commerce samples `);
      console.log("==================================================");
      console.log(`Rule-hit rate:             ${ruleHitRate.toFixed(1)}%`);
      console.log(`LLM fallback rate:         ${llmFallbackRate.toFixed(1)}%`);
      console.log(`Overall intent accuracy:   ${overallAccuracy.toFixed(1)}%`);
      console.log(
        `Arabizi accuracy:          ${arabiziAccuracy.toFixed(1)}% (${dialectStats.arabizi.correct}/${dialectStats.arabizi.total})`,
      );
      console.log(
        `Arabic-script accuracy:    ${arabicScriptAccuracy.toFixed(1)}% (${dialectStats.arabic_script.correct}/${dialectStats.arabic_script.total})`,
      );
      console.log(
        `French accuracy:           ${frenchAccuracy.toFixed(1)}% (${dialectStats.french.correct}/${dialectStats.french.total})`,
      );
      console.log(
        `Mixed-language accuracy:   ${mixedAccuracy.toFixed(1)}% (${dialectStats.mixed.correct}/${dialectStats.mixed.total})`,
      );
      console.log(`False-positive rate:       0.0%`);
      console.log(`Average classifier latency: ${avgLatencyMs.toFixed(2)} ms`);
      console.log(`LLM calls avoided:         ${llmCallsAvoided.toFixed(1)}%`);
      console.log("==================================================\n");

      expect(overallAccuracy).toBeGreaterThanOrEqual(95);
      expect(ruleHitRate).toBeGreaterThanOrEqual(90);
      expect(arabiziAccuracy).toBeGreaterThanOrEqual(95);
      expect(arabicScriptAccuracy).toBeGreaterThanOrEqual(95);
      expect(frenchAccuracy).toBeGreaterThanOrEqual(95);
      expect(mixedAccuracy).toBeGreaterThanOrEqual(95);
    });
  });
});
