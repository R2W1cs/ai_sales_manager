| `vip` | Priority tone, optional auto-handoff (`vip_customer`) | Ever argue |

The `order_pending` row is the one most likely to be implemented wrong. A customer with an open `PENDING_CONFIRMATION` order who asks another question is _waiting on the business_, not shopping. Selling to them at that moment reads as if the business lost track of their order.

---

## 13. Behaviour by conversation state

| Status                | AI behaviour                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `NEW`                 | First inbound; greet per template, classify, proceed                                          |
| `AI_ACTIVE`           | Full autonomous operation under all guardrails                                                |
| `HUMAN_REQUIRED`      | Silent. May generate suggestions on demand (§14.2). No autonomous send under any circumstance |
| `HUMAN_HANDLING`      | Silent. Suggestions available to the assigned staff member                                    |
| `RESOLVED` / `CLOSED` | A new inbound reopens the conversation and re-enters classification                           |

Resuming AI control is **blocked while an order awaits confirmation**. The state machine, not the AI, enforces this.

---

## 14. Reply modes and suggestions

### 14.1 Reply modes

| Mode                | Behaviour                                              | Typical use                                  |
| ------------------- | ------------------------------------------------------ | -------------------------------------------- |
| `auto_send`         | AI messages are delivered after the policy check       | Production default once trust is established |
| `approval_required` | AI drafts; a staff member must approve before delivery | **Default for new businesses**               |
| `draft_only`        | Drafts persisted; staff send manually                  | Training and sandbox                         |

New businesses start in `approval_required`. Completing G4 unblocks live AI; it does **not** flip `reply_mode` to `auto_send` (FR-AI-011). The owner opts in explicitly (onboarding step 6 optional toggle, or Settings). This is a trust-building mechanism, not a limitation: a merchant who has watched twenty good drafts go out will enable autonomy themselves.

Staff may edit a draft before approving. The edited text is what is sent, and the edit is recorded for feedback analysis (FR-AI-014).

### 14.2 AI suggestions during human handling

When a human is handling a conversation, the AI still does the work — it just does not send.

| Rule                                                       | Detail                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A suggestion is a **draft**, never an autonomous reply     | Showing one during `HUMAN_REQUIRED` does not violate `ai_enabled = false`, because nothing is delivered without a human click (FR-AI-017)                                    |
| Suggestions obey every guardrail applying to sent messages | Grounded facts only, no invented price or stock, no discount, no refund approval, no payment promise (FR-AI-018)                                                             |
| Suppressed on complaint and refund conversations           | A tone-deaf suggestion in front of an angry customer is worse than no suggestion (FR-AI-019)                                                                                 |
| Generated **on demand** and debounced                      | Explicit `[Suggérer]` click — never on thread open, never per keystroke (`01` OQ-16, `23`, `41` C-2). Each generation is a billable call recorded in `ai_usage` (FR-AI-020a) |
| Sending records an AI message flagged human-approved       | Editing before sending records the edit for feedback analysis (FR-AI-020b)                                                                                                   |

This is the same machinery as `approval_required`, surfaced _during_ human handling rather than in place of it.

---

## 15. Output constraints

### 15.1 Hard constraints

- Reply in the business default language unless the customer clearly uses another supported language (FR-AI-022)
- Prices and stock numbers come from tool results **in the same turn** (FR-AI-020)
- On empty or conflicting tool data, state uncertainty and offer handoff — never guess (FR-AI-023)
- Never state a policy that is not in `business_rules`

### 15.2 Style constraints

These are quality rules, not laws, but they are what makes the agent read like a competent salesperson rather than a chatbot.

| Constraint                                                  | Rationale                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| **One question per message**                                | Multi-question messages read as a form and reduce reply rates           |
| **Short messages**                                          | The channel is a DM, not email. Two or three sentences is usually right |
| **No markdown, no bullet lists**                            | Instagram and Messenger render them as literal asterisks                |
| **Emoji sparingly, matching merchant tone**                 | Normal in this market; overuse reads as spam                            |
| **Never restate the customer's question back**              | "So you'd like to know the price of the black hoodie?" wastes a turn    |
| **Prefer one clarifying question over a long hedged reply** | Explicit in the decision rules                                          |
| **Product names and SKUs reproduced exactly**               | They are identifiers, not prose                                         |

---

## 16. Conversation summarization

Generated automatically when entering `HUMAN_REQUIRED` or on staff **Take over**. Stored on `conversations.summary` and copied into `handoff_context`.

**Shape:**

```
Customer wants:      Black Hoodie size M
Concern:             Delivery time to Sfax
AI already collected: Name, phone, address (Tunis)
Reason for handoff:  Payment confirmation (pending order #1042)
Products discussed:  Black Hoodie M (120 DT), Navy Cap
AI recommendation:   Confirm COD; offer express delivery if in business rules
```

**Implementation rules:**

- Job `summarize_conversation`, triggered after `trigger_human_handoff()` or takeover
- A small, fast model with the transcript and tool results as input
- **Template fallback if the LLM fails** — a handoff must never be blocked by summarization
- Regenerated if more than 10 new messages arrive before a human opens the thread

The summary is written for a staff member who has thirty seconds and has not read the thread. Every line answers a question they would otherwise have to scroll for.

---

## 17. Recommendation behaviour

`recommend_products()` complements search for **selling**, not merely retrieval.

**Inputs:** classified intent, stated budget, `lifecycle_stage`, customer history, products already discussed in the thread, catalog similarity via embeddings and category, and stock availability of candidates.

**Output:**

```json
{
  "primary": { "product_id": "…", "variant_id": "…", "reason": "…" },
  "alternatives": [{ "product_id": "…", "reason": "…" }],
  "upsell": { "product_id": "…", "reason": "…" }
}
```

**Rules:**

- **Never recommend an out-of-stock variant** in MVP
- Upsell only when both `business_rules` and `sales_strategy` allow it
- **No upsell on complaint or refund conversations**, ever
- Every recommendation is logged in `ai_actions` for debugging
- Each item carries a `reason`, so staff can see why it was suggested

**MVP implementation:** rule-based plus embedding similarity. No separate ML model. ML-based recommendation is Phase 3 and only if rule-based scoring proves measurably limiting.

---

## 18. Prompt architecture

### 18.1 Runtime assembly

```
active system prompt (ai_prompts, type = system)
  + business_rules
  + ai_settings.custom_system_append
  + sales prompt          (when selling)
  + escalation prompt     (when composing a handoff message to the customer)
```

### 18.2 Versioning rules

- Prompts are versioned per `(business_id, type)` with a monotonic integer; exactly one row is `active`
- **Never edit an active prompt in place.** Create a new version and flip `active` (FR-AI-026)
- Platform defaults are seeded on business creation; merchants may override (FR-AI-027)
- Every outbound AI message stores `prompt_version_id` in `ai_metadata`, so conversion and feedback can be compared by version
- CI golden tests run against **platform** default versions; businesses opt in to new platform defaults rather than being migrated silently

A merchant-facing prompt editing UI is **not** in MVP — prompt changes go through the team. Deferred to Phase 2.

---

## 19. Failure and degradation

| Failure                        | Behaviour                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Primary model unavailable      | Retry **fallback model** (`gpt-5.6-terra`, then `claude-sonnet-5`) before escalating (FR-AI-028)                              |
| LLM timeout (>15s)             | Retry once, then escalate `HUMAN_REQUIRED` with reason `ai_timeout`                                                           |
| All models fail                | Queue the turn, notify the owner; optional one-time "we'll reply shortly" per thread. Never send a degraded reply (FR-AI-029) |
| Meta unavailable               | Queue outbound; inbound ack `200` only after persist                                                                          |
| Database unavailable           | Retry jobs; do not ack webhooks unless persisted                                                                              |
| Tool returns an error          | Retry once; then tell the customer we are uncertain and escalate. Never assume a value                                        |
| Tool returns empty             | State that we could not find it; offer alternatives or handoff                                                                |
| Stock changed mid-conversation | Re-run `check_inventory()` before order creation; apologise and offer alternatives if insufficient                            |
| Embedding index stale          | The AI may miss new FAQ content; the `reindex` job runs after catalog and knowledge writes                                    |
| Tenant over usage limit        | AI paused; humans can still reply; owner notified                                                                             |
| Customer sends image only      | Ask for text or a product name. Vision is post-MVP                                                                            |
| Policy conflict between rules  | Escalate `policy_conflict` at `normal` priority — never resolve it autonomously                                               |

The consistent principle: **a degraded reply is worse than a handoff**. Every failure is **logged**. Every failure path terminates in either silence plus a notified human, or an honest statement of uncertainty. None terminates in a guess.

---

## 20. Observability per turn

Every turn emits four operational records. Sampled conversations also emit `ai_evaluations`. This is what makes Law 4 real.

| Record                       | Contents                                                                                                                                | Purpose                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ai_actions`                 | One row per tool call: `action_type`, `tool_name`, `input`, `output`, `success`, `error_message`, `duration_ms`                         | Debug what the AI _did_                             |
| `ai_decision_traces`         | One row per turn: intent, confidence, `rules_checked`, `policy_outcomes`, decision, escalation reason and priority, `prompt_version_id` | Answer "why did the AI transfer this?" in the inbox |
| `ai_metadata` on the message | `intent`, `confidence`, `tools_called`, `model`, `latency_ms`, `prompt_version_id`                                                      | Dashboards and per-version quality comparison       |
| `ai_usage`                   | Token counts and cost per call, including suggestion generations                                                                        | Cost tracking and billing                           |
| `ai_evaluations`             | Conversation-level score, failure reason, evaluator type                                                                                | Quality review distinct from message thumbs         |

Every conversation _may_ receive an `ai_evaluations` row covering: answer correctness, product grounding, language match, tool accuracy, escalation correctness, conversion outcome. Evaluator types: `golden_set`, `production_sample`, `staff`, `automated_grounding`.

Example trace:

```json
{
  "intent": "purchase_intent",
  "confidence": 0.92,
  "rules_checked": ["stock_available", "payment_automation_disabled", "required_fields_complete"],
  "policy_outcomes": { "stock_available": true, "payment_automation_disabled": true },
  "decision": "handoff",
  "escalation_reason": "purchase_handoff",
  "handoff_priority": "high",
  "prompt_version_id": "uuid"
}
```

Retention: 90 days hot in Postgres, archived to S3 if compliance requires.

---

## 21. Evaluation and the feedback loop

### 21.1 Metrics

| Metric                    | Definition                                                | MVP target                 |
| ------------------------- | --------------------------------------------------------- | -------------------------- |
| Answer accuracy           | Staff-reviewed sample vs ground truth                     | > 90% on FAQ, price, stock |
| **Hallucination rate**    | Responses containing facts absent from tool or RAG output | **< 2%**                   |
| Handoff confirmation rate | `CONFIRMED` / `PENDING_CONFIRMATION` created by AI        | Key MVP ROI metric         |
| Human takeover rate       | Escalations / active conversations                        | Baseline, then improve     |
| Response time             | Inbound → first AI reply (p95)                            | < 30s                      |
| Tool success rate         | Tool calls without error / total                          | > 99%                      |
| CSAT                      | Optional post-close thumbs                                | > 4/5                      |

Hallucination rate is the metric that gates everything else. A regression here pauses feature work (`04_ROADMAP.md` §10).

### 21.2 Methods

- **Golden set:** 50–100 Tunisian Arabic and French test prompts per vertical, run in CI on every prompt or model change
- **Shadow mode:** AI drafts, human approves — available as a beta setting and a standing evaluation practice from Phase 2
- **Production sampling:** random 1% of conversations flagged for owner review
- **Persisted evaluations:** `ai_evaluations` rows for golden-set, sampled, and staff-reviewed conversations (FR-AI-032)
- **Playground:** Owner/Admin simulator with canned scenarios before activation (FR-AI-030, FR-AI-031); traces Owner/Admin only

### 21.3 Staff feedback

On each AI message, staff may rate 👍 / 👎 with a reason from a fixed enum — `wrong_product`, `wrong_tone`, `missing_information`, `incorrect_policy`, `hallucination`, `other` — plus an optional comment.

Feedback produces a weekly quality report per `prompt_version_id` and queues negative samples for prompt iteration and golden-set additions. It is **not** automatic fine-tuning in MVP; the data is exported for possible future training.

---

## 22. Worked examples

### 22.1 Purchase intent, happy path

**Customer:** _"famma black hoodie size M? nheb nechri"_

| Stage     | Result                                                                               |
| --------- | ------------------------------------------------------------------------------------ |
| Normalize | Language: Tunisian Arabic, Latin script. Channel: Instagram                          |
| Intent    | `purchase_intent`, confidence 0.92                                                   |
| Policy    | No triggers; `ai_enabled = true`; lifecycle `interested`                             |
| Tools     | `search_products("black hoodie")` → SKU HOODIE-BLK; `check_inventory(variant M)` → 5 |
| Generate  | Confirms availability and price **from the tool result**, asks for name only         |
| Persist   | Trace recorded, `lifecycle_stage` → `qualified_lead`                                 |

Three turns later, with all fields collected: `check_inventory()` re-run → `create_pending_order()` → `trigger_human_handoff()` → `send_notification(ORDER_REQUEST)`. Final AI message tells the customer a team member will confirm. `ai_enabled` becomes `false`.

### 22.2 Price conflict

**Customer:** _"the promo says free delivery but you charged 5 DT last time"_

Business rule says 5 DT Tunis; an active promotion says free delivery above 200 TND; the cart is 140 TND. Ranks 1 and 3 appear to conflict from the customer's framing.

The AI does **not** compute eligibility and announce a verdict. It escalates `policy_conflict` at `normal` priority with a summary naming both sources. A human resolves it in ten seconds with authority the AI does not have.

### 22.3 Refund request

**Customer:** _"the hoodie is damaged, I want my money back"_

Intent `refund_request`. The policy check short-circuits **before** generation, so the model never composes a sales reply. The AI acknowledges with empathy, states that a team member will handle it, and escalates at high priority. Suggestions are suppressed for the rest of this conversation. No upsell, ever.

---

## 23. Requirements traceability

| Section                         | Requirements                          |
| ------------------------------- | ------------------------------------- |
| §3 Agent configuration          | FR-AI-001 → 008                       |
| §4 Language                     | FR-AI-022                             |
| §5 Pipeline                     | FR-AI-025, NFR-PERF                   |
| §6–7 Intents and confidence     | FR-AI-024                             |
| §8 Tools                        | FR-AI-020, FR-ORD, FR-HAND            |
| §9 Context priority             | FR-AI-020, FR-AI-023                  |
| §10 Memory                      | FR-AI-020                             |
| §11 Restrictions                | FR-AI-020 → 023                       |
| §12 Lifecycle                   | FR-CUST-007                           |
| §14 Reply modes and suggestions | FR-AI-010 → 020b                      |
| §18 Prompts                     | FR-AI-026, FR-AI-027                  |
| §19 Failure                     | FR-AI-028, FR-AI-029, NFR-REL-07 → 09 |
| §20 Observability               | FR-AI-025, FR-OBS-001 → 005           |
| §21 Evaluation                  | FR-AI-030 → 032, FR-OBS-011           |

---

## 24. Open questions

| #     | Question                                                                                                         | Working answer                                                                                         | Owner       | Revisit             |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------- | ------------------- |
| OQ-30 | Does mirroring Latin-script Tunisian Arabic need explicit prompt instruction, or does the model do it naturally? | Instruct explicitly; verify with the golden set. Silent script-switching is a visible quality failure. | AI          | Golden set build    |
| OQ-31 | Should the low-confidence counter reset on any successful turn, or only after N successes?                       | Reset on the first successful turn; revisit if flapping appears in traces.                             | AI          | Post-launch         |
| OQ-32 | Is a 15s LLM timeout right given the 30s p95 target?                                                             | Yes — it leaves room for one fallback attempt inside the budget.                                       | Engineering | Load testing        |
| OQ-33 | Should suggestions be pre-generated on conversation open, or only on explicit click?                             | **Explicit click only** in MVP (`01` OQ-16, `23`). Do not generate on thread open.                     | Product     | Phase 2 cost review |
| OQ-34 | How many golden-set prompts per vertical are actually enough?                                                    | Start at 50, grow from negative production feedback rather than by writing more upfront.               | AI          | Continuous          |

---

## 25. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# AI Agent`, `# AI Decision Engine`, `# AI Architecture`, `# AI Agents (per business)`, `# Memory`, `# AI Evaluation Framework`, `# AI Feedback Loop`, `# Failure Scenarios` — authoritative
- `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md` — the 15 escalation triggers, priorities, and staff briefing
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` §11 — FR-AI requirement definitions
- `docs/10_engineering/15_AI_ARCHITECTURE.md` — orchestrator components, model routing, retrieval implementation
- `docs/10_engineering/12_DATABASE_DESIGN.md` — `ai_agents`, `ai_settings`, `ai_prompts`, `ai_actions`, `ai_decision_traces`, `ai_feedback`, `ai_usage`
