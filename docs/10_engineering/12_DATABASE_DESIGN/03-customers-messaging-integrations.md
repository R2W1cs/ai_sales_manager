## 7. Customers

### 7.1 `customers`

| Column                    | Type             | Null | Notes                                                                                                                                    |
| ------------------------- | ---------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | uuid             | PK   |                                                                                                                                          |
| `business_id`             | uuid             | NO   |                                                                                                                                          |
| `name`                    | text             | YES  |                                                                                                                                          |
| `phone`                   | text             | YES  | E.164 convenience copy of the best **verified** identity phone. Updated by `CustomerLifecycleService`; identities remain source of truth |
| `email`                   | citext           | YES  |                                                                                                                                          |
| `address`                 | jsonb            | YES  | `{ "line1", "city", "region", "postal_code", "country" }`                                                                                |
| `language`                | text             | YES  | `ar` \| `fr` \| `en`                                                                                                                     |
| `preferences`             | jsonb            | YES  | `CustomerPreferencesSchema` (§14). Staff + confirmed history, not unverified chat claims as gospel                                       |
| `lifecycle_stage`         | `LifecycleStage` | NO   | Default `unknown_visitor`. Written by `CustomerLifecycleService`                                                                         |
| `confirmed_order_count`   | integer          | NO   | Default 0. Helper, not LTV money                                                                                                         |
| `last_confirmed_order_at` | timestamptz      | YES  |                                                                                                                                          |
| `merged_into_customer_id` | uuid             | YES  | Self-FK. Loser row                                                                                                                       |
| `erased_at`               | timestamptz      | YES  | NFR-SEC-10. Set by `POST …/customers/:id/erase` (`17`). List/export/AI skip these rows                                                   |
| `is_test`                 | boolean          | NO   | Default false                                                                                                                            |
| `created_at`              | timestamptz      | NO   |                                                                                                                                          |
| `updated_at`              | timestamptz      | NO   |                                                                                                                                          |

Indexes: `(business_id, lifecycle_stage)`; `(business_id, phone)` where phone not null. **No** unique on unverified phone.

Queries for “the” customer skip rows where `merged_into_customer_id IS NOT NULL` **or** `erased_at IS NOT NULL`.

### 7.2 `customer_identities`

| Column             | Type        | Null | Notes                                 |
| ------------------ | ----------- | ---- | ------------------------------------- |
| `id`               | uuid        | PK   |                                       |
| `business_id`      | uuid        | NO   |                                       |
| `customer_id`      | uuid        | NO   |                                       |
| `platform`         | `Channel`   | NO   | Playground does not create identities |
| `platform_user_id` | text        | NO   | IG-scoped id, PSID, wa_id             |
| `phone_number`     | text        | YES  | E.164                                 |
| `verified_at`      | timestamptz | YES  | Confirmed, not claimed in chat        |
| `created_at`       | timestamptz | NO   |                                       |

Unique `(business_id, platform, platform_user_id)` — certain auto-match (FR-CUST-001).

Partial unique `(business_id, phone_number)` **where `verified_at IS NOT NULL` AND `phone_number IS NOT NULL`** — verified-phone auto-link (FR-CUST-011). Unverified phones never unique-constrain.

### 7.3 `customer_tags`

| Column               | Type        | Null | Notes                                                  |
| -------------------- | ----------- | ---- | ------------------------------------------------------ |
| `id`                 | uuid        | PK   |                                                        |
| `business_id`        | uuid        | NO   |                                                        |
| `customer_id`        | uuid        | NO   |                                                        |
| `tag`                | text        | NO   | `vip` is a tag **and** may set `lifecycle_stage = vip` |
| `created_at`         | timestamptz | NO   |                                                        |
| `created_by_user_id` | uuid        | YES  |                                                        |

Unique `(customer_id, tag)`.

### 7.4 `customer_notes`

Staff-only. Never sent to the channel.

| Column           | Type        | Null | Notes |
| ---------------- | ----------- | ---- | ----- |
| `id`             | uuid        | PK   |       |
| `business_id`    | uuid        | NO   |       |
| `customer_id`    | uuid        | NO   |       |
| `author_user_id` | uuid        | NO   |       |
| `body`           | text        | NO   |       |
| `created_at`     | timestamptz | NO   |       |

---

## 8. Integrations and messaging

### 8.1 `channel_accounts` (Integrations)

FR-INT-003. Credentials live in Secrets Manager; this row stores the **ref**.

| Column                    | Type                   | Null | Notes                                                                                                      |
| ------------------------- | ---------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `id`                      | uuid                   | PK   |                                                                                                            |
| `business_id`             | uuid                   | NO   |                                                                                                            |
| `channel`                 | `Channel`              | NO   |                                                                                                            |
| `external_account_id`     | text                   | NO   | Page id / IG user id / WABA id                                                                             |
| `page_id`                 | text                   | YES  | Messenger / IG                                                                                             |
| `ig_user_id`              | text                   | YES  |                                                                                                            |
| `waba_id`                 | text                   | YES  | Phase 2 columns exist in MVP                                                                               |
| `phone_number_id`         | text                   | YES  | Phase 2                                                                                                    |
| `display_name`            | text                   | YES  |                                                                                                            |
| `credentials_ref`         | text                   | YES  | Secrets Manager name/ARN. Null until `status = active`                                                     |
| `webhook_secret_ref`      | text                   | YES  | Unused in MVP — HMAC is app-level `META_APP_SECRET` (`16`). Do not store per-page webhook secrets          |
| `status`                  | `ChannelAccountStatus` | NO   |                                                                                                            |
| `verification_status`     | text                   | YES  | WhatsApp; pending never blocks IG/Messenger                                                                |
| `last_inbound_at`         | timestamptz            | YES  | FR-INT-005                                                                                                 |
| `last_error`              | text                   | YES  |                                                                                                            |
| `token_expires_at`        | timestamptz            | YES  | From OAuth `expires_in` when Meta sends it. **Null** = page token with no advertised expiry                |
| `last_token_check_at`     | timestamptz            | YES  | `check_channel_tokens` job (`16`)                                                                          |
| `authorized_meta_user_id` | text                   | YES  | Facebook user id of the installer (`GET /me` at connect). Matches deauthorize callback (`16`). Not a token |
| `connected_at`            | timestamptz            | YES  |                                                                                                            |
| `disconnected_at`         | timestamptz            | YES  |                                                                                                            |
| `created_at`              | timestamptz            | NO   |                                                                                                            |
| `updated_at`              | timestamptz            | NO   |                                                                                                            |

Unique `(business_id, channel, external_account_id)`. Index `(authorized_meta_user_id)` where not null (deauthorize lookup; not unique — one installer can own Messenger + Instagram). WhatsApp rows may exist with `feature_flags.whatsapp_enabled = false`; adapter is stub (`18`). `status = active` is the G3 gate — not `connected`.

No separate `integrations` table. OAuth CSRF state is **Redis**, TTL minutes, not Postgres.

### 8.2 `message_templates` (Integrations) — schema ships, unused until Phase 2

| Column               | Type        | Null | Notes                                 |
| -------------------- | ----------- | ---- | ------------------------------------- |
| `id`                 | uuid        | PK   |                                       |
| `business_id`        | uuid        | NO   |                                       |
| `channel_account_id` | uuid        | NO   | WhatsApp only                         |
| `name`               | text        | NO   | Meta name                             |
| `language`           | text        | NO   |                                       |
| `category`           | text        | NO   |                                       |
| `body_params`        | jsonb       | YES  |                                       |
| `meta_status`        | text        | NO   | `approved` \| `pending` \| `rejected` |
| `created_at`         | timestamptz | NO   |                                       |
| `updated_at`         | timestamptz | NO   |                                       |

Unique `(channel_account_id, name, language)`.

### 8.3 `integration_events` (Integrations)

Raw webhooks for replay (FR-AUD-004, FR-INT-008).

| Column               | Type        | Null | Notes                                                                                                                                  |
| -------------------- | ----------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | uuid        | PK   |                                                                                                                                        |
| `business_id`        | uuid        | YES  | Null when HMAC is valid but **no** `channel_account` yet (unknown page). **Not** used for invalid HMAC — those are not inserted (`16`) |
| `channel_account_id` | uuid        | YES  |                                                                                                                                        |
| `provider`           | text        | NO   | `meta`                                                                                                                                 |
| `external_event_id`  | text        | YES  |                                                                                                                                        |
| `payload`            | jsonb       | NO   | Raw body                                                                                                                               |
| `headers`            | jsonb       | YES  | No secrets                                                                                                                             |
| `signature_valid`    | boolean     | NO   |                                                                                                                                        |
| `processed_at`       | timestamptz | YES  |                                                                                                                                        |
| `created_at`         | timestamptz | NO   |                                                                                                                                        |

Indexes: `(created_at)`; unique `(provider, channel_account_id, external_event_id)` **where `channel_account_id IS NOT NULL` and `external_event_id IS NOT NULL`**; unique `(provider, external_event_id)` **where `channel_account_id IS NULL` and `external_event_id IS NOT NULL`** (unknown-page rows). Duplicate Meta deliveries after tenant resolve hit the first unique. Retention: hot 30 days (§2.12). Insert is idempotent (`ON CONFLICT DO NOTHING`). Invalid HMAC is **not** a row (`16`). HTTP **200 only after** enqueue of `retry_webhook_processing` when a worker must map (`14` §4). Unknown-page rows set `processed_at` on insert. `processed_at` is set when map + message persist + AI/score enqueue finish (or immediately if there is nothing to map). Null rows older than 30s are swept. This table is the webhook inbox — still no `outbox_events`.

### 8.4 `conversations` (Conversations)

| Column                       | Type                 | Null | Notes                                                      |
| ---------------------------- | -------------------- | ---- | ---------------------------------------------------------- |
| `id`                         | uuid                 | PK   |                                                            |
| `business_id`                | uuid                 | NO   |                                                            |
| `customer_id`                | uuid                 | NO   |                                                            |
| `channel_account_id`         | uuid                 | YES  | Null for playground                                        |
| `source`                     | `ConversationSource` | NO   |                                                            |
| `external_thread_id`         | text                 | YES  | Provider thread id                                         |
| `status`                     | `ConversationStatus` | NO   | Default `NEW`                                              |
| `ai_enabled`                 | boolean              | NO   | Default true; false on handoff                             |
| `assigned_user_id`           | uuid                 | YES  |                                                            |
| `last_intent`                | text                 | YES  |                                                            |
| `escalation_reason`          | text                 | YES  |                                                            |
| `handoff_priority`           | `HandoffPriority`    | YES  |                                                            |
| `handoff_context`            | jsonb                | YES  | Canonical shape: `06` §6.1                                 |
| `handoff_at`                 | timestamptz          | YES  | Entered `HUMAN_REQUIRED`                                   |
| `handoff_completed_at`       | timestamptz          | YES  | First human open/takeover (FR-HAND-006)                    |
| `summary`                    | text                 | YES  | FR-CONV-019                                                |
| `collected_fields`           | jsonb                | YES  | `CollectedFieldsSchema` (§14)                              |
| `snoozed_until`              | timestamptz          | YES  | Could (FR-CONV-018)                                        |
| `lead_score`                 | integer              | NO   | 0–100, default 0. CHECK                                    |
| `lead_temperature`           | `LeadTemperature`    | NO   | Default `cold`                                             |
| `lead_score_factors`         | jsonb                | YES  | `{ "signal": points, ... }` — weights live in `14`         |
| `lead_scored_at`             | timestamptz          | YES  |                                                            |
| `last_message_at`            | timestamptz          | YES  | Inbox sort / auto-close                                    |
| `last_message_preview`       | text                 | YES  | List row                                                   |
| `staff_read_at`              | timestamptz          | YES  | Null = unread by staff. Do not use an inverted `unread_at` |
| `is_test`                    | boolean              | NO   | Default false                                              |
| `whatsapp_window_expires_at` | timestamptz          | YES  | Phase 2; unused in MVP                                     |
| `created_at`                 | timestamptz          | NO   |                                                            |
| `updated_at`                 | timestamptz          | NO   |                                                            |

Indexes (inbox is the hot read):

- `(business_id, status, handoff_priority, handoff_at)` **where `status IN ('HUMAN_REQUIRED','HUMAN_HANDLING')`** — human-needed first (FR-CONV-003)
- `(business_id, assigned_user_id, status)`
- `(business_id, lead_temperature, lead_score DESC)`
- `(business_id, customer_id)`
- unique `(channel_account_id, external_thread_id)` where both not null

**No `conversations.order_id`.** Canonical link is `orders.conversation_id` (Orders module). Inbox “open order” is `OrderService` / `orders` where `conversation_id = $id AND status = 'PENDING_CONFIRMATION'` (index already on `(business_id, conversation_id)`). A thread may have many orders over time; the conversation row is not a second source of truth. Conversations learns `ORDER_CONFIRMED` from the `order.confirmed` event (`10` §5.3), not by writing an order uuid.

`(business_id, last_message_at DESC)` is **not** in the first migration. Add it only if a recency query exists and EXPLAIN says it needs it. Default inbox sort is status / priority / `handoff_at`.

Should (FR-CONV-006): `pg_trgm` on `customers.name` / `customers.phone` plus `messages.content` — add when that story ships; not required to migrate on day one.

### 8.5 `conversation_status_events` (Conversations)

Append-only transition log for Conversations. **Not** the KPI source of truth — `analytics_daily` is (FR-ANL-003). The rollup job consumes `conversation.state_changed` events (or a Conversations query in that module that writes a usage/analytics DTO). Analytics must not `JOIN` this table from another module.

| Column              | Type                 | Null | Notes                                                    |
| ------------------- | -------------------- | ---- | -------------------------------------------------------- |
| `id`                | uuid                 | PK   |                                                          |
| `business_id`       | uuid                 | NO   |                                                          |
| `conversation_id`   | uuid                 | NO   |                                                          |
| `from_status`       | `ConversationStatus` | YES  | Null on create                                           |
| `to_status`         | `ConversationStatus` | NO   |                                                          |
| `escalation_reason` | text                 | YES  |                                                          |
| `actor_type`        | text                 | NO   | `system` \| `ai` \| `user`                               |
| `actor_user_id`     | uuid                 | YES  |                                                          |
| `is_test`           | boolean              | NO   | Copied from the conversation at write. Rollups skip true |
| `created_at`        | timestamptz          | NO   |                                                          |

Indexes: `(business_id, created_at)`; `(conversation_id, created_at)`; `(business_id, to_status, created_at)` where `to_status = HUMAN_REQUIRED`.

### 8.6 `messages` (Conversations)

| Column                | Type                    | Null | Notes                                                                                                                |
| --------------------- | ----------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid                    | PK   |                                                                                                                      |
| `business_id`         | uuid                    | NO   |                                                                                                                      |
| `conversation_id`     | uuid                    | NO   |                                                                                                                      |
| `channel_account_id`  | uuid                    | YES  | Denormalized from the conversation. Null on playground. Needed for Meta idempotency                                  |
| `direction`           | `MessageDirection`      | NO   |                                                                                                                      |
| `sender_type`         | `SenderType`            | NO   |                                                                                                                      |
| `sender_user_id`      | uuid                    | YES  | Human staff                                                                                                          |
| `content`             | text                    | YES  |                                                                                                                      |
| `content_type`        | `ContentType`           | NO   | Default `text`                                                                                                       |
| `external_message_id` | text                    | YES  |                                                                                                                      |
| `idempotency_key`     | text                    | NO   | Unique                                                                                                               |
| `ai_metadata`         | jsonb                   | YES  | §14.2. Required on AI outbound (FR-AI-025)                                                                           |
| `delivery_status`     | `MessageDeliveryStatus` | NO   | FR-AI-012, FR-CONV-038. API: `13` §3.4. Do not infer draft from null `external_message_id` (playground is also null) |
| `created_at`          | timestamptz             | NO   |                                                                                                                      |

Indexes: `(conversation_id, created_at)` — pagination; `(business_id, created_at)`; unique `idempotency_key`; unique `(channel_account_id, external_message_id)` **where both are NOT NULL**; `(conversation_id)` where `delivery_status = 'draft'` (FR-AI-015 queue).

Do not put internal notes here (leak risk). Use `conversation_notes`. Do not invent a third unique on `external_message_id` alone.

### 8.7 `message_attachments`

FR-INT-013. MVP AI does not interpret images.

| Column         | Type        | Null | Notes |
| -------------- | ----------- | ---- | ----- |
| `id`           | uuid        | PK   |       |
| `business_id`  | uuid        | NO   |       |
| `message_id`   | uuid        | NO   |       |
| `s3_key`       | text        | NO   |       |
| `content_type` | text        | NO   |       |
| `size_bytes`   | integer     | YES  |       |
| `sort_order`   | integer     | NO   |       |
| `created_at`   | timestamptz | NO   |       |

Unique `(message_id, sort_order)`. `fetch_inbound_media` retries must not duplicate (`16`).

### 8.8 `conversation_notes` (Conversations)

FR-CONV-015. Staff-only, never outbound.

| Column            | Type        | Null | Notes |
| ----------------- | ----------- | ---- | ----- |
| `id`              | uuid        | PK   |       |
| `business_id`     | uuid        | NO   |       |
| `conversation_id` | uuid        | NO   |       |
| `author_user_id`  | uuid        | NO   |       |
| `body`            | text        | NO   |       |
| `created_at`      | timestamptz | NO   |       |

### 8.9 `conversation_assignments` (Conversations)

FR-CONV-014. History, not only current `assigned_user_id`.

| Column                | Type               | Null | Notes |
| --------------------- | ------------------ | ---- | ----- |
| `id`                  | uuid               | PK   |       |
| `business_id`         | uuid               | NO   |       |
| `conversation_id`     | uuid               | NO   |       |
| `user_id`             | uuid               | NO   |       |
| `assigned_by_user_id` | uuid               | NO   |       |
| `status`              | `AssignmentStatus` | NO   |       |
| `assigned_at`         | timestamptz        | NO   |       |
| `released_at`         | timestamptz        | YES  |       |

Partial unique `(conversation_id)` where `status = active` — one active assignee.

---
