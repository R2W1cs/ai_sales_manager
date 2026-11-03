## 12. Billing, flags, analytics

### 12.1 `plans` (Businesses) — global

| Column       | Type        | Null | Notes                         |
| ------------ | ----------- | ---- | ----------------------------- |
| `id`         | uuid        | PK   |                               |
| `code`       | text        | NO   | Unique. `starter` \| `growth` |
| `name`       | text        | NO   |                               |
| `limits`     | jsonb       | NO   | §14.4                         |
| `created_at` | timestamptz | NO   |                               |
| `updated_at` | timestamptz | NO   |                               |

### 12.2 `subscriptions`

| Column         | Type                 | Null | Notes                  |
| -------------- | -------------------- | ---- | ---------------------- |
| `id`           | uuid                 | PK   |                        |
| `business_id`  | uuid                 | NO   | Unique — one current   |
| `plan_id`      | uuid                 | NO   |                        |
| `status`       | `SubscriptionStatus` | NO   | MVP: `active`, manual  |
| `period_start` | timestamptz          | NO   |                        |
| `period_end`   | timestamptz          | NO   |                        |
| `provider`     | text                 | NO   | `manual` until Phase 4 |
| `provider_ref` | text                 | YES  | Future Stripe id       |
| `created_at`   | timestamptz          | NO   |                        |
| `updated_at`   | timestamptz          | NO   |                        |

### 12.3 `usage_events` (Analytics) — append-only

FR-BILL-003. Do **not** duplicate token rows here; tokens live in `ai_usage` (`18` §14).

| Column          | Type          | Null | Notes                            |
| --------------- | ------------- | ---- | -------------------------------- |
| `id`            | uuid          | PK   |                                  |
| `business_id`   | uuid          | NO   |                                  |
| `metric`        | `UsageMetric` | NO   |                                  |
| `quantity`      | integer       | NO   |                                  |
| `period_bucket` | date          | NO   | Business-TZ date                 |
| `is_test`       | boolean       | NO   | Default false. Rollups skip true |
| `recorded_at`   | timestamptz   | NO   |                                  |

Indexes: `(business_id, metric, recorded_at)`.

### 12.4 `usage_aggregates`

FR-BILL-004. Written by `sync_usage_aggregates`.

| Column         | Type          | Null | Notes |
| -------------- | ------------- | ---- | ----- |
| `id`           | uuid          | PK   |       |
| `business_id`  | uuid          | NO   |       |
| `period_start` | timestamptz   | NO   |       |
| `period_end`   | timestamptz   | NO   |       |
| `metric`       | `UsageMetric` | NO   |       |
| `quantity`     | integer       | NO   |       |
| `updated_at`   | timestamptz   | NO   |       |

Unique `(business_id, period_start, metric)`.

### 12.5 `analytics_daily` (Analytics)

FR-ANL-003. Four merchant KPIs, not live scans. Definitions are **`01` §15** — this table only stores the rolled numbers. Exclude `is_test`.

| Column                  | Type        | Null | Notes                                                                                                          |
| ----------------------- | ----------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| `business_id`           | uuid        | NO   |                                                                                                                |
| `day`                   | date        | NO   | Business TZ                                                                                                    |
| `messages_handled`      | integer     | NO   |                                                                                                                |
| `messages_ai`           | integer     | NO   | Breakdown, not a fifth tile                                                                                    |
| `messages_human`        | integer     | NO   |                                                                                                                |
| `orders_created`        | integer     | NO   |                                                                                                                |
| `handoffs_total`        | integer     | NO   |                                                                                                                |
| `handoffs_by_reason`    | jsonb       | NO   | `{ "purchase_handoff": n, ... }` — FR-ANL-002                                                                  |
| `conversion_confirmed`  | integer     | NO   | Numerator: AI-created orders that reached `CONFIRMED` (`01` §15)                                               |
| `conversion_ai_pending` | integer     | NO   | Denominator: AI-created orders that entered `PENDING_CONFIRMATION` in the period. **Not** “qualified handoffs” |
| `updated_at`            | timestamptz | NO   |                                                                                                                |

PK `(business_id, day)`. Job: `rollup_daily`.

### 12.6 `feature_flags`

FR-FLAG-001–002. Per-business rows **and** platform defaults.

| Column        | Type        | Null | Notes                              |
| ------------- | ----------- | ---- | ---------------------------------- |
| `id`          | uuid        | PK   |                                    |
| `business_id` | uuid        | YES  | Null = platform default / override |
| `feature`     | text        | NO   |                                    |
| `enabled`     | boolean     | NO   |                                    |
| `created_at`  | timestamptz | NO   |                                    |
| `updated_at`  | timestamptz | NO   |                                    |

Unique `(business_id, feature)` where `business_id IS NOT NULL`. Unique `(feature)` where `business_id IS NULL`.

MVP keys (defaults): `whatsapp_enabled=false`, `voice_agent=false`, `advanced_analytics=false`, `vip_auto_handoff=false`, `ai_shadow_mode=false`.

Resolution: platform row default, then business row overrides. Check in integrations UI, orchestrator, billing — not only the client.

---

## 13. Notifications and audit

### 13.1 `notifications`

| Column             | Type               | Null | Notes                               |
| ------------------ | ------------------ | ---- | ----------------------------------- |
| `id`               | uuid               | PK   |                                     |
| `business_id`      | uuid               | NO   |                                     |
| `user_id`          | uuid               | NO   |                                     |
| `type`             | `NotificationType` | NO   | Four situations only (FR-NOTIF-010) |
| `handoff_priority` | `HandoffPriority`  | YES  |                                     |
| `title`            | text               | NO   |                                     |
| `message`          | text               | NO   |                                     |
| `entity_type`      | text               | NO   | `conversation` \| `order`           |
| `entity_id`        | uuid               | NO   |                                     |
| `dedupe_key`       | text               | NO   | FR-NOTIF-012                        |
| `read_at`          | timestamptz        | YES  |                                     |
| `created_at`       | timestamptz        | NO   |                                     |

Unique `(user_id, dedupe_key)`. Application sets `dedupe_key = {type}:{entity_id}:{yyyy-mm-ddTHH}` (hour bucket) or a collapsed hot-lead key (FR-NOTIF-013).

Indexes: `(user_id, read_at, handoff_priority, created_at DESC)`.

Email/SMS/push columns: **not in MVP** (FR-NOTIF-007).

### 13.2 `audit_logs`

Human/security/money actions (FR-AUD-001). Not AI tool traces.

| Column          | Type        | Null | Notes                                                   |
| --------------- | ----------- | ---- | ------------------------------------------------------- |
| `id`            | uuid        | PK   |                                                         |
| `business_id`   | uuid        | NO   |                                                         |
| `actor_user_id` | uuid        | YES  | Null = system                                           |
| `action`        | text        | NO   | e.g. `customer.merge`, `member.remove`, `order.confirm` |
| `entity_type`   | text        | NO   |                                                         |
| `entity_id`     | uuid        | NO   |                                                         |
| `payload`       | jsonb       | YES  | No secrets, no full webhook bodies                      |
| `created_at`    | timestamptz | NO   |                                                         |

Indexes: `(business_id, created_at)`; `(business_id, entity_type, entity_id)`.

---
