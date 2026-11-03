## 5. Identity and workspace

### 5.1 `users` (Auth) — global

| Column              | Type        | Null | Notes                                   |
| ------------------- | ----------- | ---- | --------------------------------------- |
| `id`                | uuid        | PK   |                                         |
| `email`             | citext      | NO   | Unique. Case-insensitive (FR-AUTH-010). |
| `password_hash`     | text        | YES  | argon2. Null if Google-only (Should).   |
| `name`              | text        | NO   |                                         |
| `email_verified_at` | timestamptz | YES  |                                         |
| `last_login_at`     | timestamptz | YES  |                                         |
| `created_at`        | timestamptz | NO   |                                         |
| `updated_at`        | timestamptz | NO   |                                         |

Indexes: unique `email`.

### 5.2 `refresh_tokens` (Auth) — global

Rotation + reuse detection.

| Column       | Type        | Null | Notes                        |
| ------------ | ----------- | ---- | ---------------------------- |
| `id`         | uuid        | PK   |                              |
| `user_id`    | uuid        | NO   | → `users`                    |
| `token_hash` | text        | NO   | Unique. Store hash only.     |
| `family_id`  | uuid        | NO   | Same family across rotations |
| `expires_at` | timestamptz | NO   | 14 days (`11` §5.2)          |
| `revoked_at` | timestamptz | YES  | Logout, rotation, theft      |
| `user_agent` | text        | YES  |                              |
| `ip`         | inet        | YES  |                              |
| `created_at` | timestamptz | NO   |                              |

Indexes: unique `token_hash`; `(user_id, revoked_at)`; `(family_id)`. Reuse of a revoked token in an active family revokes the **family** (`17` §3.4).

Per-session logout revokes **that family**. Password reset (and a future logout-all) sets `revoked_at` on **all** of the user’s refresh rows (`13` §2.2). Member removal does **not** revoke refresh unless it was the last membership (§2.5). No `users.security_version` in MVP.

### 5.3 `password_reset_tokens` (Auth) — Should (FR-AUTH-008)

| Column       | Type        | Null | Notes              |
| ------------ | ----------- | ---- | ------------------ |
| `id`         | uuid        | PK   |                    |
| `user_id`    | uuid        | NO   |                    |
| `token_hash` | text        | NO   | Unique, single-use |
| `expires_at` | timestamptz | NO   |                    |
| `used_at`    | timestamptz | YES  |                    |
| `created_at` | timestamptz | NO   |                    |

### 5.4 `oauth_accounts` (Auth) — Should (FR-AUTH-006)

| Column             | Type        | Null | Notes    |
| ------------------ | ----------- | ---- | -------- |
| `id`               | uuid        | PK   |          |
| `user_id`          | uuid        | NO   |          |
| `provider`         | text        | NO   | `google` |
| `provider_user_id` | text        | NO   |          |
| `created_at`       | timestamptz | NO   |          |

Unique `(provider, provider_user_id)`. Unique `(user_id, provider)`.

### 5.5 `invitations` (Businesses)

FR-AUTH-011, FR-BIZ-010.

| Column               | Type        | Null | Notes                                             |
| -------------------- | ----------- | ---- | ------------------------------------------------- |
| `id`                 | uuid        | PK   |                                                   |
| `business_id`        | uuid        | NO   |                                                   |
| `email`              | citext      | NO   |                                                   |
| `role_id`            | uuid        | NO   | → `roles` (admin or employee; not a second owner) |
| `invited_by_user_id` | uuid        | NO   |                                                   |
| `token_hash`         | text        | NO   | Unique                                            |
| `expires_at`         | timestamptz | NO   |                                                   |
| `accepted_at`        | timestamptz | YES  |                                                   |
| `created_at`         | timestamptz | NO   |                                                   |

Indexes: `(business_id, email)` where `accepted_at IS NULL` unique — one pending invite per email per tenant.

### 5.6 `roles`, `permissions`, `role_permissions` (Businesses)

MVP uses **three system roles** (`business_id` NULL). Custom roles (FR-BIZ-015) are Won't — do not invent them. Permission _codes_ are seeded so `17` can attach the matrix without a rewrite.

**`roles`**

| Column        | Type        | Null | Notes                                          |
| ------------- | ----------- | ---- | ---------------------------------------------- |
| `id`          | uuid        | PK   |                                                |
| `business_id` | uuid        | YES  | NULL = system                                  |
| `name`        | text        | NO   | `owner` / `admin` / `employee` for system rows |
| `created_at`  | timestamptz | NO   |                                                |

Unique `(name)` where `business_id IS NULL`.

**`permissions`**

| Column       | Type        | Null | Notes                                                       |
| ------------ | ----------- | ---- | ----------------------------------------------------------- |
| `id`         | uuid        | PK   |                                                             |
| `code`       | text        | NO   | Unique. e.g. `inbox.read`, `orders.write`, `billing.manage` |
| `created_at` | timestamptz | NO   |                                                             |

**`role_permissions`:** `(role_id, permission_id)` PK. Seed the three roles and the permission **codes** in `13_API_DESIGN.md` §2.11. Enforcement internals: `17_SECURITY_DESIGN.md`.

### 5.7 `businesses` (Businesses)

| Column             | Type        | Null | Notes                                                                                                       |
| ------------------ | ----------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| `id`               | uuid        | PK   |                                                                                                             |
| `name`             | text        | NO   |                                                                                                             |
| `industry`         | text        | NO   | Default `fashion`                                                                                           |
| `country`          | text        | NO   | Default `TN`                                                                                                |
| `default_language` | text        | NO   | `fr` \| `ar` (FR-BIZ-002)                                                                                   |
| `timezone`         | text        | NO   | IANA, e.g. `Africa/Tunis`                                                                                   |
| `currency`         | text        | NO   | Default `TND`                                                                                               |
| `settings`         | jsonb       | NO   | Default `{}`. **`BusinessSettingsSchema`** — empty strict object in MVP (§14). Not the onboarding checklist |
| `deleted_at`       | timestamptz | YES  | Soft delete                                                                                                 |
| `delete_after`     | timestamptz | YES  | 30-day purge                                                                                                |
| `created_at`       | timestamptz | NO   |                                                                                                             |
| `updated_at`       | timestamptz | NO   |                                                                                                             |

### 5.8 `business_members` (Businesses)

| Column           | Type        | Null | Notes      |
| ---------------- | ----------- | ---- | ---------- |
| `id`             | uuid        | PK   |            |
| `business_id`    | uuid        | NO   |            |
| `user_id`        | uuid        | NO   |            |
| `role_id`        | uuid        | NO   |            |
| `invited_at`     | timestamptz | YES  |            |
| `joined_at`      | timestamptz | NO   |            |
| `removed_at`     | timestamptz | YES  |            |
| `last_active_at` | timestamptz | YES  | FR-BIZ-013 |
| `created_at`     | timestamptz | NO   |            |

Unique `(business_id, user_id)` where `removed_at IS NULL`. At most one owner: **service invariant** in MVP (the system owner `roles.id` is a seed UUID; a partial unique on `role_id` would bake that UUID into SQL). Seat count: active members (`removed_at IS NULL`) vs `plans.limits.seats`.

### 5.9 `business_onboarding` (Businesses) — 1:1

FR-BIZ-020. Server-side checklist, not client state.

| Column                  | Type        | Null | Notes                                                               |
| ----------------------- | ----------- | ---- | ------------------------------------------------------------------- |
| `business_id`           | uuid        | PK   | → `businesses`                                                      |
| `business_created`      | boolean     | NO   | Default true at insert                                              |
| `channel_connected`     | boolean     | NO   | Default false                                                       |
| `products_imported`     | boolean     | NO   |                                                                     |
| `ai_configured`         | boolean     | NO   | Personality + minimum policies                                      |
| `playground_passed`     | boolean     | NO   | Satisfies G4 when true                                              |
| `approval_trial_passed` | boolean     | NO   | Alternate G4: `approval_required` with ≥1 approved reply (`01` §14) |
| `handoff_acknowledged`  | boolean     | NO   | G5                                                                  |
| `ai_activated`          | boolean     | NO   |                                                                     |
| `updated_at`            | timestamptz | NO   |                                                                     |

G4 is `playground_passed OR approval_trial_passed`. `ai_activation_ready` is computed in the service from these flags **plus** live G1 (priced in-stock variant) and G3 (at least one `channel_accounts.status = active`). Do not accept `ai_activated = true` if ready is false (FR-BIZ-025). Do not store `ai_activation_ready` on `businesses`.

### 5.10 `business_rules` (Businesses)

FR-KNOW-001–010. **New row on edit** (FR-KNOW-008): close the old row with `effective_to`, insert a new one. AI loads rules where `enabled` and `effective_from ≤ conversation_ts` and (`effective_to` IS NULL OR `effective_to > conversation_ts`).

| Column           | Type        | Null | Notes                                                                                       |
| ---------------- | ----------- | ---- | ------------------------------------------------------------------------------------------- |
| `id`             | uuid        | PK   |                                                                                             |
| `business_id`    | uuid        | NO   |                                                                                             |
| `rule_type`      | `RuleType`  | NO   |                                                                                             |
| `payload`        | jsonb       | NO   | Per `rule_type` Zod in §14. Delivery/payment/returns/hours/discount/min_order/free_shipping |
| `priority`       | integer     | NO   | Higher wins; equal + conflict → `policy_conflict` handoff, do not guess                     |
| `enabled`        | boolean     | NO   |                                                                                             |
| `effective_from` | timestamptz | NO   |                                                                                             |
| `effective_to`   | timestamptz | YES  |                                                                                             |
| `created_at`     | timestamptz | NO   |                                                                                             |

Indexes: `(business_id, rule_type, enabled, effective_from)`.

### 5.11 `idempotency_keys` (Platform)

| Column            | Type        | Null | Notes                                         |
| ----------------- | ----------- | ---- | --------------------------------------------- |
| `id`              | uuid        | PK   |                                               |
| `business_id`     | uuid        | NO   |                                               |
| `key`             | text        | NO   | From `Idempotency-Key` header                 |
| `request_hash`    | text        | NO   | Same key + different body → 409               |
| `response_status` | integer     | YES  |                                               |
| `response_body`   | jsonb       | YES  | Replay                                        |
| `created_at`      | timestamptz | NO   |                                               |
| `expires_at`      | timestamptz | NO   | Default now+24h. Sweeper deletes expired rows |

Unique `(business_id, key)`.

---

## 6. Catalog and inventory (Products)

Variant-first. Price and stock live on **`product_variants` only**. AI search returns variants (FR-CAT-013). A parent without an in-stock `active` variant is invisible to the AI.

### 6.1 `product_categories`

| Column        | Type        | Null | Notes                 |
| ------------- | ----------- | ---- | --------------------- |
| `id`          | uuid        | PK   |                       |
| `business_id` | uuid        | NO   |                       |
| `name`        | text        | NO   |                       |
| `parent_id`   | uuid        | YES  | → self. Tree, not DAG |
| `sort_order`  | integer     | NO   | Default 0             |
| `created_at`  | timestamptz | NO   |                       |
| `updated_at`  | timestamptz | NO   |                       |

Indexes: `(business_id, parent_id, sort_order)`.

### 6.2 `products`

| Column           | Type            | Null | Notes                                   |
| ---------------- | --------------- | ---- | --------------------------------------- |
| `id`             | uuid            | PK   |                                         |
| `business_id`    | uuid            | NO   |                                         |
| `category_id`    | uuid            | YES  |                                         |
| `name`           | text            | NO   |                                         |
| `description`    | text            | YES  |                                         |
| `status`         | `ProductStatus` | NO   | Default `draft`                         |
| `currency`       | text            | YES  | Null → business default                 |
| `benefits`       | jsonb           | YES  | Should (FR-CAT-010). `StringListSchema` |
| `selling_points` | jsonb           | YES  | `StringListSchema`                      |
| `objections`     | jsonb           | YES  | `StringListSchema`                      |
| `faqs`           | jsonb           | YES  | `FaqListSchema`                         |
| `created_at`     | timestamptz     | NO   |                                         |
| `updated_at`     | timestamptz     | NO   |                                         |

**No** `price`, `stock`, or image blob on this row.

Indexes: `(business_id, status)`; `(business_id, category_id)`; GIN `pg_trgm` on `name` (fuzzy catalog / inbox Should search).

### 6.3 `product_variants`

| Column           | Type          | Null | Notes                                                                                                                                                  |
| ---------------- | ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | uuid          | PK   |                                                                                                                                                        |
| `business_id`    | uuid          | NO   | Denormalized for tenant filters                                                                                                                        |
| `product_id`     | uuid          | NO   |                                                                                                                                                        |
| `sku`            | text          | YES  | Unique per business when not null (FR-CAT-005). Blank → auto-generate                                                                                  |
| `barcode`        | text          | YES  |                                                                                                                                                        |
| `attributes`     | jsonb         | NO   | Fashion: `{"color":"Black","size":"M"}`. Default `{}`                                                                                                  |
| `price`          | numeric(12,3) | NO   | `>= 0`                                                                                                                                                 |
| `discount_price` | numeric(12,3) | YES  | If set: `>= 0` AND `< price`                                                                                                                           |
| `stock`          | integer       | NO   | `>= 0`. On-hand, **not** available                                                                                                                     |
| `is_default`     | boolean       | NO   | **At most** one `true` per product (partial unique). Sellable single-SKU products must have **exactly** one `true` — service invariant, not the index. |
| `created_at`     | timestamptz   | NO   |                                                                                                                                                        |
| `updated_at`     | timestamptz   | NO   |                                                                                                                                                        |

Indexes: `(business_id, product_id)`; unique `(business_id, sku)` **where `sku IS NOT NULL`**; unique `(product_id)` **where `is_default = true`** (at most one default). Composite FK `(product_id, business_id) → products(id, business_id)` (§2.13). GIN on `attributes` only if attribute search needs it; MVP variant search is SQL + embeddings.

### 6.4 `product_images`

| Column        | Type        | Null | Notes                                       |
| ------------- | ----------- | ---- | ------------------------------------------- |
| `id`          | uuid        | PK   |                                             |
| `business_id` | uuid        | NO   |                                             |
| `product_id`  | uuid        | NO   |                                             |
| `variant_id`  | uuid        | YES  | Null = product-level                        |
| `s3_key`      | text        | NO   | DB stores key/URL, never bytes (FR-CAT-009) |
| `url`         | text        | NO   | Public or signed URL cache                  |
| `alt_text`    | text        | YES  |                                             |
| `sort_order`  | integer     | NO   |                                             |
| `is_primary`  | boolean     | NO   |                                             |
| `created_at`  | timestamptz | NO   |                                             |

Partial unique: one primary per product where `variant_id IS NULL`; one primary per variant where `variant_id IS NOT NULL`.

### 6.5 `stock_reservations`

FR-ORD-010–012. Default TTL **30 minutes**.

| Column            | Type                | Null | Notes                                                                                     |
| ----------------- | ------------------- | ---- | ----------------------------------------------------------------------------------------- |
| `id`              | uuid                | PK   |                                                                                           |
| `business_id`     | uuid                | NO   |                                                                                           |
| `variant_id`      | uuid                | NO   |                                                                                           |
| `conversation_id` | uuid                | YES  | Pointer, **no Prisma relation** to Conversations. Null if staff reserved without a thread |
| `order_id`        | uuid                | YES  | Pointer, **no Prisma relation** to Orders. Set on commit                                  |
| `quantity`        | integer             | NO   | `> 0`                                                                                     |
| `status`          | `ReservationStatus` | NO   |                                                                                           |
| `reserved_at`     | timestamptz         | NO   |                                                                                           |
| `expires_at`      | timestamptz         | NO   |                                                                                           |
| `created_at`      | timestamptz         | NO   |                                                                                           |
| `updated_at`      | timestamptz         | NO   |                                                                                           |

Indexes: `(variant_id, status, expires_at)` — `available_stock`; `(conversation_id, status)`; `(expires_at)` where `status = active` — sweeper.

On pending-order success → `committed`. Cancel / handoff timeout → `released`. Sweeper → `expired` then stock is free (expired rows do not subtract).

**Concurrency (FR-ORD-012, US-E-04):** two conversations can race the last unit. Redis `conversation:{id}:processing` does **not** serialize stock — it only serializes AI turns on **that** thread.

`reserve` / `commit` / `release` / sweeper `expire` **must** run in one DB transaction in `InventoryService`:

1. `SELECT … FROM product_variants WHERE id = $variant_id AND business_id = $business_id FOR UPDATE`
2. Compute `available_stock` with the SQL below **in the same transaction** (sees the locked row)
3. If `available < quantity` → abort; no reservation row
4. `INSERT` / status update on `stock_reservations`

Never use Redis (or an application mutex) for stock correctness. Prisma: interactive transaction + `$queryRaw` / `$executeRaw` for the `FOR UPDATE` (Prisma `findUnique` does not lock).

`available_stock` SQL (Products repository only; always `business_id`):

```sql
SELECT v.stock - COALESCE(SUM(r.quantity) FILTER (
  WHERE r.status = 'active' AND r.expires_at > now() AND r.business_id = v.business_id
), 0) AS available_stock
FROM product_variants v
LEFT JOIN stock_reservations r
  ON r.variant_id = v.id AND r.business_id = v.business_id
WHERE v.id = $variant_id AND v.business_id = $business_id
GROUP BY v.stock;
```

### 6.6 `inventory_movements` — Should (FR-CAT-014)

| Column        | Type        | Null | Notes                                                      |
| ------------- | ----------- | ---- | ---------------------------------------------------------- |
| `id`          | uuid        | PK   |                                                            |
| `business_id` | uuid        | NO   |                                                            |
| `variant_id`  | uuid        | NO   |                                                            |
| `delta`       | integer     | NO   | Signed. Confirm/cancel/manual adjust                       |
| `reason`      | text        | NO   | `reserve_commit` \| `release` \| `manual` \| `import` \| … |
| `order_id`    | uuid        | YES  |                                                            |
| `created_at`  | timestamptz | NO   |                                                            |

Append-only. MVP Must path can skip writes if the Should slips; **table still ships** so we do not migrate later.

### 6.7 `catalog_import_runs` (FR-CAT-020–026)

| Column                | Type           | Null | Notes                |
| --------------------- | -------------- | ---- | -------------------- |
| `id`                  | uuid           | PK   |                      |
| `business_id`         | uuid           | NO   |                      |
| `uploaded_by_user_id` | uuid           | NO   |                      |
| `s3_key`              | text           | NO   | Original CSV         |
| `status`              | `ImportStatus` | NO   |                      |
| `total_rows`          | integer        | YES  |                      |
| `success_rows`        | integer        | YES  |                      |
| `error_rows`          | integer        | YES  |                      |
| `error_s3_key`        | text           | YES  | Row-level error file |
| `created_at`          | timestamptz    | NO   |                      |
| `finished_at`         | timestamptz    | YES  |                      |

Upsert by SKU is idempotent (FR-CAT-026). No catalog write until status has passed preview confirm.

---
