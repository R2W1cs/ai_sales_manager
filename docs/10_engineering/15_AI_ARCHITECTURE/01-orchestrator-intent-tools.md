# 15 — AI Architecture

| Field           | Value                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `15_AI_ARCHITECTURE`                                                                                                                                           |
| Status          | Approved — canonical for orchestrator internals                                                                                                                |
| Owner           | AI Systems / Engineering                                                                                                                                       |
| Audience        | AI module, worker, QA, AI coding agents                                                                                                                        |
| Depends on      | `05_AI_BEHAVIOR_SPECIFICATION.md`, `06_AI_HUMAN_HANDOFF_RULES.md`, `11_TECH_STACK.md` §9, `12_DATABASE_DESIGN.md`, `14_SYSTEM_DESIGN.md`, `10_ARCHITECTURE.md` |
| Consumed by     | Nest AI module in `apps/api`, golden-set CI, `31_IMPLEMENTATION_PLAN.md`                                                                                       |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# AI Architecture`, `# AI Orchestrator`, `# Memory`, `# Recommendation Engine`, `# AI Evaluation Framework`             |

---

## 1. Purpose and scope

This document is **canonical for what happens inside `AIOrchestrator.processTurn`**. If a model call, tool loop, RAG query, prompt stack, grounding check, circuit breaker, or trace key is not here, it does not exist. Add it here first, then implement.

**In scope:** orchestrator components, turn modes, classifier JSON, tool ports and max loops, RAG/KNN, prompt assembly, generator fallback + circuit breaker, post-generate grounding check, cost rows, golden set, extended `DecisionTraceSchema`.

**Out of scope, and where it lives instead:**

| Topic                                                         | Canonical location                |
| ------------------------------------------------------------- | --------------------------------- |
| What the AI may say / twelve intents / four laws              | `05_AI_BEHAVIOR_SPECIFICATION.md` |
| Fifteen `HUMAN_REQUIRED` triggers, `handoff_context`          | `06_AI_HUMAN_HANDOFF_RULES.md`    |
| Exact model **ids**, temperatures, `max_tokens`, SDKs         | `11_TECH_STACK.md` §9             |
| Tables, HNSW DDL, JSONB column names                          | `12_DATABASE_DESIGN.md`           |
| Jobs, lock TTL/token, rate-limit **numbers**, when to enqueue | `14_SYSTEM_DESIGN.md`             |
| HTTP admin routes (`/ai/settings`, playground)                | `13_API_DESIGN.md`                |
| Graph mapping, HMAC                                           | `16_INTEGRATION_DESIGN.md`        |
| PII in logs/prompts, customer erasure                         | `17_SECURITY_DESIGN.md`           |
| Who may `JOIN` whom                                           | `10_ARCHITECTURE.md`              |

Do not copy the fifteen triggers. Do not copy model evidence from `11`. Do not expose `POST /ai/respond`.

**References:** `§N` is this file. Sibling docs are filenames.

---

## 2. Invariants

1. Facts in the outbound text come from **this turn’s tool JSON or `business_rules`**, never from embeddings, chat history, or weights (`05` Law 1).
2. The model never writes `conversations.status`. `processTurn` must not call `ConversationService.transition`. The **worker** applies `intendedTransition` after the lock re-check (`14` §4). Orders/inventory go through `OrderService` / `InventoryService` (`10` §6).
3. Policy (stage 4) **before** generation. A complaint/refund never gets a sales compose (`05` §5.2).
4. Lock is owned by the **worker** (`14` §4–6). `processTurn` does not `SET` a second key. It **re-checks the token** before mutating tools and before returning outbound.
5. No LangChain / vendor agent loops. Vercel AI SDK + Vercel AI Gateway behind a thin provider service (`AiGatewayService`, `11` §9.6) with tools calling our domain services.
6. Playground / `is_test`: same pipeline; no Meta, no `usage_events`, no KPI rollup (`12` §2.6). **Do** write `ai_usage` and traces (Owner cost of tests; G4). Do not write `usage_events`.
7. Degraded guess < handoff. Grounding fail → do not send (`05` §19).
8. Customer messages, RAG chunks, and knowledge-document text are **data, not instructions**. The model must not follow orders inside them (prompt injection). `custom_system_append` still cannot weaken the four laws (`05` §3.2). Phone/address in the prompt only when `17` §8.2 allows.

---

## 3. Entry points

The worker (`14`) holds `conversation:{id}:processing` then calls one of:

| Mode         | Job                         | `ai_enabled` required                 | Persist outbound                                                               | Meta                         |
| ------------ | --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| `inbound`    | `process_inbound_message`   | yes (caller already skipped if false) | per `reply_mode`                                                               | if `auto_send` and not draft |
| `suggest`    | `generate_suggestion`       | **no**                                | `draft` only                                                                   | never                        |
| `playground` | same inbound job, `is_test` | yes on the test thread                | **visible AI message**, `delivery_status=sent`, no Meta, no `deliver_outbound` | never                        |
| `summarize`  | `summarize_conversation`    | n/a                                   | writes `conversations.summary` + briefing copy (`06`)                          | never                        |

```ts
processTurn(input: {
  businessId: string;
  conversationId: string;
  inboundMessageId: string;
  mode: "inbound" | "suggest" | "playground";
  lockToken: string;
}): Promise<TurnResult>
```

`TurnResult`: outbound text (or null), `deliveryIntent` (`queued` \| `draft` \| `local` \| `none`), `intendedTransition` (or null) + `handoffContext`, ids of orders/reservations **already committed**, `staleLock`, trace, actions.

**Who writes what**

| Write                                          | Where                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `reserve_stock`, `create_pending_order`        | Inside `processTurn` via module services, **after** a lock-token re-check                                                |
| `conversations.status` / `handoff_context`     | **Worker only** (`14` §4 steps 5–6), from `intendedTransition`. Tools **must not** call `ConversationService.transition` |
| Outbound `messages` row                        | Worker, after token re-check                                                                                             |
| `ai_actions`, `ai_decision_traces`, `ai_usage` | AI module inside `processTurn` (`outbound_message_id` nullable until worker fills it)                                    |

`deliveryIntent=local`: playground — persist `sent`, skip Meta. `queued` / `draft`: production reply_mode. `none`: silence or failed grounding.

If the token mismatches **after** a mutating tool succeeded: return `staleLock=true`, outbound `none`, **keep** `intendedTransition` so a pending order is not left without `HUMAN_REQUIRED`. Worker still applies that transition; it does **not** send the stale generator text. Reservations not tied to a created order expire via `expire_reservations` (`14` §11).

`summarizeConversation(...)` is a **separate** function — not `processTurn`. Small model, template fallback (`05` §16). Must not block handoff.

---

## 4. Components

Single class `AIOrchestrator`. Sub-objects are functions/classes in the AI module, not extra ECS services.

```
AIOrchestrator.processTurn
├── IntentClassifier       — JSON intent + confidence (`gpt-5.6-luna`)
├── ContextBuilder         — memory layers + prompt inputs
├── MemoryManager          — last 20 msgs, summary, customer, rules
├── RagRetriever           — pgvector KNN, tenant-scoped
├── PolicyEngine           — `06` triggers + blocked_topics + silence
├── ToolExecutor           — ports to Products / Orders / Conversations / Customers / Businesses
├── ResponseGenerator      — customer-visible LLM + tools-as-facts
├── GroundingEvaluator     — post-check before return
└── (Orders/inventory writes via services; status via worker)
```

Lead scoring is **not** here (`14` §10). Notifications after handoff are **not** a model tool (`05` §8.2).

---

## 5. `processTurn` sequence

Caller already: lock, rate-limit skip/delay, agent enabled, not over hard cap (`14`).

```
1. Load ConversationService.getForTurn + CustomerService + BusinessRulesService.effective
   + last 20 messages + summary + collected_fields + open PENDING_CONFIRMATION (OrderService)
2. Normalize already happened in Integrations (`16`). Read language/script from the message row.
   Image-only, no text → outbound clarifying ask; no classifier; no tools. Vision is not MVP.
3. Silence short-circuit (`05` §11.2) except mode=suggest:
     HUMAN_REQUIRED / HUMAN_HANDLING / ai_enabled=false → inbound returns empty (no send).
     suggest: continue, but complaint/refund → 409 already at HTTP; if reached here, return none.
4. IntentClassifier → primary intent + confidence + optional secondary[]
   **Classified** `unknown` / below threshold → clarification ladder (`05` §7)
   **Classifier outage** (timeout, 5xx, OpenAI circuit open) → do **not** burn a clarify turn.
     Treat as `unknown` with `classifier_error=true`: allow grounded catalog tools
     (`search_products`, `check_inventory`); **block** `reserve_stock`,
     `create_pending_order`, purchase `trigger_human_handoff`. Escalating
     `06` detectors still fire (complaint/refund/human_request).
   Escalating intent wins if mixed (`05` §6.1)
5. PolicyEngine.evaluate → allow | escalate | clarify | blocked | silent
   Escalate: set `intendedTransition` + briefing; ToolExecutor may `create_pending_order` on the purchase path; **no** `transition` SQL here
6. If allow and tools needed: ToolExecutor (plan from intent, not from a free-form agent loop)
   `mode=suggest` or `classifier_error`: **no** `reserve_stock` / `create_pending_order` / purchase handoff
7. RagRetriever for FAQ/brand prose (never as price/stock)
8. ResponseGenerator (or canned escalate/clarify line)
9. GroundingEvaluator. Fail → one regenerate with the violation named; fail again → `deliveryIntent=none`.
   `mode=inbound` or `playground`: then escalate `integration_failure`. **`mode=suggest`: no extra escalation**
10. Build DecisionTraceSchema + ai_actions + **always** `ai_usage` (including `is_test`; KPI/`usage_events` still skip playground)
11. Return TurnResult. Worker: token check → persist message → `transition` if intended → events.
```

Wall clock: stay inside p95 **30s** inbound→first reply (NFR-PERF-02). Classifier + tools + one generate should fit; fallbacks consume the rest (`11` §9.5). Do not start a second inbound generate after 20s elapsed — skip to fallback or escalate `ai_timeout`.

---

## 6. Intent classifier

| Pin             | Value                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Model           | `ai_settings` does not override — always `gpt-5.6-luna` (`11`)                                                                                |
| Temperature     | **0**                                                                                                                                         |
| `max_tokens`    | **200**                                                                                                                                       |
| Timeout         | **15s**                                                                                                                                       |
| Fallback        | none as a second classifier model                                                                                                             |
| Circuit / error | skip classify; `classifier_error=true` (see §5 step 4). **Not** the `05` §7 ladder — that ladder is for a successful classify below threshold |

Output Zod `IntentClassificationSchema`:

```json
{
  "intent": "purchase_intent",
  "confidence": 0.92,
  "secondary": ["price_question"]
}
```

`intent` is one of the twelve in `05` §6. Unknown string → `unknown`. Persist `conversations.last_intent` (`unknown` on outage). Log `ai_actions` `action_type=intent_classify` (`success=false` on outage).

Clarification ladder (`05` §7) counts only turns where the classifier **returned** a confidence below threshold — not outages. Streak = last two inbound traces with `confidence < threshold` and `classifier_error` absent/false (OQ-62). Do **not** store streak on `collected_fields`. No new `12` column in MVP.

---

## 7. Policy engine

Inputs: intent, confidence, streak, `ai_enabled`, status, `blocked_topics`, `06` detectors, lifecycle, pending order.

Outputs:

| Decision   | Next                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escalate` | Prepare `handoff_context`; purchase path may `create_pending_order`. Worker runs `transition`. Generator may write the **customer-facing pause line** from the escalation prompt only |
| `clarify`  | One question; no catalog tools required                                                                                                                                               |
| `blocked`  | Decline + escalate                                                                                                                                                                    |
| `allow`    | Tool plan + generate                                                                                                                                                                  |
| `silent`   | mode inbound + silence rules                                                                                                                                                          |

Do not re-list the fifteen reasons. Import the detector functions that implement `06` §4.

Purchase close (`05` §8.4) is **code**, not a prompt: search → inventory → reserve → collect → re-check → `create_pending_order` → `trigger_human_handoff`. One field question per turn.

---

## 8. Tool executor

### 8.1 Caps (per `processTurn`)

| Cap                                       |                                                                                  Value |
| ----------------------------------------- | -------------------------------------------------------------------------------------: |
| Max **mutating or read** tool invocations |                **8** (nested `check_inventory` inside `recommend_products` **counts**) |
| Max **generator↔tool** rounds             |                                                    **2** after the first planned batch |
| Retry on tool **error**                   |                                               **1** then uncertainty / escalate (`05`) |
| Retry on tool **empty**                   |                                                                   none — say not found |
| Timeout per tool                          | **2s** local (NFR-PERF-05 search 400 ms); inventory `FOR UPDATE` may wait — cap **3s** |

Exceeding max tools: stop, generate from what you have **if FACTS exist**, else escalate `integration_failure`. Do not raise lock TTL (`14`). A **single** purchase-close turn (re-check inventory → create → handoff) must fit; the full funnel is **multi-turn** (`05` §8.4) and must not be forced into one `processTurn`.

### 8.2 Ports (AI module → services)

| Tool                    | Service                                                  | Mutating                            |
| ----------------------- | -------------------------------------------------------- | ----------------------------------- |
| `search_products`       | `CatalogService.searchVariants`                          | no                                  |
| `recommend_products`    | Catalog + RagRetriever + `check_inventory` on candidates | no                                  |
| `check_inventory`       | `InventoryService.check`                                 | no                                  |
| `calculate_delivery`    | `BusinessRulesService.deliveryFor`                       | no                                  |
| `reserve_stock`         | `InventoryService.reserve` (`12` §6.5)                   | **yes** — re-check lock token first |
| `get_customer_history`  | `CustomerService.history`                                | no                                  |
| `create_pending_order`  | `OrderService.createPending`                             | **yes** — lock token                |
| `trigger_human_handoff` | Builds `HandoffContextSchema` (`06`) onto `TurnResult`   | no — worker `transition`            |
| `transfer_to_human`     | same                                                     | no — worker `transition`            |

`send_notification` is **not** a tool. Conversations/Notifications consume `state_changed` (`14` §8).

The model may **request** a tool name from the allow-list. The executor **validates args** with Zod and ignores unknown names. It does not execute raw SQL.

### 8.3 Zod names (`packages/shared`)

`SearchProductsInputSchema` `{ query: string, limit?: number }` — limit default 8, max 15.

`SearchProductsOutputSchema` array of `{ variantId, productId, sku, name, size?, color?, price, currency, availableStock, imageUrl? }`. Price is decimal string.

`CheckInventoryInputSchema` `{ variantId, quantity? }`.

`CheckInventoryOutputSchema` `{ variantId, availableStock, reservable: boolean }`.

`ReserveStockInputSchema` `{ variantId, quantity, conversationId }`.

`CreatePendingOrderInputSchema` — items + snapshots per `12`; idempotency `{conversationId}:pending:{variantId}:{qty}`.

`CalculateDeliveryInputSchema` `{ region: string }` → `{ fee, currency, etaHours, zoneName }` or empty → `policy_conflict`.

`GetCustomerHistoryInputSchema` `{ customerId: string }` → orders + preferences + notes (no card numbers).

`RecommendProductsInputSchema` `{ query?: string, budget?: string }` — output `05` §17.

`HandoffToolInputSchema` `{ reason, priority }` — reason must be a `06` value.

Empty search: `[]`, not a fake row.

`recommend_products` output matches `05` §17. Never include `availableStock === 0`. Upsell omitted if `sales_strategy.upsell === false` or intent is complaint/refund. Each candidate `check_inventory` **counts** toward the 8.

---
