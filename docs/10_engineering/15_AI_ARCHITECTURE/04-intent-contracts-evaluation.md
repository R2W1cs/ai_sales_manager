# 15.4 — Intent Classifier Contracts, Evaluation & Evolution

| Field           | Value                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Document ID     | `15_AI_ARCHITECTURE/04-intent-contracts-evaluation`                                                     |
| Status          | Approved — canonical for intent contracts, evaluation & roadmap                                         |
| Owner           | AI Systems / Engineering                                                                                |
| Audience        | AI module, worker, QA, AI coding agents                                                                 |
| Depends on      | `15_AI_ARCHITECTURE/03-intent-classifier-pipeline.md`, `11_TECH_STACK.md` §9, `packages/shared/src/ai/` |
| Consumed by     | Nest AI module in `apps/api/src/ai/`, shared contracts in `packages/shared/src/ai/`, golden-set CI      |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# AI Architecture`, `# AI Evaluation Framework`                  |

---

## 11. Service Interface and Zod Contracts

Shared types and schemas reside canonically in `packages/shared/src/ai/index.ts`.

### 11.1 Core Zod Schemas

```typescript
import { z } from "zod";

export const CANONICAL_INTENTS = [
  "greeting",
  "product_inquiry",
  "stock_check",
  "price_question",
  "delivery_inquiry",
  "payment_inquiry",
  "return_inquiry",
  "discount_inquiry",
  "purchase_intent",
  "order_status",
  "complaint",
  "human_request",
  "unknown",
] as const;

export const CanonicalIntentSchema = z.enum(CANONICAL_INTENTS);
export type CanonicalIntent = z.infer<typeof CanonicalIntentSchema>;

export const ExtractedEntitiesSchema = z.object({
  product: z.string().optional(),
  variant: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  orderReference: z.string().optional(),
  location: z.string().optional(),
});
export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;

export const ClassifierSourceSchema = z.enum(["rule", "llm"]);
export type ClassifierSource = z.infer<typeof ClassifierSourceSchema>;

export const RuleMatchSchema = z.object({
  intent: CanonicalIntentSchema,
  confidence: z.number().min(0).max(1), // matchStrength
  matchedRule: z.string(),
  secondary: z.array(CanonicalIntentSchema).default([]),
  entities: ExtractedEntitiesSchema.optional(),
});
export type RuleMatch = z.infer<typeof RuleMatchSchema>;

export const IntentClassificationSchema = z.object({
  intent: CanonicalIntentSchema,
  confidence: z.number().min(0).max(1),
  secondary: z.array(CanonicalIntentSchema).default([]),
  entities: ExtractedEntitiesSchema.default({}),
  matchedRule: z.string().optional(),
  source: ClassifierSourceSchema.default("rule"),
  latencyMs: z.number().default(0),
  model: z.string().optional(),
});
export type IntentClassification = z.infer<typeof IntentClassificationSchema>;
```

### 11.2 Service Contract (`apps/api/src/ai/intent/intent-classifier.service.ts`)

```typescript
export interface IntentClassificationResult {
  intent: CanonicalIntent;
  confidence: number;
  secondary: CanonicalIntent[];
  entities?: ExtractedEntities;
  matchedRule?: string;
  source: "rule" | "llm";
  latencyMs: number;
  model?: string;
}

export interface ClassifyOptions {
  forceLlm?: boolean;
}

@Injectable()
export class IntentClassifierService {
  classifyRule(text: string): IntentClassificationResult | null;
  classify(text: string, options?: ClassifyOptions): Promise<IntentClassificationResult>;
}
```

---

## 12. Observability

Every classification event is logged and auditable in the database.

### 12.1 Persistence in `ai_actions`

An `ai_actions` record is created for every classified turn:

- `action_type`: `"intent_classify"`
- `model`: `"rule_engine"` (for rule matches) or `"gpt-5.6-luna"` (for LLM fallback)
- `input_tokens` / `output_tokens`: `0` for rule matches; actual token usage for LLM calls
- `latency_ms`: Execution duration
- `metadata`:
  ```json
  {
    "source": "rule",
    "matchedRule": "rule_purchase_intent",
    "primaryIntent": "purchase_intent",
    "secondaryIntents": ["stock_check"],
    "extractedEntities": { "size": "M", "color": "Noir" }
  }
  ```

### 12.2 Integration with `DecisionTraceSchema`

The classification result is included in `ai_decision_traces.decision_trace`:

```json
{
  "intent": "purchase_intent",
  "confidence": 0.92,
  "source": "rule",
  "matched_rule": "rule_purchase_intent",
  "secondary_intents": ["stock_check"],
  "streak_low_confidence": 0
}
```

---

## 13. Golden-Set Evaluation

Intent classification quality is guarded by a comprehensive, automated golden dataset (`packages/shared` / CI harness).

### 13.1 Golden Set Composition

The benchmark suite consists of **≥ 50 curated multi-lingual test examples** covering:

- All 12 canonical intents + `unknown` across Arabizi, Arabic script, French, English, and code-switched inputs.
- Multi-intent queries testing primary/secondary separation.
- High-risk safety triggers (complaints, angry remarks, human operator requests).
- Tricky phonetic and informal spelling variations (`9adeh`, `b9adech`, `kadeh`, `ch7al`).
- Ambiguous and out-of-domain edge cases.

### 13.2 Accuracy Target Gates

- **Overall Intent Classification Accuracy**: **≥ 95.0%** across the golden test suite.
- **Safety / Escalation Recall**: **100.0%** recall on `human_request` and `complaint` test cases. Zero missed escalations permitted.
- **Entity Extraction Precision**: **≥ 90.0%** on explicit size, color, and location mentions.

---

## 14. Testing Requirements

All intent classification logic must have complete unit, integration, and golden-set coverage.

### 14.1 Test Suites (`apps/api/src/ai/intent/intent-classifier.service.spec.ts`)

1. **Rule Engine Unit Tests**:
   - Verification of phrase boundary matching across Unicode and Arabic prefixes.
   - Comprehensive testing of each rule definition in `DETERMINISTIC_RULES`.
   - Entity extraction testing for colors, sizes, locations, and quantities across languages.
2. **Hybrid Classifier Integration Tests**:
   - Fast-path verification: Ensures matching phrases do not invoke the LLM fallback.
   - Fallback execution: Verifies non-matching phrases seamlessly invoke `LlmIntentClassifierService`.
   - Forced LLM option (`forceLlm: true`) testing for benchmark comparisons.
3. **Safety Precedence Tests**:
   - Validates that mixed inputs (e.g., complaint + purchase intent) strictly yield `complaint` as primary.

---

## 15. Performance and Cost Goals

| Metric            | Deterministic Rule Path        | Cheap LLM Fallback Path (`gpt-5.6-luna`) | Overall Target           |
| :---------------- | :----------------------------- | :--------------------------------------- | :----------------------- |
| **P95 Latency**   | **< 1 ms**                     | **< 800 ms** (15s hard timeout)          | **< 250 ms** blended P95 |
| **Cost per Turn** | **$0.0000**                    | **~$0.0001** (avg ~120 tokens)           | **< $0.00003** blended   |
| **Traffic Share** | **60% – 80%** of inbound turns | **20% – 40%** of inbound turns           | 100% covered             |
| **Memory / CPU**  | In-memory regex execution      | Stateless HTTPS call                     | Minimal overhead         |

---

## 16. Why Embeddings are NOT Used for Intent Classification in MVP

An explicit architectural decision has been made for the platform MVP:

> **Vector embeddings are NOT used for intent classification in MVP.**

### 16.1 Rationale

1. **Sub-Millisecond Zero-Cost Fast Path**: Deterministic rules resolve common commercial phrases in < 1ms at zero financial cost, which no embedding service or vector query can match.
2. **Superior Nuance in Code-Switched Dialects**: Small embedding models often struggle with fine-grained semantic distinctions in informal Tunisian Arabizi where spelling varies wildly (e.g., distinguishing a complaint from a return inquiry). The structured LLM (`gpt-5.6-luna`) understands deep pragmatic context and colloquial nuances far better than cosine similarity against fixed intent centroids.
3. **Elimination of Vector Index Overhead**: Eliminates the operational complexity of maintaining an intent embedding index, choosing arbitrary cosine similarity distance cutoffs, and managing vector store migrations for fixed categorical intents.
4. **Deterministic Precedence Guarantees**: Rules provide ironclad guarantees for safety-critical phrases (`human_request`, `complaint`), whereas nearest-neighbor vector searches can unpredictably misclassify edge cases.

### 16.2 Role of Embeddings in the System

Embeddings (`text-embedding-3-small` via pgvector HNSW) remain dedicated strictly to:

- Tenant knowledge document search (RAG for FAQs and brand policies).
- Semantic product catalog retrieval and similarity assistance (`recommend_products`).

---

## 17. Future Evolution Roadmap

Post-MVP evolution paths may be considered when justified by production golden-set evaluation metrics:

1. **Few-Shot Prompt Optimization**: Incorporating edge-case examples from real merchant logs into `gpt-5.6-luna` prompt templates.
2. **Merchant-Specific Keyword Overrides**: Allowing merchants to configure custom phrase triggers for business-specific campaigns in `ai_settings`.
3. **Fine-Tuned Localized Classifier**: Training a dedicated, lightweight distilled classifier model specifically on Tunisian Derja e-commerce conversations if traffic volume justifies dedicated model hosting.
4. **Embedding-Assisted Intent Clustering**: Offline vector clustering of `unknown` messages to automatically discover emerging buyer intents and missing catalog keywords.

---

## 18. Coding-Agent Constraints

Coding agents implementing or modifying the intent classification system must adhere to the following strict constraints:

1. **Preserve the Four Laws**: Never permit intent classification to bypass the policy engine or grounding evaluator.
2. **Single Source of Truth**: All intent names, schemas, and return types must be imported from `packages/shared/src/ai/index.ts`. Never define local intent enums or duplicate types.
3. **No Scattered Rules**: Do **not** place regex checks or intent heuristics inside controllers, webhook adapters, or worker jobs. All intent matching logic must remain inside `apps/api/src/ai/intent/rule-intent-classifier.ts` and `apps/api/src/ai/intent/intent-classifier.service.ts`.
4. **Do Not Bypass Rules**: Never disable the deterministic rule matcher to send 100% of traffic to the LLM.
5. **No Model Hallucination of Facts**: The classifier must only output intent types and extracted entity strings. It must never populate pricing, inventory, or delivery data.
6. **Preserve Arabizi Text**: Do not alter `normalizeMessage` to strip Arabizi digits (`2, 3, 5, 7, 8, 9`) or translate Arabizi to MSA.

---

## 19. Definition of Done

The Intent Classification Architecture is considered complete and compliant when:

- [x] Canonical documentation is published at `docs/10_engineering/15_AI_ARCHITECTURE/03-intent-classifier-pipeline.md` and `docs/10_engineering/15_AI_ARCHITECTURE/04-intent-contracts-evaluation.md`.
- [x] All 12 canonical intents + `unknown` are enforced in `packages/shared/src/ai/index.ts`.
- [x] The deterministic rule matcher provides boundary-aware pattern matching and entity extraction across Arabizi, Arabic script, and French.
- [x] The LLM classifier fallback is pinned to `gpt-5.6-luna` with temperature `0` and structured JSON validation.
- [x] Rule priority ordering guarantees safety escalation (`human_request`, `complaint`) precedence over commercial intents.
- [x] Golden-set automated tests pass with ≥ 95% accuracy and 100% safety escalation recall.
- [x] Full quality verification passes: `pnpm check:full`.
