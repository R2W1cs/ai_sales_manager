## 9. Orders

### 9.1 `orders`

| Column               | Type            | Null | Notes                                                                 |
| -------------------- | --------------- | ---- | --------------------------------------------------------------------- |
| `id`                 | uuid            | PK   |                                                                       |
| `business_id`        | uuid            | NO   |                                                                       |
| `customer_id`        | uuid            | NO   |                                                                       |
| `conversation_id`    | uuid            | YES  | Pointer, **no Prisma relation**. Null if staff-created with no thread |
| `status`             | `OrderStatus`   | NO   |                                                                       |
| `payment_status`     | `PaymentStatus` | NO   | Default `NOT_COMPLETED`                                               |
| `currency`           | text            | NO   |                                                                       |
| `subtotal`           | numeric(12,3)   | NO   |                                                                       |
| `delivery_fee`       | numeric(12,3)   | NO   | From `business_rules`, snapshotted                                    |
| `total`              | numeric(12,3)   | NO   |                                                                       |
| `customer_snapshot`  | jsonb           | NO   | `{ name, phone, address }` at create (FR-ORD-002)                     |
| `delivery_address`   | jsonb           | YES  |                                                                       |
| `created_by_type`    | text            | NO   | `ai` \| `user`                                                        |
| `created_by_user_id` | uuid            | YES  |                                                                       |
| `idempotency_key`    | text            | NO   |                                                                       |
| `is_test`            | boolean         | NO   | Default false                                                         |
| `order_confirmed_at` | timestamptz     | YES  | FR-ORD-005                                                            |
| `cancelled_at`       | timestamptz     | YES  |                                                                       |
| `completed_at`       | timestamptz     | YES  | Manual in MVP                                                         |
| `created_at`         | timestamptz     | NO   |                                                                       |
| `updated_at`         | timestamptz     | NO   |                                                                       |

Unique `(business_id, idempotency_key)`. Indexes: `(business_id, status, created_at)`; `(business_id, conversation_id)`.

No payment-provider columns in MVP (FR-ORD-013).

### 9.2 `order_items`

| Column                | Type          | Null | Notes                              |
| --------------------- | ------------- | ---- | ---------------------------------- |
| `id`                  | uuid          | PK   |                                    |
| `business_id`         | uuid          | NO   |                                    |
| `order_id`            | uuid          | NO   |                                    |
| `variant_id`          | uuid          | NO   | RESTRICT delete of variant/product |
| `quantity`            | integer       | NO   | `> 0`                              |
| `unit_price`          | numeric(12,3) | NO   | Snapshot                           |
| `name_snapshot`       | text          | NO   |                                    |
| `sku_snapshot`        | text          | YES  |                                    |
| `attributes_snapshot` | jsonb         | YES  |                                    |
| `created_at`          | timestamptz   | NO   |                                    |

---

## 10. Knowledge and embeddings (Products)

### 10.1 `knowledge_documents`

FR-KNOW-011–014. Unstructured FAQs/policies. Structured delivery/payment/returns stay in `business_rules`.

| Column            | Type             | Null | Notes                                    |
| ----------------- | ---------------- | ---- | ---------------------------------------- |
| `id`              | uuid             | PK   |                                          |
| `business_id`     | uuid             | NO   |                                          |
| `title`           | text             | NO   |                                          |
| `source_type`     | text             | NO   | `faq` \| `policy` \| `brand` \| `other`  |
| `raw_text`        | text             | NO   |                                          |
| `content_hash`    | text             | NO   | Skip re-embed if unchanged (FR-KNOW-013) |
| `indexing_status` | `IndexingStatus` | NO   |                                          |
| `created_at`      | timestamptz      | NO   |                                          |
| `updated_at`      | timestamptz      | NO   |                                          |

PDF/DOCX upload is Could (FR-KNOW-015) — no extra columns until then (`s3_key` nullable later).

### 10.2 `embeddings`

One table for knowledge chunks **and** catalog (product/variant) vectors. Dimension **1536** = `text-embedding-3-small` (`11` §9). Changing model is a full reindex, not a column toggle.

| Column         | Type              | Null | Notes                           |
| -------------- | ----------------- | ---- | ------------------------------- |
| `id`           | uuid              | PK   |                                 |
| `business_id`  | uuid              | NO   | **Required on every KNN**       |
| `source_type`  | `EmbeddingSource` | NO   |                                 |
| `source_id`    | uuid              | NO   | Document / product / variant id |
| `chunk_index`  | integer           | NO   | 0 for a single product blob     |
| `chunk_text`   | text              | NO   | Retrieved into the prompt       |
| `content_hash` | text              | NO   |                                 |
| `embedding`    | `vector(1536)`    | NO   |                                 |
| `created_at`   | timestamptz       | NO   |                                 |

Unique `(business_id, source_type, source_id, chunk_index)`. **No FK** on `source_id`. Deleting/archiving a product, variant, or document must delete matching embedding rows in the same module.

Indexes: btree `(business_id, source_type)`; HNSW on `embedding` `vector_cosine_ops` (§16). Operator in queries: `<=>` (cosine), matching `11`.

---

## 11. AI config and observability (AI)

### 11.1 `ai_agents` — one per business in MVP

| Column                 | Type         | Null | Notes                                                                                                                                                                   |
| ---------------------- | ------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | uuid         | PK   |                                                                                                                                                                         |
| `business_id`          | uuid         | NO   | Unique                                                                                                                                                                  |
| `name`                 | text         | NO   |                                                                                                                                                                         |
| `personality`          | text         | YES  |                                                                                                                                                                         |
| `language`             | text         | NO   | Customer-facing default `ar`. Independent of `businesses.default_language` (merchant UI). Seed from the owner's choice at onboarding, not hard-coded if they pick `fr`. |
| `tone`                 | text         | YES  |                                                                                                                                                                         |
| `sales_strategy`       | jsonb        | YES  | `SalesStrategySchema` (§14)                                                                                                                                             |
| `greeting_template`    | text         | YES  |                                                                                                                                                                         |
| `fallback_template`    | text         | YES  |                                                                                                                                                                         |
| `confidence_threshold` | numeric(3,2) | NO   | Default `0.65`                                                                                                                                                          |
| `enabled`              | boolean      | NO   |                                                                                                                                                                         |
| `created_at`           | timestamptz  | NO   |                                                                                                                                                                         |
| `updated_at`           | timestamptz  | NO   |                                                                                                                                                                         |

### 11.2 `ai_settings` — 1:1 `business_id` PK

| Column                              | Type          | Null | Notes                                                  |
| ----------------------------------- | ------------- | ---- | ------------------------------------------------------ |
| `business_id`                       | uuid          | PK   |                                                        |
| `model_primary`                     | text          | NO   | Must be a pin in `11` §9.3. Default `gemini-3.5-flash` |
| `model_fallback`                    | text          | NO   | Default `gpt-5.6-terra`                                |
| `max_tokens`                        | integer       | NO   |                                                        |
| `temperature`                       | numeric(2,1)  | NO   |                                                        |
| `rag_top_k`                         | integer       | NO   |                                                        |
| `include_product_images_in_context` | boolean       | NO   | Default false                                          |
| `blocked_topics`                    | text[]        | NO   | Default `{}`                                           |
| `custom_system_append`              | text          | YES  |                                                        |
| `reply_mode`                        | `ReplyMode`   | NO   | New business: `approval_required`                      |
| `lead_hot_min`                      | integer       | NO   | Default 80                                             |
| `lead_warm_min`                     | integer       | NO   | Default 50                                             |
| `reservation_ttl_minutes`           | integer       | NO   | Default 30                                             |
| `inactivity_close_days`             | integer       | NO   | Default 30                                             |
| `monthly_ai_budget_usd`             | numeric(12,3) | YES  | Owner cap; with plan limits                            |
| `created_at`                        | timestamptz   | NO   |                                                        |
| `updated_at`                        | timestamptz   | NO   |                                                        |

Second fallback (`claude-sonnet-5`) is a **platform constant** in the orchestrator, not a column. The API must not set `model_primary` / `model_fallback` to an unpinned id.

### 11.3 `ai_prompts`

Never update `content` in place. Insert version N+1, flip `active` (FR-AI-026).

| Column               | Type         | Null | Notes                               |
| -------------------- | ------------ | ---- | ----------------------------------- |
| `id`                 | uuid         | PK   |                                     |
| `business_id`        | uuid         | NO   |                                     |
| `type`               | `PromptType` | NO   |                                     |
| `content`            | text         | NO   |                                     |
| `version`            | integer      | NO   | Monotonic per `(business_id, type)` |
| `active`             | boolean      | NO   |                                     |
| `created_at`         | timestamptz  | NO   |                                     |
| `created_by_user_id` | uuid         | YES  | Null = platform seed                |

Partial unique `(business_id, type)` where `active`. Unique `(business_id, type, version)`.

### 11.4 `ai_actions`

What the AI did. Not `audit_logs` (FR-AUD-003). Retention: 90 days hot; archive later.

| Column            | Type           | Null | Notes                         |
| ----------------- | -------------- | ---- | ----------------------------- |
| `id`              | uuid           | PK   |                               |
| `business_id`     | uuid           | NO   |                               |
| `conversation_id` | uuid           | NO   |                               |
| `message_id`      | uuid           | YES  |                               |
| `action_type`     | `AiActionType` | NO   |                               |
| `tool_name`       | text           | YES  |                               |
| `input`           | jsonb          | YES  | No raw secrets / card numbers |
| `output`          | jsonb          | YES  |                               |
| `success`         | boolean        | NO   |                               |
| `error_message`   | text           | YES  |                               |
| `duration_ms`     | integer        | YES  |                               |
| `created_at`      | timestamptz    | NO   |                               |

Indexes: `(business_id, created_at)`; `(conversation_id, created_at)`.

### 11.5 `ai_decision_traces`

Why. Staff: “Why did AI transfer this?” Employees see briefing, not this row (FR-OBS-003).

| Column                | Type        | Null | Notes                    |
| --------------------- | ----------- | ---- | ------------------------ |
| `id`                  | uuid        | PK   |                          |
| `business_id`         | uuid        | NO   |                          |
| `conversation_id`     | uuid        | NO   |                          |
| `inbound_message_id`  | uuid        | NO   |                          |
| `outbound_message_id` | uuid        | YES  |                          |
| `decision_trace`      | jsonb       | NO   | §14.3; full keys in `15` |
| `created_at`          | timestamptz | NO   |                          |

Indexes: `(conversation_id, created_at)`.

### 11.6 `ai_usage`

Every LLM call including suggestions (NFR-COST-01, FR-BILL-010).

| Column               | Type          | Null | Notes                               |
| -------------------- | ------------- | ---- | ----------------------------------- |
| `id`                 | uuid          | PK   |                                     |
| `business_id`        | uuid          | NO   |                                     |
| `conversation_id`    | uuid          | YES  |                                     |
| `message_id`         | uuid          | YES  |                                     |
| `provider`           | text          | NO   | `google` \| `openai` \| `anthropic` |
| `model`              | text          | NO   | Exact id                            |
| `tokens_input`       | integer       | NO   |                                     |
| `tokens_output`      | integer       | NO   |                                     |
| `estimated_cost_usd` | numeric(12,6) | NO   | USD, not TND                        |
| `prompt_version_id`  | uuid          | YES  |                                     |
| `created_at`         | timestamptz   | NO   |                                     |

Indexes: `(business_id, created_at)`; `(business_id, model, created_at)`.

### 11.7 `ai_feedback`

Thumbs on a **message**.

| Column        | Type             | Null | Notes                                          |
| ------------- | ---------------- | ---- | ---------------------------------------------- |
| `id`          | uuid             | PK   |                                                |
| `business_id` | uuid             | NO   |                                                |
| `message_id`  | uuid             | NO   | Unique per staff user: `(message_id, user_id)` |
| `user_id`     | uuid             | NO   |                                                |
| `rating`      | `FeedbackRating` | NO   |                                                |
| `reason`      | `FeedbackReason` | YES  | Required if negative                           |
| `comment`     | text             | YES  |                                                |
| `created_at`  | timestamptz      | NO   |                                                |

### 11.8 `ai_evaluations`

Per **conversation** (FR-AI-032). Distinct from feedback.

| Column             | Type            | Null | Notes                                                           |
| ------------------ | --------------- | ---- | --------------------------------------------------------------- |
| `id`               | uuid            | PK   |                                                                 |
| `business_id`      | uuid            | NO   |                                                                 |
| `conversation_id`  | uuid            | NO   |                                                                 |
| `score`            | integer         | YES  | 0–100 overall                                                   |
| `dimension_scores` | jsonb           | YES  | correctness, grounding, language, tools, escalation, conversion |
| `failure_reason`   | text            | YES  |                                                                 |
| `evaluator_type`   | `EvaluatorType` | NO   |                                                                 |
| `created_at`       | timestamptz     | NO   |                                                                 |

---
