## 14. Stored JSONB contracts

Validate with **Zod in `packages/shared`** before every write. Postgres does not enforce keys. Export name = schema name below. Path convention: `packages/shared` (e.g. `packages/shared/src/jsonb.ts` or colocated files). Adding a key is this file + the Zod schema, then a migration only if a column is added.

Opaque provider blobs (`integration_events.payload` / `headers`, `idempotency_keys.response_body`) are **not** domain contracts — do not invent a “nice” shape for them.

### 14.0 Inventory (every JSONB column)

| Column                                                | Zod export                        | Status                              |
| ----------------------------------------------------- | --------------------------------- | ----------------------------------- |
| `conversations.handoff_context`                       | `HandoffContextSchema`            | Canonical in `06` §6.1              |
| `messages.ai_metadata`                                | `AiMetadataSchema`                | §14.2                               |
| `ai_decision_traces.decision_trace`                   | `DecisionTraceSchema`             | §14.3; `15` may extend              |
| `plans.limits`                                        | `PlanLimitsSchema`                | §14.4                               |
| `product_variants.attributes`                         | `VariantAttributesSchema`         | §14.5                               |
| `order_items.attributes_snapshot`                     | same as `VariantAttributesSchema` | Copy at order create                |
| `conversations.lead_score_factors`                    | `LeadScoreFactorsSchema`          | §14.6                               |
| `businesses.settings`                                 | `BusinessSettingsSchema`          | §14.7 — **empty strict** in MVP     |
| `business_rules.payload`                              | discriminated on `rule_type`      | §14.8                               |
| `products.benefits` / `selling_points` / `objections` | `StringListSchema`                | `z.array(z.string())`               |
| `products.faqs`                                       | `FaqListSchema`                   | §14.9                               |
| `customers.address` / `orders.delivery_address`       | `AddressSchema`                   | §14.10                              |
| `orders.customer_snapshot`                            | `CustomerSnapshotSchema`          | §14.10                              |
| `customers.preferences`                               | `CustomerPreferencesSchema`       | §14.11                              |
| `conversations.collected_fields`                      | `CollectedFieldsSchema`           | §14.12                              |
| `ai_agents.sales_strategy`                            | `SalesStrategySchema`             | §14.13                              |
| `ai_actions.input` / `output`                         | `AiActionIOSchema`                | §14.14; per-tool in `15`            |
| `ai_evaluations.dimension_scores`                     | `DimensionScoresSchema`           | §14.15                              |
| `analytics_daily.handoffs_by_reason`                  | `HandoffsByReasonSchema`          | record of `escalation_reason` → int |
| `audit_logs.payload`                                  | `AuditPayloadSchema`              | envelope only; no secrets           |
| `message_templates.body_params`                       | `TemplateBodyParamsSchema`        | Phase 2; unused in MVP              |
| `integration_events.payload` / `headers`              | —                                 | Raw Meta. Do not wrap               |
| `idempotency_keys.response_body`                      | —                                 | HTTP replay blob                    |

### 14.1 `conversations.handoff_context`

**Canonical:** `06_AI_HUMAN_HANDOFF_RULES.md` §6.1 (`schema_version: 1`). Column may be null until `HUMAN_REQUIRED`; then the service must persist a document that parses as `HandoffContextSchema` (FR-HAND-003).

### 14.2 `messages.ai_metadata` (AI outbound)

`AiMetadataSchema`:

```json
{
  "intent": "purchase_intent",
  "confidence": 0.92,
  "tools_called": ["check_inventory"],
  "model": "gemini-3.5-flash",
  "latency_ms": 1800,
  "prompt_version_id": "uuid",
  "fallback_used": false
}
```

`model` must be a pinned id from `11` §9.3.

### 14.3 `ai_decision_traces.decision_trace`

`DecisionTraceSchema` — minimum keys for inbox “why” plus orchestrator fields (`15` §13.1). `schema_version: 1`. Extra keys require a schema bump, not silent `passthrough`.

```json
{
  "schema_version": 1,
  "intent": "purchase_intent",
  "confidence": 0.92,
  "decision": "handoff",
  "escalation_reason": "purchase_handoff",
  "handoff_priority": "high",
  "prompt_version_id": "uuid",
  "sales_prompt_version_id": "uuid",
  "rules_checked": ["stock_available"],
  "policy_outcomes": {},
  "tools_called": ["search_products"],
  "rag_chunk_ids": [],
  "models_attempted": ["gemini-3.5-flash"],
  "circuit_skipped": [],
  "classifier_error": false,
  "grounding_passed": true,
  "mode": "inbound",
  "latency_ms": 1800
}
```

### 14.4 `plans.limits`

`PlanLimitsSchema`:

```json
{
  "channel_accounts": 1,
  "ai_messages_per_month": 1000,
  "max_conversations": null,
  "max_ai_replies_per_month": 1000,
  "seats": 1,
  "monthly_ai_budget_usd": null
}
```

**Starter** as above. **Growth:** `channel_accounts: 5`, `ai_messages_per_month: 10000`, `seats: 5`. Advanced analytics is a **flag**, not a plan JSON key that unlocks a fifth KPI.

### 14.5 `product_variants.attributes`

`VariantAttributesSchema` (fashion): `{ "color": "Black", "size": "M" }` — both strings, both optional but at least one key for non-default SKUs. Do not store price or stock here. Other verticals add keys in this file first.

### 14.6 `lead_score_factors`

`LeadScoreFactorsSchema`: `Record<string, number>` of signal → points **actually applied**. Weights live in `14_SYSTEM_DESIGN.md`. Example: `{ "purchase_intent": 40, "pending_order": 30, "recency": 5 }`.

### 14.7 `businesses.settings`

`BusinessSettingsSchema`: `z.object({}).strict()`. Default `{}`. No silent keys (locale overrides, UI prefs, etc.) until listed here.

### 14.8 `business_rules.payload`

Discriminated by `rule_type`. Amounts are `number` in JSON and `Decimal` at the money boundary when copied onto orders.

**`delivery` — `DeliveryRulePayloadSchema`**

```json
{ "zones": [{ "name": "Tunis", "fee": 5, "currency": "TND", "eta_hours": 24 }] }
```

**`payment` — `PaymentRulePayloadSchema`**

```json
{ "methods": [{ "code": "cod", "label": "Cash on delivery" }] }
```

**`returns` — `ReturnsRulePayloadSchema`**

```json
{ "window_days": 7, "conditions": "unworn, tags on" }
```

**`working_hours` — `WorkingHoursPayloadSchema`**

```json
{
  "timezone": "Africa/Tunis",
  "weekly": { "mon": { "open": "09:00", "close": "18:00" }, "sun": null },
  "human_callback": "next_working_day"
}
```

**`discount` — `DiscountRulePayloadSchema`**

```json
{ "ai_may_offer": false, "max_percent": null }
```

Default: AI offers **no** discounts.

**`min_order` — `MinOrderPayloadSchema`:** `{ "amount": 50, "currency": "TND" }`

**`free_shipping` — `FreeShippingPayloadSchema`:** `{ "threshold": 100, "currency": "TND" }`

### 14.9 Merchandising

`StringListSchema`: `string[]` (benefits, selling points, objections).

`FaqListSchema`: `{ "q": string, "a": string }[]`.

### 14.10 Address and order snapshot

`AddressSchema`: `{ "line1": string, "city": string, "region"?: string, "postal_code"?: string, "country": "TN" }`

`CustomerSnapshotSchema`: `{ "name": string | null, "phone": string | null, "address": AddressSchema | null }`

### 14.11 `customers.preferences`

`CustomerPreferencesSchema`: `{ "sizes"?: string[], "colors"?: string[], "notes"?: string }`. Strict — no other keys.

### 14.12 `conversations.collected_fields`

`CollectedFieldsSchema`: array of `'name' | 'phone' | 'address' | 'quantity' | 'payment_preference'`. Same names as `06` briefing `collected_fields`.

### 14.13 `ai_agents.sales_strategy`

`SalesStrategySchema`: `{ "upsell": boolean, "cross_sell": boolean, "aggressiveness": "low" | "medium" | "high" }`

### 14.14 `ai_actions.input` / `output`

`AiActionIOSchema`: `z.record(z.string(), z.unknown())` at this layer. Named per-tool schemas live in `15_AI_ARCHITECTURE.md` §8.3 (`SearchProductsInputSchema`, …) and `packages/shared`. Do not write secrets or card numbers.

### 14.15 Evaluation, handoff counts, audit

`DimensionScoresSchema`: `{ "correctness"?: number, "grounding"?: number, "language"?: number, "tools"?: number, "escalation"?: number, "conversion"?: number }` — each 0–100.

`HandoffsByReasonSchema`: `Record<escalation_reason, number>`.

`AuditPayloadSchema`: `{ "before"?: object, "after"?: object, "reason"?: string }`. No tokens, no webhook bodies, no password hashes.

---

## 15. Integrity checklist

| Rule                    | Enforcement                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Tenant isolation        | `business_id` NOT NULL on tenant tables + query convention. **No RLS** in MVP (`17`)               |
| Variant-first selling   | No price/stock on `products`; CHECK on variant price/stock/discount                                |
| One default variant     | Partial unique `WHERE is_default = true` (at most one). Exactly one is a service rule              |
| SKU uniqueness          | Partial unique when not null                                                                       |
| Order vs catalog delete | RESTRICT; archive products instead                                                                 |
| Message idempotency     | Unique `idempotency_key` + unique `(channel_account_id, external_message_id)` where both set       |
| Draft vs sent           | `messages.delivery_status`, not Redis and not null `external_message_id`                           |
| Prompt immutability     | Partial unique active + version unique                                                             |
| One owner               | Service invariant in MVP                                                                           |
| One active assignee     | Partial unique assignment                                                                          |
| Verified phone link     | Partial unique identity phone                                                                      |
| Test data               | `is_test` excluded in rollup SQL                                                                   |
| Vector tenant filter    | Code review + bootstrap KNN test                                                                   |
| JSONB shape             | Zod in `packages/shared` named in §14.0; extra keys are a defect                                   |
| Stock races             | `FOR UPDATE` on the variant row inside a transaction (§6.5). Redis conversation lock is not enough |
| Cross-tenant child rows | Composite FK `(parent_id, business_id)` (§2.13)                                                    |
| `updated_at`            | Prisma `@updatedAt` only — no PG trigger                                                           |
| Decimal money           | `numeric(12,3)`; Prisma Decimal                                                                    |

---

## 16. Vector index (raw SQL migration)

After `CREATE EXTENSION vector;` (and `pgcrypto`, `citext`, `pg_trgm`):

```sql
CREATE INDEX embeddings_hnsw_cosine
  ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX embeddings_business_source
  ON embeddings (business_id, source_type);
```

Queries must still `WHERE business_id = $1`. `pg_trgm` is for product **name** fuzzy search, not embeddings.

HNSW vs IVFFlat: **HNSW** (OQ-55). Revisit only if NFR-PERF-06 (p95 < 250 ms at 5,000 chunks) fails after bootstrap.

---

## 17. Migrations

| Rule                       | Pin                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool                       | Prisma Migrate, forward-only (`11`, `18`)                                                                                                    |
| Production                 | Dedicated migrate task in the image. **Never** `prisma db push`. **Never** migrate-on-boot                                                   |
| Smoke-fail vs migrate-fail | `18` §12: roll ECS task definition back; do **not** reverse a completed migration                                                            |
| Extensions                 | First migration: `vector`, `citext`, `pgcrypto`, `pg_trgm`                                                                                   |
| Vector index               | SQL in the same or immediately following migration as `embeddings`                                                                           |
| Seeds                      | Separate `prisma/seed.ts`: system roles, permissions, plans, platform flags, platform default prompt templates copied per business on create |

---

## 18. Explicitly not in this schema (MVP)

| Not a table / column                                  | Why                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Knowledge-graph nodes/edges                           | Post-MVP; derivable later from these tables                                                |
| Payment-provider ids, checkout sessions               | Phase 4                                                                                    |
| `PROCESSING` / `SHIPPED` / `DELIVERED`                | FR-ORD-014                                                                                 |
| `product_events` / generic analytics SaaS             | KPIs + `usage_events` + `ai_usage`                                                         |
| BullMQ / Redis lock rows                              | Redis                                                                                      |
| Socket.IO session store                               | Redis adapter                                                                              |
| OAuth CSRF state                                      | Redis                                                                                      |
| Postgres DLQ table                                    | BullMQ DLQ (`11`)                                                                          |
| `outbox_events`                                       | MVP is in-process + enqueue (`10` OQ-42). Add only after a commit-without-enqueue incident |
| `conversations.order_id`                              | Canonical link is `orders.conversation_id`                                                 |
| Second `integrations` table beside `channel_accounts` | One row per connected surface                                                              |
| RLS as the only tenant control                        | App filter is mandatory                                                                    |
| UUIDv7                                                | OQ-43 = v4                                                                                 |
| Prisma 8 / `vector` as a native Prisma type           | Unsupported + raw SQL                                                                      |

---

## 19. Seeds (minimum)

On **platform** seed:

- Roles `owner`, `admin`, `employee` (`business_id` NULL)
- Permission codes from `13` §2.11 (includes `customers.erase`)
- `role_permissions` for those three
- Plans `starter`, `growth`
- Platform `feature_flags` defaults (§12.6)

On **business create** (FR-BIZ-003):

- Owner `business_members` row
- `business_onboarding` with `business_created = true`
- `ai_agents` + `ai_settings` (`reply_mode = approval_required`)
- Copy platform default `ai_prompts` (four types, `version = 1`, `active`)
- Starter `business_rules` for delivery, payment, returns — `enabled` but payload marked unconfirmed defaults until the owner saves (saving/acknowledging them sets `ai_configured` / G2)
- `subscriptions` → starter, `provider = manual`
- `feature_flags` business rows only if they differ from platform defaults (optional)

Compose demo tenant: same as create + a few variants with stock, for local playground.

---

## 20. How coding agents must use this

1. Do not add a table or column that is not in this file. PR the doc, then migrate.
2. Every new tenant table gets `business_id NOT NULL`, an FK, and a leading `(business_id, …)` index.
3. Do not `JOIN` another module’s tables. Call that module’s service (`10` §5).
4. Do not store price or stock on `products`.
5. Do not persist `available_stock`. Compute it with the SQL in §6.5.
6. Do not put internal notes on `messages`.
7. Do not log PII or tokens into `audit_logs.payload`, `ai_actions.input`, or `integration_events.headers`.
8. Playground rows are `is_test = true`. Rollup and billing SQL must filter them.
9. Vector queries: `business_id` in `WHERE`, `<=>`, Products repository only.
10. Changing `embedding` dimension or model id requires a reindex of all tenants, a `11` pin change, and a golden-set run.
11. Every JSONB write must parse the Zod export in §14.0. Do not `passthrough` extra keys. Do not add `conversations.order_id`.
12. Do not add `outbox_events` unless OQ-42 is reopened.
13. Reserve/commit/release stock only via `InventoryService` with `SELECT … FOR UPDATE` on the variant. Do not “fix” double-sell with Redis.
14. Same-module children: composite FK `(parent_id, business_id)`. Do not add a Postgres `updated_at` trigger.
15. Skip `customers.erased_at` on list/export/identity resolve. Do not `DELETE FROM customers` for NFR-SEC-10 (`17`).

---

## 21. Open questions

| #     | Question                     | Working answer                                                                                                         | Owner       | Revisit                            |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------- |
| OQ-40 | Prisma 7 + pgvector proven?  | Pin 7.x. Bootstrap gate in `11` §6.2 before CI freeze.                                                                 | Engineering | Repo bootstrap                     |
| OQ-43 | UUID v7 vs v4                | **v4**                                                                                                                 | Engineering | Schema export — decided            |
| OQ-54 | Enable Postgres RLS in prod? | **No in MVP** (`17` OQ-70). App `business_id` filter remains mandatory.                                                | Engineering | First Sev-1                        |
| OQ-55 | HNSW vs IVFFlat              | **HNSW** cosine (`<=>`).                                                                                               | Engineering | If NFR-PERF-06 misses at 5k chunks |
| OQ-56 | Draft/delivery on messages   | **`delivery_status` column** (`MessageDeliveryStatus`). Do not infer from null `external_message_id`. API in `13` §3.4 | Engineering | Decided                            |

---

## 22. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Database`, `# Product Database`, `# Customer Database`, `# Orders`, `# Business Rules Engine`, `# AI Agents`, `# Feature Flags`, `# Billing Architecture`
- `docs/10_engineering/10_ARCHITECTURE.md` §4 ownership
- `docs/10_engineering/11_TECH_STACK.md` §6
- `docs/10_engineering/13_API_DESIGN.md` (DTOs, permission codes, `delivery_status` usage)
- `docs/10_engineering/18_DEPLOYMENT.md` §14 meters
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` FR-CAT, FR-KNOW, FR-CUST, FR-ORD, FR-BILL, FR-FLAG, FR-AUD
- `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md` §6 `handoff_context`
