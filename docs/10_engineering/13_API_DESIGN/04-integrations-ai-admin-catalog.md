## 10. Integrations and webhooks

### 10.1 Merchant

| Method   | Path                                        | Perm                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/integrations`                      | `integrations.manage` (Employee: `inbox.read` **status only**, no reconnect) | Per `channel_accounts`: `channel`, `status`, `externalAccountId` (masked), `lastInboundAt`, `lastError`, no tokens (FR-INT-004, FR-INT-005)                                                                                                                                                                                                                                                           |
| `POST`   | `/api/v1/integrations/meta/connect`         | `integrations.manage`                                                        | Returns `{ "authorizationUrl" }`. CSRF state in **Redis**, minutes TTL (`12` §8.1). MVP scopes: Page + Instagram. WhatsApp scopes only when flag on                                                                                                                                                                                                                                                   |
| `GET`    | `/api/v1/integrations/meta/callback`        | Public                                                                       | Browser OAuth return. Exchange `code`, stash user token in Redis (`16`). **Always 302** to `{PUBLIC_APP_URL}/integrations?meta=ok` or `?meta=error` — no JSON success body                                                                                                                                                                                                                            |
| `GET`    | `/api/v1/integrations/meta/assets`          | `integrations.manage`                                                        | Pages / IG after consent. Missing Redis user token → **400** `oauth_expired` (click Connect again). **No tokens** in the JSON                                                                                                                                                                                                                                                                         |
| `POST`   | `/api/v1/integrations/channel-accounts`     | `integrations.manage`                                                        | Body: `{ "channel": "instagram" \| "messenger", "externalAccountId", ... }`. MVP: those two only. Cap → `quota_exceeded`. WhatsApp body → `feature_disabled` unless flag. Missing Redis user token → **400** `oauth_expired`. **Reconnect / resume:** same unique key with status **≠ `active`** (including `pending`) → **update** that row, not 409. **`active` duplicate → 409 `conflict`** (`16`) |
| `DELETE` | `/api/v1/integrations/channel-accounts/:id` | `integrations.manage`                                                        | Disconnect; preserve history (FR-INT-006)                                                                                                                                                                                                                                                                                                                                                             |
| `PATCH`  | `/api/v1/integrations/live`                 | `ai.configure`                                                               | Body: `{ "enabled": true \| false }`. `true` while gates fail → **422** `activation_not_ready` + `unmet_gates` (FR-BIZ-025). Sets `business_onboarding.ai_activated`                                                                                                                                                                                                                                  |

Employee may see channel **status** on inbox banners; they cannot connect or go live.

### 10.2 Phase 2 WhatsApp (routes exist, unused)

Behind `feature_flags.whatsapp_enabled`. Otherwise **403** `feature_disabled`. Adapter stub still ships (`18`).

| Method | Path                                      |
| ------ | ----------------------------------------- |
| `GET`  | `/api/v1/integrations/whatsapp/templates` |
| `POST` | `/api/v1/conversations/:id/send-template` |

Unofficial WhatsApp APIs: **forbidden** in the codebase (FR-INT-032).

### 10.3 Webhooks — `hooks.<apex>`

Canonical URL: `https://hooks.<apex>/api/v1/webhooks/meta` (`18_DEPLOYMENT.md`).

| Method | Path                                | Auth                              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ----------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/webhooks/meta`             | Meta hub token                    | Query `hub.mode`, `hub.verify_token`, `hub.challenge`. Success: **200** `text/plain` = challenge. Else **403** empty. Algorithm in `16`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `POST` | `/api/v1/webhooks/meta`             | HMAC (`16_INTEGRATION_DESIGN.md`) | Persist policy is the table in `16` §4.3. **401** invalid HMAC → **no row**. `whatsapp_business_account` (flag off) → **200, no insert**. Unknown page → insert `processed_at=now()`, **no enqueue**. Deauthorize/revoke/page-removed with a matching account → persist + enqueue. Else persist, enqueue `retry_webhook_processing`, **then** **200**. p95 ack **< 500 ms**. Duplicates: `16` §4.3. Body **> 512 KB** → 413. MVP objects: `page`, `instagram`, `permissions`. Sequence: `14` §4. **Do not** enqueue `process_inbound_message` here |
| `POST` | `/api/v1/webhooks/meta/deauthorize` | `signed_request` (`16` §4.5)      | Meta **Deauthorize Callback URL**. Invalid → **401**, no row. Valid → same persist table as deauthorize. **200**. Not a merchant reconnect route                                                                                                                                                                                                                                                                                                                                                                                                   |

Do not run the orchestrator on this request. The worker `retry_webhook_processing` maps and **may** enqueue `process_inbound_message` (`14` §4, `16`).

Response body: `{ "ok": true }`.

---

## 11. AI admin (not the orchestrator)

**Do not expose `POST /api/v1/ai/respond`.** The worker calls `AIOrchestrator` in-process. A public or even “internal HTTP” turn endpoint is a defect (double-run, auth hole).

| Method  | Path                                  | Perm              | Notes                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/v1/ai/agents`                   | `ai.configure`    | Array of one                                                                                                                                                                                                                                                                                                                                                     |
| `PATCH` | `/api/v1/ai/agents/:id`               | `ai.configure`    | Personality, language, tone, greeting/fallback, `salesStrategy`, `confidenceThreshold`, `enabled` (FR-AI-001–004, 006)                                                                                                                                                                                                                                           |
| `GET`   | `/api/v1/ai/settings`                 | `ai.configure`    |                                                                                                                                                                                                                                                                                                                                                                  |
| `PATCH` | `/api/v1/ai/settings`                 | `ai.configure`    | `replyMode`, lead thresholds, reservation TTL, inactivity days, budget. Model ids **must** be pins in `11_TECH_STACK.md` §9.3 — else 400. Should: max tokens, temperature, rag_top_k, blocked_topics, custom_system_append                                                                                                                                       |
| `GET`   | `/api/v1/ai/prompts`                  | `ai.configure`    |                                                                                                                                                                                                                                                                                                                                                                  |
| `POST`  | `/api/v1/ai/prompts`                  | `ai.configure`    | Body: `{ "type", "content" }`. Inserts version N+1, activates it. Never PATCH content in place                                                                                                                                                                                                                                                                   |
| `POST`  | `/api/v1/ai/reindex`                  | `knowledge.write` | **202** `{ "jobId" }`. Enqueues `reindex_business`                                                                                                                                                                                                                                                                                                               |
| `POST`  | `/api/v1/ai/playground`               | `ai.playground`   | **202** `{ "jobId", "conversationId" }`. Body: `{ "scenario": "price" \| "angry" \| "buying_intent" \| "recommendation" }` **or** `{ "conversationId", "content" }`. Creates/continues `source=playground`, `is_test=true`. Never Meta. Do not hold HTTP for the LLM; client refetches messages / traces. Completing a scenario may set `playground_passed` (G4) |
| `GET`   | `/api/v1/ai/playground/conversations` | `ai.playground`   | Test threads only                                                                                                                                                                                                                                                                                                                                                |
| `POST`  | `/api/v1/messages/:id/feedback`       | `inbox.write`     | Body: `{ "rating": "positive" \| "negative", "reason": FeedbackReason, "comment"? }`. AI messages only (FR-OBS-006)                                                                                                                                                                                                                                              |
| `GET`   | `/api/v1/ai/feedback`                 | `ai.configure`    | Query: `from`, `to`, `reason`, `prompt_version_id`, `cursor`                                                                                                                                                                                                                                                                                                     |
| `GET`   | `/api/v1/ai/actions`                  | `ai.traces.read`  | Debug tool log. Query: `cursor`, optional `conversationId`                                                                                                                                                                                                                                                                                                       |
| `GET`   | `/api/v1/ai/usage`                    | `usage.read`      | Owner **cost** + tokens (`ai_usage`). Admin/Employee **403**. Not a dashboard KPI                                                                                                                                                                                                                                                                                |
| `GET`   | `/api/v1/ai/evaluation/summary`       | `ai.configure`    | Rollup of `ai_evaluations` — **not** a fifth merchant tile                                                                                                                                                                                                                                                                                                       |

Playground decision traces: `GET /conversations/:id/decision-traces` (`ai.traces.read`). Playground messages/orders excluded from KPIs and `usage_events` (`12` §2.6).

---

## 12. Catalog, knowledge, rules

Perm: write `catalog.write` / `knowledge.write` / `rules.write`. Read: same, plus `inbox.read` for enough product context in the customer panel (name, variant, price, stock) — not merchandising edit.

### 12.1 Categories, products, variants, images

Standard REST:

- `GET/POST /api/v1/product-categories`; `PATCH/DELETE /api/v1/product-categories/:id`
- `GET/POST /api/v1/products`; `GET/PATCH /api/v1/products/:id`; archive via `{ "status": "archived" }`. Delete that appears on an order → **409** (FR-CAT-012). **GET list uses §2.7 cursor**
- `GET/POST /api/v1/products/:id/variants`; `PATCH /api/v1/products/:id/variants/:variantId`
- `POST /api/v1/products/:id/images` multipart; optional `variantId`. `PATCH` alt/sort/primary; `DELETE`

Price/stock **only** on variants. `availableStock` is computed (`12` §6.5), included on variant GET, never accepted on PATCH. Editing price, stock, name, description, or merchandising enqueues re-embed (FR-CAT-011).

Image POST returns `{ "id", "url" }` (signed GET). DB stores key/URL, not bytes.

### 12.2 CSV import (FR-CAT-020–027)

| Method | Path                                  | Notes                                                                                                                                                                                                         |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/products/import/template`    | CSV headers + one example row                                                                                                                                                                                 |
| `POST` | `/api/v1/products/import`             | Persist file to S3, status `uploaded`, enqueue validate. **202** `{ "id" }`. **No catalog writes**. Client polls `GET …/import/:id` until `validated` / `failed`. Do not parse a 10 MB CSV on the HTTP thread |
| `GET`  | `/api/v1/products/import/:id`         | Status, counts, `errorFileUrl`                                                                                                                                                                                |
| `POST` | `/api/v1/products/import/:id/confirm` | Explicit confirm (FR-CAT-022). **202**, status `running`. Upsert by SKU                                                                                                                                       |

### 12.3 Knowledge documents

`GET/POST /api/v1/knowledge/documents`; `GET/PATCH/DELETE /api/v1/knowledge/documents/:id`. POST/PATCH persist the row and enqueue `index_document`; response **201/200** with `indexingStatus: pending` — do not wait for embeddings (§2.12). PDF/DOCX upload is Could — no route.

### 12.4 Business rules

`GET /api/v1/business-rules` — effective + history.

`POST /api/v1/business-rules` — **new row**, closes previous `effective_to` (FR-KNOW-008). Body: `ruleType`, `payload` (discriminated Zod in `12` §14.8), `priority`, `enabled`.

`PATCH /api/v1/business-rules/:id` — only `enabled` / `effective_to` on the current row. Do not mutate `payload` in place; POST a new version.

---
