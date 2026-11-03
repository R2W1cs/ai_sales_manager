# 15.3 — Intent Classifier Pipeline

| Field           | Value                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `15_AI_ARCHITECTURE/03-intent-classifier-pipeline`                                                                                             |
| Status          | Approved — canonical for intent classification pipeline                                                                                        |
| Owner           | AI Systems / Engineering                                                                                                                       |
| Audience        | AI module, worker, QA, AI coding agents                                                                                                        |
| Depends on      | `05_AI_BEHAVIOR_SPECIFICATION.md`, `06_AI_HUMAN_HANDOFF_RULES.md`, `11_TECH_STACK.md` §9, `15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md` |
| Consumed by     | Nest AI module in `apps/api/src/ai/`, shared contracts in `packages/shared/src/ai/`, golden-set CI                                             |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# AI Architecture`, `# AI Orchestrator`, `# Intent Classification`                                      |

---

## 1. Purpose and Scope

This document defines the canonical **intent classification architecture** for the conversational AI sales platform. It specifies how inbound customer messages are classified into actionable business intents, how multi-intent and code-switched queries (Tunisian Arabizi, Arabic script, French, English) are resolved, how deterministic safety and speed gates are enforced, and how classification integrates with the AI Orchestrator, Policy Engine, and Tool Executor.

### 1.1 In Scope

- Hybrid two-stage classification: High-speed deterministic rule matcher followed by a cheap structured LLM fallback (`gpt-5.6-luna`).
- The canonical 12-intent taxonomy plus `unknown` fallback.
- Rule ordering, match strength semantics, and precedence hierarchies.
- LLM confidence thresholds and the clarification/escalation ladder.
- Multi-intent extraction (`primary` + `secondary[]`) and entity capture.
- Tunisian Arabizi, Tunisian Derja Arabic script, French, English, and code-switched language handling.
- Deterministic safety and human escalation precedence.
- Business truth boundaries (prohibiting hallucinated commercial facts).

### 1.2 Out of Scope

- Contracts, Zod schemas, observability, golden-set evaluation & benchmarks (`15_AI_ARCHITECTURE/04-intent-contracts-evaluation.md`).
- Conversational turn execution and tool loop scheduling (`15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md`).
- RAG knowledge retrieval and vector embeddings storage (`15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md`).
- Fifteen customer handoff triggers and state machine transitions (`06_AI_HUMAN_HANDOFF_RULES.md`, `14_SYSTEM_DESIGN.md`).
- Response generator prompting and merchant persona customization (`05_AI_BEHAVIOR_SPECIFICATION.md`).

---

## 2. Canonical 12-Intent Taxonomy + `unknown` Fallback

The system recognizes exactly twelve canonical business intents plus an explicit `unknown` fallback. The taxonomy is strictly fixed in `packages/shared/src/ai/index.ts` via `CanonicalIntentSchema`.

| Intent             | Description / Recognition Signals                                               | Typical Customer Expressions (Arabizi / French / Arabic)                          | Downstream Default Action                             |
| :----------------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------- | :---------------------------------------------------- |
| `greeting`         | Introductory pleasantries, hellos, opening salutations                          | "3aslema", "ahla bik", "bonjour", "salam alaykom", "عسلامة", "مرحبا"              | Short welcome reply; steer towards browsing/catalog   |
| `product_inquiry`  | Questions regarding product features, sizing guides, materials, catalog details | "fiche produit", "details mte3 robe", "fama guide des tailles?", "تفاصيل الموديل" | RAG knowledge lookup + `search_products()`            |
| `stock_check`      | Inquiries regarding variant availability, size, or color stock                  | "famma f stock?", "dispo taille L noir?", "mazel mawjoud?", "فما في الستوك"       | `check_inventory()`                                   |
| `price_question`   | Inquiries regarding product pricing, package cost, or total fees                | "b9adech?", "9addeh soum el hoodie?", "combien ça coûte?", "بقداش السوم"          | `search_products()` (price strictly from tool)        |
| `delivery_inquiry` | Shipping fees, delivery timeframes, regional coverage, carrier questions        | "twaslou l Sousse?", "b9adech livraison?", "wa9tech tousel?", "بقداش التوصيل"     | `calculate_delivery()` + `business_rules`             |
| `payment_inquiry`  | Payment methods, Cash on Delivery (COD), D17, Flouci, bank cards                | "kifech n5ales?", "paiement à la livraison?", "khlas d17?", "كيفاش نخلص"          | Authoritative `business_rules`                        |
| `return_inquiry`   | Return, exchange, replacement, or refund policy questions                       | "najem nbaddel taille?", "famma retours?", "politique de retour?", "نجم نبدل"     | Authoritative `business_rules` / Escalate if refund   |
| `discount_inquiry` | Coupon codes, promotional discounts, sales, bargaining requests                 | "famma promo?", "code promo?", "tna9asli f soum?", "فما برومو"                    | Check active promo rules / polite fixed-price policy  |
| `purchase_intent`  | Explicit desire to order, buy, confirm selection, or submit shipping info       | "nheb nechri", "nvalidi commande", "passer commande", "نحب نشري"                  | Collect customer details → `reserve_stock` → order    |
| `order_status`     | Tracking existing orders, checking parcel status or dispatch delay              | "win woslet el commande?", "suivi colis", "numéro de suivi?", "وين وصلت"          | `get_customer_history()` + order tracking lookup      |
| `complaint`        | Anger, dissatisfaction, defective items, broken goods, missing packages         | "reclamation", "mouch behi", "khed3ouni", "produit endommagé", "غشيتوني"          | **Escalate** → `transfer_to_human()` (`06`)           |
| `human_request`    | Explicit request to talk to a human representative, manager, or agent           | "choufli 3abd", "nkalem responsable", "parler à un humain", "نحب نحكي مع انسان"   | **Immediate Escalate** → `transfer_to_human()` (`06`) |
| `unknown`          | Ambiguous, unparseable, unintelligible, or out-of-domain input                  | Random characters, gibberish, unsupported domain topics                           | Ask 1 clarifying question (clarification ladder)      |

---

## 3. Hybrid Classification Architecture

The intent classification pipeline uses a **deterministic-first hybrid architecture**. Inbound messages first pass through a zero-latency, high-precision deterministic rule matcher. The cheap structured LLM classifier is invoked **only** when deterministic rules cannot produce a definitive, high-confidence match.

```text
Customer message
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ Stage 1: Deterministic Rule Matcher                    │
│ - Exact & boundary phrase regexes                      │
│ - Priority-ordered rule catalog                        │
│ - Entity extraction (size, color, location, quantity)  │
└────────────────────────────────────────────────────────┘
       │
       ├─────────────────────────────────┐
       ▼ [Clear / High matchStrength]   ▼ [No match / Ambiguous]
┌──────────────────────────────┐  ┌──────────────────────────────────────────────┐
│ Return Rule Match Result     │  │ Stage 2: Cheap LLM Classifier Fallback       │
│ - intent + matchStrength     │  │ - Pinned model: `gpt-5.6-luna` (temp=0)      │
│ - source: "rule"             │  │ - Structured JSON output (Zod validated)     │
│ - latency: < 1ms, Cost: $0   │  │ - Returns: intent, confidence, secondary[]   │
└──────────────────────────────┘  └──────────────────────────────────────────────┘
       │                                         │
       └───────────────────┬─────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Stage 3: Safety & Escalation Precedence                │
│ - High-risk intents (human_request, complaint, refund) │
│   override commercial intents in multi-intent queries  │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Stage 4: AI Orchestrator & Policy Engine               │
│ - Policy evaluation against conversation state         │
│ - Tool execution plan (search, inventory, delivery)    │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Stage 5: Authoritative Tools & Database Data           │
│ - InventoryService, CatalogService, BusinessRules      │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Stage 6: Response Generator                            │
│ - Customer-facing generation strictly grounded on facts│
└────────────────────────────────────────────────────────┘
```

### 3.1 Architectural Principles

1. **Zero LLM Overhead for Obvious Queries**: Standard greetings, explicit purchase requests, obvious human handoff demands, and clear delivery/payment queries are resolved sub-millisecond without network calls or LLM cost.
2. **Conservative Matching**: Rules only trigger on unambiguous lexical patterns. If there is ambiguity, the rule matcher yields to the structured LLM fallback.
3. **Decoupled Classification**: The classifier’s sole responsibility is identifying what the user intends and extracting explicit entities. It does not plan tool calls or generate natural language responses.

---

## 4. Deterministic Rule Matcher

The deterministic matcher (`apps/api/src/ai/intent/rule-intent-classifier.ts`) executes synchronously and deterministically in-process.

### 4.1 Normalization & Token Boundary Matching

To handle dialectical scripts, spaces, and punctuation:

- **Unicode & Zero-Width Scrubbing**: Strips zero-width joiners, soft hyphens, and redundant whitespace while preserving Arabic Unicode (`\u0600-\u06FF`), Arabizi numerals (`2, 3, 5, 7, 8, 9`), and Latin characters.
- **Boundary-Aware Matching**: Checks phrase boundaries using Unicode-aware regular expressions.
- **Arabic Prefix Support**: Supports attached Arabic grammatical clitics (e.g., prepositional and conjunctive single-letter prefixes: `لـ`, `بـ`, `وـ`, `كـ`).

```typescript
export function containsPhrase(normalizedText: string, phrase: string): boolean {
  if (!normalizedText || !phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isArabic = /^[\u0600-\u06FF]/.test(phrase);
  const prefixPattern = isArabic ? "(?:^|[^\\p{L}\\p{N}])[لبوك]?" : "(?:^|[^\\p{L}\\p{N}])";
  const pattern = new RegExp(`${prefixPattern}${escaped}(?:$|[^\\p{L}\\p{N}])`, "u");
  return pattern.test(normalizedText);
}
```

### 4.2 Centralized Rule Catalog & Priority Hierarchy

All rules are declared in a centralized, priority-ordered array (`DETERMINISTIC_RULES`). Rules must **never** be scattered across controllers, routes, or services.

| Priority | Rule ID                 | Target Intent      | Match Strength | Rationale                                                                            |
| :------- | :---------------------- | :----------------- | :------------- | :----------------------------------------------------------------------------------- |
| **100**  | `rule_human_request`    | `human_request`    | 0.98           | Critical safety: Immediate operator handoff request must supersede all other intents |
| **95**   | `rule_complaint`        | `complaint`        | 0.95           | Critical safety: Complaints suppress sales pushes and trigger escalation             |
| **90**   | `rule_purchase_intent`  | `purchase_intent`  | 0.92           | Core commercial conversion trigger                                                   |
| **85**   | `rule_return_inquiry`   | `return_inquiry`   | 0.90           | Policy & escalation check (returns/refunds)                                          |
| **82**   | `rule_payment_inquiry`  | `payment_inquiry`  | 0.88           | Explicit payment terms inquiry                                                       |
| **80**   | `rule_delivery_inquiry` | `delivery_inquiry` | 0.90           | Shipping fee and regional coverage queries                                           |
| **75**   | `rule_order_status`     | `order_status`     | 0.90           | Tracking queries for existing orders                                                 |
| **70**   | `rule_discount_inquiry` | `discount_inquiry` | 0.88           | Bargaining and coupon inquiries                                                      |
| **60**   | `rule_stock_check`      | `stock_check`      | 0.85           | Availability and size/color stock queries                                            |
| **55**   | `rule_price_question`   | `price_question`   | 0.85           | Explicit price questions ("b9adech")                                                 |
| **50**   | `rule_product_inquiry`  | `product_inquiry`  | 0.85           | Technical specs, sizing chart, fabric details                                        |
| **40**   | `rule_greeting`         | `greeting`         | 0.85           | Salutations and introductory pleasantries                                            |

### 4.3 Deterministic Entity Extraction

The rule engine extracts structured entities directly from normalized text during rule processing:

- **Size**: `XXL`, `XL`, `L`, `M`, `S`, `XS`, and numeric sizes (`38`, `40`, `42`).
- **Color**: Normalized names in French, English, Tunisian Arabizi (`akhel`, `abyedh`, `azre9`, `a7mer`, `rmedi`, `kahwi`), and Arabic script (`اكحل`, `ابيض`, `ازرق`, `احمر`, `وردي`).
- **Location**: Tunisian governorates and major cities in Latin and Arabic script (`Tunis`, `Sousse`, `Sfax`, `Bizerte`, `Nabeul`, `Ariana`, `Djerba`, etc.).
- **Quantity**: Explicit numeric quantities (`2 ka3bet`, `3 pièces`, `1 menha`).

---

## 5. Cheap LLM Fallback

When no deterministic rule matches with high match strength (or when forced via debug options), the query is routed to the cheap structured LLM classifier (`LlmIntentClassifierService`).

### 5.1 Pinned Model Specification

Per `11_TECH_STACK.md` §9 and `packages/shared/src/ai/index.ts`:

- **Model ID**: `gpt-5.6-luna` (pinned; never overridden by merchant `ai_settings`).
- **Temperature**: `0.0` (strict deterministic classification).
- **Max Output Tokens**: `200`.
- **Response Format**: `json_object` (`Structured Output` mode enforced).
- **Timeout**: `15.0s` abort limit.
- **Customer-Facing Isolation**: The primary customer response models (`gemini-3.5-flash` or `gpt-5.6-terra`) must **never** be used for intent classification.

### 5.2 LLM System Prompt & Output Schema

The system prompt contains the 12 canonical intents, dialect interpretation instructions (Arabizi numerals `3, 7, 5, 9`), entity extraction rules, and strict instructions forbidding conversational answers.

```json
{
  "intent": "price_question",
  "confidence": 0.92,
  "secondary": ["stock_check"],
  "entities": {
    "product": "hoodie",
    "size": "M",
    "color": "Noir",
    "location": "Sousse"
  }
}
```

### 5.3 Circuit Breaker & Outage Handling

If the LLM classifier experiences network timeouts (15s), provider 5xx errors, or OpenAI circuit trips (`15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md` §6):

1. The classification pipeline logs a failure and returns `intent: "unknown"` with `classifier_error: true`.
2. **Do Not Burn Clarification Turns**: An outage does not count toward the customer clarification ladder.
3. **Safe Read-Only Mode**: Grounded catalog tools (`search_products`, `check_inventory`) remain accessible; mutating tools (`reserve_stock`, `create_pending_order`) and purchase handoffs are blocked.
4. Escalation detectors for safety (`complaint`, `human_request`) continue running deterministically.

---

## 6. Confidence and Threshold Policy

### 6.1 Distinction Between `matchStrength` and `confidence`

To prevent misleading telemetry and maintain analytical clarity:

- **`matchStrength` (Deterministic Rules)**: A static, rule-governed weight representing the specificity of the matched regex pattern (e.g., `0.98` for an exact human request match, `0.85` for a greeting). It indicates deterministic pattern precision.
- **`confidence` (LLM Classifier)**: A probabilistic calibration score (0.00 to 1.00) produced by the LLM indicating semantic certainty.

> [!NOTE]
> **Implementation note**: `matchStrength` is a conceptual distinction used in this document for clarity. In the actual code (`RuleMatchSchema` and `IntentClassificationResult`), both rule matches and LLM results share the same `confidence` field. The field carries a static rule weight when `source === "rule"` and a probabilistic model score when `source === "llm"`. Never compare the two numerically — use `source` first to interpret what the `confidence` value means for a given result.

### 6.2 Threshold Bands & Execution Policy

```text
┌────────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ LLM Confidence Score   │ Architectural Action & Orchestration Policy                            │
├────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ >= 0.85                │ High Confidence: Accept intent and execute default tool/policy plan.  │
├────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ 0.65 – 0.849           │ Ambiguous / Cautious: Accept primary intent, but constrain tool       │
│                        │ mutations. Request confirmation if executing high-impact actions.      │
├────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ < 0.65                 │ Low Confidence / Unknown: Enter the 2-turn Clarification Ladder.       │
└────────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Clarification Ladder (`05` §7)

- **Turn 1 Low Confidence (< 0.65)**: AI asks **one** targeted clarifying question. No complex option menus.
- **Turn 2 Consecutive Low Confidence**: If the subsequent turn also classifies `< 0.65`, immediately escalate to human agent (`HUMAN_REQUIRED`, reason: `low_confidence`).
- **Streak Tracking**: The low-confidence streak is tracked across turns in `ai_decision_traces` and resets immediately upon any classification `>= 0.65`.

---

## 7. Multi-Intent Resolution

Real-world customer inquiries often combine multiple inquiries in a single sentence.

### 7.1 Representation

The contract represents multiple intents as:

- `intent`: Primary canonical intent.
- `secondary`: Array of additional identified canonical intents (`CanonicalIntent[]`).

**Example**:

> _"b9adech el hoodie noir w fama taille M w twaslou l Sfax?"_
>
> - **Primary Intent**: `price_question`
> - **Secondary Intents**: `["stock_check", "delivery_inquiry"]`
> - **Extracted Entities**: `{ product: "hoodie", color: "Noir", size: "M", location: "Sfax" }`

### 7.2 Execution Semantics

1. **Classifier Responsibility**: Detect all valid intents present in the message and extract relevant entities.
2. **Orchestrator Responsibility**: The Orchestrator determines tool execution sequencing. Independent read-only tools (`search_products`, `check_inventory`, `calculate_delivery`) can execute in parallel or within the allowed turn budget (max 8 tool invocations per turn).
3. **Response Assembly**: The Response Generator addresses the primary intent first while naturally answering the secondary queries using the retrieved facts.

---

## 8. Safety / Escalation Precedence

Safety and customer satisfaction supersede commercial opportunities. When conflicting intents are detected in a single turn, escalation intents **always** take priority.

### 8.1 Precedence Hierarchy

```text
┌──────────────────────────────────────────────────────────┐
│ HIGHEST PRECEDENCE                                       │
│ 1. human_request (Explicit human handoff)                │
│ 2. complaint (Anger, defect, scam allegation)            │
│ 3. return_inquiry / refund_request (Disputes, returns)   │
├──────────────────────────────────────────────────────────┤
│ COMMERCIAL CONVERSION                                    │
│ 4. purchase_intent (Order placement, address submission) │
├──────────────────────────────────────────────────────────┤
│ INFORMATIONAL INQUIRIES                                  │
│ 5. payment_inquiry / delivery_inquiry                    │
│ 6. order_status                                          │
│ 7. discount_inquiry                                      │
│ 8. stock_check / price_question                          │
│ 9. product_inquiry                                       │
├──────────────────────────────────────────────────────────┤
│ LOWEST PRECEDENCE                                        │
│ 10. greeting / small_talk                                │
│ 11. unknown                                              │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Conflict Resolution Examples

- **Case A**: _"nheb nechri ama lbera7 وصلني colis mksour w khed3ouni"_
  - Mixed: `purchase_intent` + `complaint`.
  - **Resolution**: `complaint` wins. AI suppresses sales actions and triggers human escalation.
- **Case B**: _"3aslema, b9adech el robe hedhi w win woslet el commande lokhra?"_
  - Mixed: `greeting` + `price_question` + `order_status`.
  - **Resolution**: Primary is `order_status` or `price_question`; greeting is handled gracefully in passing.

---

## 9. Business-Truth Boundary

Under the Four Laws of AI Behavior (`05_AI_BEHAVIOR_SPECIFICATION.md` Law 1 & Law 2), the Intent Classifier and AI Model must **never invent commercial facts**.

### 9.1 Boundary Invariants

1. **No Fact Generation**: The classifier outputs intents and extracted text tokens only. It never supplies product prices, stock quantities, delivery fees, delivery delays, or refund approvals.
2. **Authoritative Downstream Sources**:
   - Product prices & descriptions: `CatalogService.searchVariants`
   - Stock availability: `InventoryService.check`
   - Shipping rates & delivery zones: `BusinessRulesService.deliveryFor`
   - Order tracking state: `OrderService.getById` / `CustomerService.history`
3. **Grounding Verification**: All numbers in the final response must be traceably grounded in the tool JSON output for that turn.

---

## 10. Tunisian Arabizi / Arabic / French / Mixed-Language Requirements

The target market in Tunisia communicates using high degrees of multilingual code-switching.

### 10.1 Language Modalities

1. **Tunisian Arabizi (Latin script with numerals)**:
   - `3` = `ع` (`3aslema`, `3abd`, `m3a`, `a3mel`)
   - `7` = `ح` (`7ad`, `n7eb`, `a7mer`, `sa7a`)
   - `5` = `خ` (`khed3ouni`, `5lass`, `5obz`)
   - `9` = `ق` (`9addeh`, `b9adech`, `na9sa`, `azre9`)
   - `2` = `ء / أ` (`m2akker`, `ra2y`)
   - `8` = `غ` (`8ali`, `8alta`)
2. **Tunisian Arabic (Arabic script)**:
   - Colloquial vocabulary: عسلامة, بقداش, قداش, نحب نشري, فما ستوك, وين وصلت, شكون يوصل.
3. **French**:
   - Standard commerce expressions: "livraison à domicile", "frais de port", "paiement à la livraison", "guide des tailles", "réclamation".
4. **Code-Switching / Mixed Phrases**:
   - Sentences seamlessly mixing Arabizi, French, and Arabic script:
     > _"3aslema nheb npassi commande pour le hoodie noir taille L f Sousse"_

### 10.2 Processing Rules

- **No MSA Normalization**: Do **not** attempt to normalize or transliterate Tunisian Arabizi into Modern Standard Arabic (MSA). Preserving the authentic dialect tokens ensures exact entity matching and avoids corrupting colloquial intent.
- **Dialectal Invariance**: Suffixes and alternate spellings (e.g., `b9adech`, `b9adeh`, `9adeh`, `ch7al`, `combien`) map to the exact same canonical intent (`price_question`).
