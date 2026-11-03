## 10. Canonical location map

**Single-source-of-truth rule:** every concept has exactly one canonical document. Other documents reference it; they do not restate it. Use this table before writing anything new.

Authoritative parent: `docs/AI_Sales_Agent_Brain_Dump.md`. Numbered files below are generated exports.

### Product

| Concept                                                                        | Canonical document                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Vision, positioning, market, ICP, journey                                      | `docs/00_product/00_PROJECT_OVERVIEW.md` (this file)                                              |
| Functional and non-functional requirements                                     | `docs/00_product/01_PRODUCT_REQUIREMENTS.md`                                                      |
| User stories and acceptance criteria                                           | `docs/00_product/02_USER_STORIES.md`                                                              |
| MVP in/out boundary                                                            | `docs/00_product/03_MVP_SCOPE.md`                                                                 |
| Phases, success metrics, sequencing                                            | `docs/00_product/04_ROADMAP.md`                                                                   |
| AI persona, intents, tools, memory, guardrails, output rules                   | `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md`                                                 |
| The 15 `HUMAN_REQUIRED` triggers, priorities, purchase handoff, staff briefing | `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md`                                                    |
| Ubiquitous language, entity relationships (User ≠ Customer, Lead ≠ Customer)   | `docs/00_product/07_DOMAIN_MODEL.md` (export pending; until then: this file §14, columns in `12`) |

### Engineering

| Concept                                                                          | Canonical document                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| Module boundaries, dependency rules                                              | `docs/10_engineering/10_ARCHITECTURE.md`       |
| Languages, frameworks, libraries, versions, rationale                            | `docs/10_engineering/11_TECH_STACK.md`         |
| Every table, field, index, constraint, relationship                              | `docs/10_engineering/12_DATABASE_DESIGN.md`    |
| Every endpoint, request/response, validation, error                              | `docs/10_engineering/13_API_DESIGN.md`         |
| Conversation state machine, request flows, jobs, failure handling, rate limiting | `docs/10_engineering/14_SYSTEM_DESIGN.md`      |
| Lead scoring model: signals, weights, temperature bands, recompute triggers      | `docs/10_engineering/14_SYSTEM_DESIGN.md`      |
| Realtime gateway: rooms, events, auth, reconnection                              | `docs/10_engineering/14_SYSTEM_DESIGN.md`      |
| Orchestrator internals, RAG, prompt versioning, evaluation, cost, traces         | `docs/10_engineering/15_AI_ARCHITECTURE.md`    |
| Channel adapters, webhooks, canonical events, retries                            | `docs/10_engineering/16_INTEGRATION_DESIGN.md` |
| Auth, RBAC matrix, tenancy isolation, encryption, secrets, audit                 | `docs/10_engineering/17_SECURITY_DESIGN.md`    |
| Environments, AWS topology, CI/CD, sizing, ops                                   | `docs/10_engineering/18_DEPLOYMENT.md`         |

### Design

| Concept                                                                                                                    | Canonical document                                        |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Tokens, spacing, typography, colour scales, RTL rules                                                                      | `docs/20_design/20_DESIGN_SYSTEM.md`                      |
| Voice, tone, logo, naming, localisation of brand                                                                           | `docs/20_design/21_BRAND_STRATEGY.md`                     |
| Sales command center: three-pane inbox, triage ordering, customer panel, AI suggestions, pipeline, notification discipline | `docs/20_design/22_UX_FLOWS.md`                           |
| Screen-by-screen flows, onboarding, handoff UX, empty states, mobile                                                       | `docs/20_design/22_UX_FLOWS.md`                           |
| Component inventory, props, states, empty/error states                                                                     | `docs/20_design/23_UI_COMPONENTS.md`                      |
| Visual benchmarks (inbox, dashboard, products, settings, empty states)                                                     | `docs/20_design/24_REFERENCE_SCREENS.md` (export pending) |

### Execution and governance

| Concept                                           | Canonical document                               |
| ------------------------------------------------- | ------------------------------------------------ |
| Work breakdown, task IDs, dependencies, estimates | `docs/30_execution/30_TASKS.md`                  |
| Build order, milestones, calendar release plan    | `docs/30_execution/31_IMPLEMENTATION_PLAN.md`    |
| Per-feature specs (problem → acceptance criteria) | `docs/30_execution/32_FEATURE_SPECIFICATIONS.md` |
| Architecture decision records                     | `docs/40_project_management/40_DECISIONS.md`     |
| Assumptions made where the Brain Dump was silent  | `docs/40_project_management/41_ASSUMPTIONS.md`   |
| Known shortcuts and their repayment plan          | `docs/40_project_management/42_TECH_DEBT.md`     |
| Documentation change history                      | `docs/40_project_management/43_CHANGELOG.md`     |

---

## 11. Success metrics

### 11.1 North star

**AI-generated revenue per business.** Every other metric is diagnostic of this one.

### 11.2 Primary MVP metric

**Handoff → confirmed conversion rate**: confirmed orders ÷ AI-created pending orders. This is the metric that proves the core thesis (AI qualifies, human closes) and is the number shown to prospects.

### 11.3 Phase 1 exit criteria

| Metric                         | Target                             |
| ------------------------------ | ---------------------------------- |
| Paying businesses              | 10                                 |
| Conversations handled          | 1,000                              |
| Handoff → confirmed conversion | Measured and reported per business |
| AI-attributed confirmed orders | Primary KPI, trending up           |

### 11.4 MVP analytics surface

The dashboard ships with **exactly four counters** — messages handled, orders created, human handoffs by reason, and conversion. No custom reports, segmentation, or exports in MVP. Definitions: `docs/00_product/01_PRODUCT_REQUIREMENTS.md`; everything richer is gated behind `feature_flags.advanced_analytics`.

### 11.5 Founder / ops validation metrics

These are **not** extra dashboard tiles. They are the Phase 1 review set (Brain Dump `# Analytics`).

| Layer              | Metrics                                                               |
| ------------------ | --------------------------------------------------------------------- |
| **Activation**     | Connected channel · added products · activated AI                     |
| **AI performance** | % conversations handled · human takeover rate · response time         |
| **Sales**          | Qualified leads · pending orders · confirmed orders · conversion rate |
| **Business**       | MRR · retention                                                       |

### 11.6 Quality guardrail metrics

These are not growth metrics; they are release gates. Targets and measurement method: `docs/10_engineering/15_AI_ARCHITECTURE.md`.

| Metric                                  | MVP target                   |
| --------------------------------------- | ---------------------------- |
| Answer accuracy (staff-reviewed sample) | > 90% on FAQ / price / stock |
| Hallucination rate                      | < 2%                         |
| Inbound → first AI reply (p95)          | < 30s                        |
| Tool success rate                       | > 99%                        |

---

## 12. Business model summary

Pricing is **message-metered with channel and seat limits**, because messages handled is the value metric that scales with merchant benefit and with our variable cost.

| Plan    | Channels | AI messages / month | Seats                  |
| ------- | -------- | ------------------- | ---------------------- |
| Starter | 1        | 1,000               | 1                      |
| Growth  | 5        | 10,000              | 5 + advanced analytics |

Enforcement behaviour: at any hard limit (AI messages, AI replies, conversations, or monthly AI budget), the AI stops auto-replying but the inbox keeps receiving messages and humans can still reply; the owner is notified and sees an upgrade CTA. Soft warnings at 80% and 95%. Customer-facing limits use **message counts**; internal margin analysis uses `ai_usage` (`ai_tokens`, `ai_cost`). Full design: `docs/10_engineering/14_SYSTEM_DESIGN.md`.

---

## 13. Roadmap at a glance

Detail, features, and success criteria per phase: `docs/00_product/04_ROADMAP.md`.

| Phase                           | Goal                                          | Headline capability                                                                                                           |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1 — AI sales assistant (MVP)    | Prove AI generates qualified buyers           | Instagram + Messenger, handoff checkout, command center, 4 KPIs, AI observability                                             |
| 2 — Catalog + WhatsApp          | Remove onboarding friction; close channel gap | Shopify/Woo sync, CSV hardening, **WhatsApp Cloud API**                                                                       |
| 3 — Channels & inventory depth  | More volume, trustworthy stock                | Two-way inventory sync, richer WhatsApp types, better recommendations                                                         |
| 4 — Payments & sales automation | Reduce human load                             | D17 / Flouci / Konnect / Stripe links → webhook → auto-confirm; `auto_send` default; lifecycle automation; advanced analytics |
| 5 — AI commerce OS              | Platform                                      | Multi-location, teams/shifts, partner API, marketplace templates                                                              |

Sequencing rationale worth internalising: **Phase 2 is catalog import, not smarter AI.** The dominant onboarding failure is "how do I get my products in?", not "the recommendations are weak". Do not reorder this without evidence.

---

## 14. Glossary

Terms used with precise meaning across all documents.

| Term                     | Definition                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Business**             | A tenant. One merchant workspace. Root of all tenant-scoped data (`business_id`).                                                                                                                           |
| **User**                 | A person with login credentials. Belongs to one or more businesses via `business_members`. Roles: Owner, Admin, Employee (UI may say **Agent**).                                                            |
| **Customer**             | An end shopper in a messaging thread. Never logs in.                                                                                                                                                        |
| **Customer identity**    | A `customer_identities` row: `platform` + `platform_user_id`, optional verified `phone_number`. Same platform id = same customer; same verified phone = auto-link; otherwise Owner/Admin **manual merge**.  |
| **Channel**              | A messaging provider surface: `instagram`, `messenger` in MVP; `whatsapp` in Phase 2 (official Meta APIs only).                                                                                             |
| **Service window**       | Phase 2 (WhatsApp): 24-hour period for free-form replies; outside it, approved templates only.                                                                                                              |
| **Template message**     | Phase 2 (WhatsApp): pre-approved message form; never LLM-generated.                                                                                                                                         |
| **Channel account**      | A specific connected Page / IG professional account for a business.                                                                                                                                         |
| **Conversation**         | A persistent thread between one customer and one business on one channel account.                                                                                                                           |
| **Message**              | One canonical inbound or outbound message, with `sender_type` of `customer` / `ai` / `human` / `system`.                                                                                                    |
| **Intent**               | The classified purpose of an inbound message (12-value MVP taxonomy).                                                                                                                                       |
| **Tool**                 | A typed function the AI may call to obtain or change grounded state (e.g. `check_inventory()`).                                                                                                             |
| **Handoff**              | The controlled transfer of a conversation from AI to human, always with a reason, priority, and briefing.                                                                                                   |
| **`handoff_context`**    | The JSONB staff briefing persisted at handoff time.                                                                                                                                                         |
| **Pending order**        | An order in `PENDING_CONFIRMATION` created by the AI; not yet accepted or paid.                                                                                                                             |
| **Variant**              | The sellable unit (SKU). Holds price and stock. Simple products have one `is_default` variant.                                                                                                              |
| **Stock reservation**    | A short-lived hold on variant quantity during order collection, preventing double-selling.                                                                                                                  |
| **Business rule**        | A merchant-defined, versioned operational fact (delivery fee, return window, payment method) that the AI must treat as authoritative.                                                                       |
| **Business memory**      | The rules + policies + brand voice layer injected into every AI turn for that tenant.                                                                                                                       |
| **Grounding**            | Deriving every commerce fact in a reply from a tool result or stored rule in the same turn.                                                                                                                 |
| **Reply mode**           | `auto_send` / `approval_required` / `draft_only` — how much autonomy the AI has for outbound messages.                                                                                                      |
| **Prompt version**       | An immutable row in `ai_prompts`; referenced from every AI message for traceability.                                                                                                                        |
| **Decision trace**       | The recorded reasoning path (intent, confidence, rules checked, outcome) for one AI turn.                                                                                                                   |
| **Golden set**           | 50–100 curated Tunisian Arabic / French test prompts run in CI on every prompt or model change.                                                                                                             |
| **Sales command center** | The operator surface: a three-pane inbox built for triage and action, not for reading every conversation.                                                                                                   |
| **Lead score**           | Deterministic 0–100 triage signal per conversation, computed from rule-based signals. Explicitly **not** a purchase probability.                                                                            |
| **Lead temperature**     | `hot` / `warm` / `cold` band derived from lead score, used for grouping and badges.                                                                                                                         |
| **Sales priority**       | Inbox ordering: two active tiers (human-needed first by handoff priority then wait time; then AI-handled by temperature and score) plus an archived tier of `RESOLVED` / closed threads. Snooze is not MVP. |
| **Needs-me view**        | Default inbox filter showing escalations plus hot leads rather than all conversations.                                                                                                                      |
| **AI suggestion**        | An AI-generated draft offered to a human during handling. Never delivered without an explicit human action.                                                                                                 |
| **Pipeline view**        | Read-only Kanban projection of conversation and order status. Introduces no new states.                                                                                                                     |
| **Realtime gateway**     | WebSocket layer pushing domain events to the browser. An accelerator, never a source of truth.                                                                                                              |
| **Silence guarantee**    | When the AI is working correctly the operator surface stays quiet; notification volume is an inverse quality signal.                                                                                        |

---

## 15. How to use this documentation

### 15.1 For a human contributor

1. Read this file.
2. Read `03_MVP_SCOPE.md` to know what is in and out.
3. Read the canonical document for your area from §10.
4. Only then open `30_execution/30_TASKS.md`.

### 15.2 For an AI coding agent

Rules of engagement:

1. **The Founder Brain Dump is the highest authority.** These documents are its expansion. On any conflict, follow the Brain Dump and record the discrepancy in `41_ASSUMPTIONS.md`.
2. **Never invent a schema, endpoint, enum, or state.** If it is not in `12_DATABASE_DESIGN.md`, `13_API_DESIGN.md`, or `14_SYSTEM_DESIGN.md`, it does not exist yet — add it to the canonical document first, then implement.
3. **Never duplicate a definition across documents.** Reference the canonical location.
4. **Respect module boundaries** as defined in `10_ARCHITECTURE.md`. Cross-module database access is a defect, not a shortcut.
5. **Every AI-related change must preserve grounding** (§5.1) and prompt version traceability.
6. **Every new tenant-scoped table must carry `business_id`** and a `(business_id, ...)` index.

### 15.3 Change protocol

| Change type                         | Required action                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| New architectural decision          | Add an ADR to `40_DECISIONS.md`, then update the affected canonical document    |
| Assumption filling a Brain Dump gap | Record in `41_ASSUMPTIONS.md` with rationale, alternatives, and revisit trigger |
| Knowing shortcut taken              | Record in `42_TECH_DEBT.md` with cost, trigger, and repayment plan              |
| Any documentation edit              | Append to `43_CHANGELOG.md`                                                     |

---

## 16. Open questions

Items where the Brain Dump is silent or where a decision was made downstream and should be validated by the founder.

| #     | Question                                                                                   | Current working answer                                                                                                                                                        | Owner           | Revisit at                   |
| ----- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------- |
| OQ-01 | Is the platform UI language French, English, or both at launch?                            | **Pinned:** merchant UI is `fr-TN` primary, `ar-TN` RTL second, `en` third (`20` invariant 2, `22` header). Customer-facing AI language is per-business (`ar` / `fr` / `en`). | Product         | Locale stack frozen          |
| OQ-02 | Is pricing charged in TND or USD/EUR?                                                      | SaaS plan billing may be TND or provider EUR/USD via Stripe until a local PSP exists. **Merchant chrome still displays `DT`** (NFR-UX-08, `20`). Catalog/API store ISO `TND`. | Founder         | Phase 1 launch               |
| OQ-03 | Does a merchant ever need more than one AI agent in MVP?                                   | No — one primary agent per business; multi-agent is Phase 5.                                                                                                                  | Product         | Phase 3                      |
| OQ-04 | Legal basis for storing end-customer PII from Meta threads (retention, deletion requests)? | **MVP:** targeted erasure on request (`17` §8.3). No automatic 24-month purge yet (OQ-72).                                                                                    | Founder / Legal | Before first paying customer |
| OQ-05 | Who operates the golden-set evaluation — platform team or merchant?                        | Platform team owns the golden set; merchants contribute negative feedback samples via `ai_feedback`.                                                                          | AI lead         | Phase 2                      |

---

## 17. References

- `docs/AI_Sales_Agent_Brain_Dump.md` — authoritative source
- `docs/README.md` — folder layout and export map
- `docs/00_product/03_MVP_SCOPE.md` — what ships in Phase 1
- `docs/40_project_management/40_DECISIONS.md` — decision records
