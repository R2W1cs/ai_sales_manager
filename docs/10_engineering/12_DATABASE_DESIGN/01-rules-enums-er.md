# 12 — Database Design

| Field           | Value                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `12_DATABASE_DESIGN`                                                                                                                     |
| Status          | Approved — canonical for tables, columns, types, constraints, indexes, and stored JSONB contracts                                        |
| Owner           | Engineering                                                                                                                              |
| Audience        | Backend, AI coding agents, anyone writing a migration                                                                                    |
| Depends on      | `10_ARCHITECTURE.md` (ownership), `11_TECH_STACK.md` (Prisma 7, pgvector, Decimal, UUIDv4), `01_PRODUCT_REQUIREMENTS.md`                 |
| Consumed by     | `13_API_DESIGN.md`, `14_SYSTEM_DESIGN.md`, `15_AI_ARCHITECTURE.md`, `17_SECURITY_DESIGN.md`, Prisma schema in `apps/api/prisma/`         |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Database`, `# Product Database`, `# Customer Database`, `# Orders`, plus AI/billing/flag tables |

---

## 1. Purpose and scope

This document is **canonical for what exists in PostgreSQL**. If a column is not here, it does not exist. Add it here first, then migrate.

**In scope:** tables, columns, types, nullability, defaults, foreign keys, unique/check constraints, indexes, tenancy rules, stored JSONB shapes that other modules read, vector storage, seed rows, migration rules.

**Out of scope, and where it lives instead:**

| Topic                                                          | Canonical location                |
| -------------------------------------------------------------- | --------------------------------- |
| Which module may `JOIN` which tables                           | `10_ARCHITECTURE.md` §4–5         |
| Prisma version, Decimal, UUID policy                           | `11_TECH_STACK.md` §6             |
| Endpoint DTOs                                                  | `13_API_DESIGN.md`                |
| State-machine transitions, jobs, locks, lead-score _weights_   | `14_SYSTEM_DESIGN.md`             |
| RAG query strategy, prompt assembly, tool Zod, extended traces | `15_AI_ARCHITECTURE.md`           |
| Token encryption, RBAC _enforcement_                           | `17_SECURITY_DESIGN.md`           |
| Meta HMAC, OAuth, adapter mapping                              | `16_INTEGRATION_DESIGN.md`        |
| RDS sizing, backups, migrate task                              | `18_DEPLOYMENT.md`                |
| `handoff_context` field semantics                              | `06_AI_HUMAN_HANDOFF_RULES.md` §6 |

Until remaining design/execution exports exist (`07`, `24`), the Brain Dump remains authoritative for those details. This file must not copy them. Operator UI tokens are `20_DESIGN_SYSTEM.md`. Brand and voice are `21_BRAND_STRATEGY.md`. Screen and inbox flows are `22_UX_FLOWS.md`. Component inventory is `23_UI_COMPONENTS.md`. Endpoint contracts are `13_API_DESIGN.md`. Runtime (jobs, locks, scoring) is `14_SYSTEM_DESIGN.md`. Orchestrator/RAG is `15_AI_ARCHITECTURE.md`. Meta adapters/HMAC are `16_INTEGRATION_DESIGN.md`. Auth/RBAC/secrets are `17_SECURITY_DESIGN.md`.

Prisma schema lives in **`apps/api/prisma/schema.prisma`**. Repositories wrap `PrismaClient` inside the owning module (`11` §6.2). Other modules never inject `PrismaService`.

---

## 2. Cross-cutting rules

### 2.1 Identity

| Rule                  | Pin                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary keys          | `uuid`, Prisma `@default(uuid())` — **UUIDv4** (OQ-43). Do not sort by id.                                                                                                                                                   |
| Foreign keys          | `uuid` matching the parent. Name `*_id`. Same-module children that copy `business_id` use a **composite FK** `(parent_id, business_id) → parent(id, business_id)` so a row cannot attach to another tenant’s parent (§2.13). |
| Natural ids from Meta | Stored in dedicated columns (`external_message_id`, `platform_user_id`, `page_id`, …), never as PKs.                                                                                                                         |

### 2.2 Tenancy (NFR-SEC-04, FR-BIZ-006)

| Rule                  | Pin                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant-scoped tables  | Carry `business_id uuid NOT NULL` → `businesses.id`.                                                                                                                                                                                                                      |
| Every tenant query    | `WHERE business_id = $current`. Missing filter is a **Sev-1** defect.                                                                                                                                                                                                     |
| Raw SQL / `$queryRaw` | Same `business_id` predicate, including every KNN query.                                                                                                                                                                                                                  |
| Index prefix          | Leading `(business_id, …)` on tenant tables unless the table _is_ `businesses`. Partial uniques (SKU, default variant, active assignee, …) are **raw SQL** in Prisma migrations, like the HNSW index.                                                                     |
| Soft-deleted tenants  | Default queries add `businesses.deleted_at IS NULL`. Jobs that must not process a deleted tenant check this before enqueue work.                                                                                                                                          |
| RLS                   | **Off** in MVP. Application scoping is mandatory. OQ-54 / OQ-70 (`17`)                                                                                                                                                                                                    |
| Global tables         | `users`, `refresh_tokens`, `password_reset_tokens`, `oauth_accounts`, `permissions`, `role_permissions`, `plans`, and `feature_flags` rows with `business_id IS NULL`. `roles` system rows (`business_id IS NULL`) are global. These still must not leak tenant payloads. |

A user belongs to **many** businesses via `business_members`. `users` has no `business_id`.

### 2.3 Time

Store `timestamptz`. Display and KPI windows use the **business timezone** (`luxon`, `11` §6.1).

| Column       | Who writes it                                      |
| ------------ | -------------------------------------------------- |
| `created_at` | Prisma `@default(now())`                           |
| `updated_at` | Prisma `@updatedAt` on every non-append-only table |

**Do not** add PostgreSQL `BEFORE UPDATE` triggers for `updated_at`. **Do not** add a second Nest interceptor / Prisma middleware that also sets it. One writer. Append-only tables (`messages`, `ai_actions`, `integration_events`, `audit_logs`, `usage_events`, `conversation_status_events`, `inventory_movements`, …) have `created_at` only.

### 2.4 Money

| Rule     | Pin                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Type     | `numeric(12, 3)` — TND millimes. Prisma `Decimal`. **Never** `float` / `double` / JS `number`.                          |
| Currency | ISO code `text`, default from `businesses.currency` (`TND`). Stored on orders and snapshots, not inferred at read time. |
| Display  | UI: `12 540 DT`. Not a DB concern.                                                                                      |

### 2.5 Soft delete, archive, merge

| Entity             | Mechanism                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business           | `deleted_at` + `delete_after` (now+30d). AI and channel processing stop immediately. Seats released **now** (OQ-10). Hard-purge job after `delete_after`.                                                                                                                  |
| Product            | `status = archived`. Block delete if any `order_items` reference it (FR-CAT-012).                                                                                                                                                                                          |
| Customer merge     | Loser `merged_into_customer_id` set; not deleted. Survivor keeps orders, notes, identities. Audited.                                                                                                                                                                       |
| Channel disconnect | `channel_accounts.status = disconnected`. History stays.                                                                                                                                                                                                                   |
| User removal       | `business_members.removed_at`. That business is no longer selectable; that user's **active assignments on this business** are released. **Do not** revoke the user's refresh tokens unless this was their last remaining membership — tokens are per user, not per tenant. |

No `ON DELETE CASCADE` from `businesses` in MVP (soft delete first). Child FKs are `ON DELETE RESTRICT`.

### 2.6 Playground / test data (BAC-10)

`conversations.source = playground` **and** `is_test = true` (also on any orders those turns create). KPI rollups, billing `usage_events`, and conversion denominators **exclude** `is_test`. Playground has no `channel_account_id` and never calls Meta.

### 2.7 Idempotency (NFR-REL-04)

| Surface                     | Key                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Inbound Meta message        | Unique `(messages.channel_account_id, messages.external_message_id)` where both not null         |
| Inbound playground / system | Unique `messages.idempotency_key` (globally unique string; include `conversation_id` in the key) |
| Order create                | Unique `(business_id, idempotency_key)`                                                          |
| Generic mutating POST       | `idempotency_keys` (§5.11)                                                                       |
| AI job                      | `{conversationId}:{inboundMessageId}` (Redis/BullMQ, not a table)                                |

### 2.8 Computed, not stored

| Value                 | Formula                                                                                                      | Where                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `available_stock`     | `product_variants.stock − SUM(stock_reservations.quantity)` where `status = active` and `expires_at > now()` | Products repository only                                                                                           |
| `ai_activation_ready` | Gates in `01` §14                                                                                            | Businesses **service** from `business_onboarding` + live catalog/channel checks. **Not** a column on `businesses`. |
| Lead temperature      | From `lead_score` vs `ai_settings` thresholds                                                                | Written onto `conversations.lead_temperature` by `score_lead`                                                      |

Do not persist `available_stock`. Do not persist activation as a denormalized boolean without the checklist columns.

### 2.12 Retention (hot vs archive)

Policy, not extra tables. Sweeper jobs live in `14` when exported. `is_test` rows follow the same clock.

| Table                              | Hot in Postgres                         | Then                                                                                                       |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `messages` + `message_attachments` | **Keep** for MVP (inbox is the product) | Revisit partition / cold storage when a tenant’s message query misses NFR inbox latency — not at bootstrap |
| `conversation_status_events`       | Keep (feeds nothing live; small)        | Same as messages                                                                                           |
| `integration_events`               | **30 days**                             | Delete (raw replay window). FR-AUD-004 does not require forever                                            |
| `ai_actions`                       | **90 days**                             | Archive to S3 or delete; traces/feedback remain                                                            |
| `ai_decision_traces`               | Keep while the conversation is retained | Delete with the conversation or 90 days, whichever is longer                                               |
| `ai_usage`                         | **90 days** raw                         | Forever in `usage_aggregates` / owner cost rollup. Do not keep raw tokens indefinitely                     |
| `ai_feedback` / `ai_evaluations`   | Keep                                    | Quality loop; no auto-delete in MVP                                                                        |
| `audit_logs`                       | **365 days**                            | Then S3 or delete; money/security trail                                                                    |
| `idempotency_keys`                 | **24 hours** (`expires_at`)             | Sweeper delete                                                                                             |
| `notifications`                    | **90 days** or 30 days after `read_at`  | Delete                                                                                                     |
| `usage_events`                     | Current period + 1                      | Aggregates are the long store                                                                              |
| `analytics_daily`                  | Keep                                    | KPI history; no fifth tile                                                                                 |

Do not add an `outbox_events` table in MVP (`10` OQ-42).

### 2.13 Composite tenant FKs

Denormalized `business_id` on a child is not enough. A FK on `product_id` alone still allows `product_variants.business_id` ≠ `products.business_id`.

**Same-module parent/child** (both have `business_id NOT NULL`):

1. Parent: `@@unique([id, business_id])` in addition to `id @id` (Prisma needs this to reference the pair).
2. Child: `@@foreignKey` / relation `fields: [parent_id, business_id], references: [id, business_id]`.
3. `ON DELETE RESTRICT` as in §2.5.

Apply at least to: `product_categories` (self `parent_id`), `product_variants` → `products`, `product_images` → `products` (and → `product_variants` when `variant_id` is set), `order_items` → `orders`, `customer_identities` / `customer_tags` / `customer_notes` → `customers`, `messages` / notes / assignments / status events → `conversations`, `stock_reservations` → `product_variants`, `knowledge_documents` is the parent of `embeddings` only via polymorphic `source_id` (**no FK**).

**Cross-module uuid pointers** (no Prisma relation): `stock_reservations.conversation_id` / `order_id`, `orders.conversation_id`. The owning service loads the target through the owner module and **rejects** if `business_id` differs. Tests must cover a swapped-tenant id.

Do not skip the composite FK “because Prisma is verbose.” That is the control AI-generated code will not invent.

### 2.9 Module ownership

Table → module is `10_ARCHITECTURE.md` §4.1. Repeated here as a lookup:

| Module        | Tables                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | `users`, `refresh_tokens`, `password_reset_tokens`, `oauth_accounts`                                                                                                            |
| Businesses    | `businesses`, `business_members`, `business_onboarding`, `roles`, `permissions`, `role_permissions`, `invitations`, `business_rules`, `feature_flags`, `plans`, `subscriptions` |
| Products      | `product_categories`, `products`, `product_variants`, `product_images`, `stock_reservations`, `inventory_movements`, `catalog_import_runs`, `knowledge_documents`, `embeddings` |
| Customers     | `customers`, `customer_identities`, `customer_tags`, `customer_notes`                                                                                                           |
| Conversations | `conversations`, `messages`, `message_attachments`, `conversation_notes`, `conversation_assignments`, `conversation_status_events`                                              |
| Orders        | `orders`, `order_items`                                                                                                                                                         |
| AI            | `ai_agents`, `ai_settings`, `ai_prompts`, `ai_actions`, `ai_decision_traces`, `ai_usage`, `ai_feedback`, `ai_evaluations`                                                       |
| Integrations  | `channel_accounts`, `message_templates`, `integration_events`                                                                                                                   |
| Analytics     | `usage_events`, `usage_aggregates`, `analytics_daily`                                                                                                                           |
| Notifications | `notifications`                                                                                                                                                                 |
| Platform      | `audit_logs`, `idempotency_keys`                                                                                                                                                |
| Realtime      | **no tables**                                                                                                                                                                   |

### 2.10 Prisma + pgvector

- `vector(1536)` is Prisma `Unsupported("vector(1536)")`.
- KNN (`ORDER BY embedding <=> $1::vector LIMIT k`) is **`$queryRaw` / TypedSQL in Products only** (`11` §6.2).
- Vector **index** is raw SQL in a Prisma migration, not a Prisma field attribute (§16).
- Bootstrap gate before CI freezes Prisma: migrate, generated client, Nest DI, tenant-scoped KNN, Decimal round-trip (OQ-40).

### 2.11 Naming

Tables and columns: `snake_case`. Prisma maps to the same names (`@@map` only if a clash appears). Enums: Prisma enum names `PascalCase`, values `SCREAMING_SNAKE` where the Brain Dump already uses that (`HUMAN_REQUIRED`, `PENDING_CONFIRMATION`); otherwise `snake_case` matching the dump (`instagram`, `hot`).

---

## 3. Enums

Closed sets. Adding a value is a migration + this file.

| Enum                    | Values                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemberRoleName`        | `owner` \| `admin` \| `employee` — values stored on `roles.name` (text). Merchant UI may label employee **Agent**. No fourth role. Do not add a second Prisma enum on `business_members`.                                                                                                      |
| `ProductStatus`         | `draft` \| `active` \| `archived`                                                                                                                                                                                                                                                              |
| `LifecycleStage`        | `unknown_visitor` \| `interested` \| `qualified_lead` \| `order_pending` \| `customer` \| `returning_customer` \| `vip`                                                                                                                                                                        |
| `ConversationStatus`    | `NEW` \| `AI_ACTIVE` \| `ORDER_INTENT_DETECTED` \| `HUMAN_REQUIRED` \| `HUMAN_HANDLING` \| `ORDER_CONFIRMED` \| `RESOLVED`                                                                                                                                                                     |
| `ConversationSource`    | `instagram` \| `messenger` \| `whatsapp` \| `playground`                                                                                                                                                                                                                                       |
| `HandoffPriority`       | `critical` \| `high` \| `normal`                                                                                                                                                                                                                                                               |
| `LeadTemperature`       | `hot` \| `warm` \| `cold`                                                                                                                                                                                                                                                                      |
| `MessageDirection`      | `inbound` \| `outbound`                                                                                                                                                                                                                                                                        |
| `SenderType`            | `customer` \| `ai` \| `human` \| `system`                                                                                                                                                                                                                                                      |
| `ContentType`           | `text` \| `image` \| `template` \| `system`                                                                                                                                                                                                                                                    |
| `MessageDeliveryStatus` | `draft` \| `queued` \| `sent` \| `delivered` \| `failed` — inbound received = `sent`. AI `approval_required` / `draft_only` insert = `draft`. Human/AI send = `queued` until Integrations, then `sent` or `failed`. `delivered` only if the provider returns a receipt; otherwise stay `sent`. |
| `OrderStatus`           | `PENDING_CONFIRMATION` \| `CONFIRMED` \| `CANCELLED` \| `COMPLETED`                                                                                                                                                                                                                            |
| `PaymentStatus`         | `NOT_COMPLETED` \| `COMPLETED`                                                                                                                                                                                                                                                                 |
| `ReservationStatus`     | `active` \| `committed` \| `released` \| `expired`                                                                                                                                                                                                                                             |
| `Channel`               | `instagram` \| `messenger` \| `whatsapp`                                                                                                                                                                                                                                                       |
| `ChannelAccountStatus`  | `pending` \| `pending_verification` \| `active` \| `error` \| `disconnected` — G3 (`01` §14) requires at least one `active` account. `connected` is not a value.                                                                                                                               |
| `ReplyMode`             | `auto_send` \| `approval_required` \| `draft_only`                                                                                                                                                                                                                                             |
| `PromptType`            | `system` \| `sales` \| `escalation` \| `handoff_summary`                                                                                                                                                                                                                                       |
| `EmbeddingSource`       | `knowledge_document` \| `product` \| `variant`                                                                                                                                                                                                                                                 |
| `IndexingStatus`        | `pending` \| `indexing` \| `ready` \| `failed`                                                                                                                                                                                                                                                 |
| `RuleType`              | `delivery` \| `payment` \| `returns` \| `working_hours` \| `discount` \| `min_order` \| `free_shipping`                                                                                                                                                                                        |
| `NotificationType`      | `HOT_LEAD` \| `ORDER_REQUEST` \| `HANDOFF` \| `ESCALATION`                                                                                                                                                                                                                                     |
| `FeedbackRating`        | `positive` \| `negative`                                                                                                                                                                                                                                                                       |
| `FeedbackReason`        | `wrong_product` \| `wrong_tone` \| `missing_information` \| `incorrect_policy` \| `hallucination` \| `other`                                                                                                                                                                                   |
| `EvaluatorType`         | `golden_set` \| `production_sample` \| `staff` \| `automated_grounding`                                                                                                                                                                                                                        |
| `SubscriptionStatus`    | `active` \| `cancelled` \| `past_due`                                                                                                                                                                                                                                                          |
| `UsageMetric`           | `messages_in` \| `messages_out_ai` \| `orders_created` \| `whatsapp_conversations_started`                                                                                                                                                                                                     |
| `ImportStatus`          | `uploaded` \| `validated` \| `previewed` \| `running` \| `succeeded` \| `failed`                                                                                                                                                                                                               |
| `AssignmentStatus`      | `active` \| `released`                                                                                                                                                                                                                                                                         |
| `AiActionType`          | `tool_call` \| `intent_classify` \| `handoff` \| `recommend` \| `rate_limited`                                                                                                                                                                                                                 |

`escalation_reason` is the closed set in `06_AI_HUMAN_HANDOFF_RULES.md` (fifteen triggers plus `ai_timeout` as a dedicated reason, not a sixteenth trigger). Store as `text`. Validate in Zod (`packages/shared`); **do not** duplicate the list as a Postgres CHECK that will drift from `06`.

Fulfilment statuses `PROCESSING` / `SHIPPED` / `DELIVERED` are **not** in MVP (FR-ORD-014).

---

## 4. ER (module view)

```mermaid
erDiagram
  businesses ||--o{ business_members : has
  users ||--o{ business_members : joins
  businesses ||--|| business_onboarding : checklist
  businesses ||--|| ai_agents : one
  businesses ||--|| ai_settings : one
  businesses ||--o{ products : owns
  products ||--o{ product_variants : has
  product_variants ||--o{ stock_reservations : reserved
  businesses ||--o{ customers : owns
  customers ||--o{ customer_identities : identities
  customers ||--o{ conversations : threads
  channel_accounts ||--o{ conversations : inbound
  conversations ||--o{ messages : transcript
  conversations ||--o{ orders : thread
  orders ||--o{ order_items : lines
  product_variants ||--o{ order_items : snapshot
  knowledge_documents ||--o{ embeddings : chunks
```

`embeddings.source_id` is polymorphic (`knowledge_document` \| `product` \| `variant`) — **no FK**. The mermaid edge is illustrative. Products repository deletes embedding rows when the source is archived/deleted.

Realtime has no entities. Knowledge-graph nodes/edges are **not** tables in MVP (§18).

---
