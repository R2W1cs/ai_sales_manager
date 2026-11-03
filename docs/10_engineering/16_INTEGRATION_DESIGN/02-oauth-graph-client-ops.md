## 5. OAuth connect

Routes: `13` §10.1. Browser hits **`api.<apex>`**, not `hooks`.

### 5.1 CSRF

`POST /integrations/meta/connect` (authenticated + tenant):

- `state` = UUIDv4
- Redis `oauth:meta:{state}` = `{ userId, businessId }` TTL **10 minutes**
- Return `{ authorizationUrl }`

Callback is **public** (`13`) — no JWT, no `X-Business-Id`. `businessId` / `userId` come from Redis state. Missing/invalid state or token exchange failure → **302** `?meta=error` (do not dump JSON into the browser). Consume state (single use).

After success, **302** to `{PUBLIC_APP_URL}/integrations?meta=ok` (exact app path is `22`; do not invent a second callback API).

**User token (ephemeral):** callback exchanges `code` → short user token → long-lived user token (`fb_exchange_token`), then stores it in Redis `oauth:meta:usertoken:{userId}:{businessId}`, TTL **10 minutes**. Not in Postgres, not in JWT, never logged. `GET /assets` and `POST /channel-accounts` read that key. Missing → **400** `oauth_expired` — merchant clicks Connect again. Do not delete the key after the first `POST /channel-accounts` (one consent can create Messenger **and** Instagram). TTL is the bound. This is **not** the page token.

### 5.2 Scopes (MVP)

| Scope                       | Why                    |
| --------------------------- | ---------------------- |
| `pages_show_list`           | Asset picker           |
| `pages_messaging`           | Messenger send/receive |
| `pages_manage_metadata`     | `subscribed_apps`      |
| `instagram_basic`           | Linked IG              |
| `instagram_manage_messages` | Instagram DMs          |

Do not request WhatsApp scopes until `whatsapp_enabled`. Do not request `pages_read_engagement` / ads / catalog scopes in MVP.

Dialog: Facebook Login, `META_APP_ID`, redirect `https://api.<apex>/api/v1/integrations/meta/callback`.

### 5.3 After consent (authenticated)

Callback already exchanged the code (§5.1). These calls use the Redis user token.

1. `GET /me/accounts` → pages. `GET /{page-id}?fields=instagram_business_account` for linked IG.
2. `GET /integrations/meta/assets` returns those pages (ids + names + whether IG linked). **No tokens.**
3. `POST /channel-accounts` with `channel` + `externalAccountId` (needs Redis user token):
   - **New:** create row `pending` → subscribe → store **page** token in Secrets Manager `aisales/{env}/channel/{channelAccountId}/page-token` → set `credentials_ref` → `status=active`. Set `token_expires_at` from `expires_in` when present; otherwise **null**. Store `authorized_meta_user_id` from `GET /me` (Facebook user id of the installer) — needed for deauthorize matching. Not a token.
   - **Existing status ≠ `active`** (`pending`, `pending_verification`, `error`, `disconnected`): reuse the same row. Rotate the SM secret, clear `last_error`, set `status=active`, `disconnected_at` null, refresh `authorized_meta_user_id` from current `GET /me`. History stays. This is reconnect / resume — **not** 409.
   - **Existing `active`:** **409** `conflict`. To rotate a live token, `DELETE` first then connect.
4. Subscribe: `POST /{page-id}/subscribed_apps` with `subscribed_fields=messages,messaging_postbacks,message_deliveries` (and Instagram message fields Meta requires for that Graph version). Crash after `pending` insert and before `active` is why resume must reuse `pending`.

`object=permissions` and the deauthorize callback are **app** settings in the Meta dashboard, not `subscribed_apps` fields. Do not add feed/comment subscriptions in MVP.

`authorized_meta_user_id` is from the **user** token `GET /me` at connect/reconnect. The daily probe uses the **page** token (`GET /me` or `GET /{page-id}?fields=id`). Do not call `debug_token` unless using the app token; do not confuse the two ids.

Plan `channel_accounts` cap → `quota_exceeded` (`13`). Cap counts Messenger and Instagram rows separately (one Page can be both). Reconnect of an existing row does **not** consume an extra slot.

Token never in `channel_accounts` columns (`token_expires_at` is metadata, not a token).

### 5.4 Disconnect / error / reconnect (FR-INT-006, FR-INT-012)

`DELETE` channel-account: `status=disconnected`, `disconnected_at=now()`, try unsubscribe, **keep** history. Stop inbound AI and outbound Graph.

**Same error path** (do not wait for the daily probe) when any of these fire:

| Signal                                                   | How it arrives                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Graph `401` / `#190` / `#200` / `#10` / permission error | `deliver_outbound`, subscribe, or `check_channel_tokens`                               |
| App deauthorized / user removed the app                  | `POST /webhooks/meta/deauthorize` (`signed_request`) and/or Graph object `permissions` |
| Permission revoked                                       | Graph webhook `object=permissions` (or equivalent field on this Graph version)         |
| Page or linked IG removed / unpublished                  | Page/IG webhook field indicating the asset is gone, or probe `#100` / page-not-found   |

Then:

1. `status=error`, `last_error` (no token substring) on **each** matching `channel_account` (`authorized_meta_user_id` for user-level deauth; `page_id` / `ig_user_id` for asset-level)
2. No Graph on `deliver_outbound` (message → `failed`)
3. Inbound still **200** + persist per §4.3; worker does **not** ingest or enqueue AI (`14` §4: status ≠ `active`)
4. Notify Owner/Admin `ESCALATION` (not a fifth type). Dedupe with `notifications.dedupe_key` (`14`) so deauth + probe the same day is one banner
5. `GET /integrations` already returns `status`, `lastError` (`13`) — inbox/settings banner + **Reconnect** = existing `POST /integrations/meta/connect` then `POST /channel-accounts` (reuse row, §5.3)

If deauthorize carries only a Meta user id we do not have on any row: persist per §4.3 (unknown), `processed_at=now()`, no enqueue — the daily probe still flips `active` accounts to `error`.

Do not retry Graph forever. Do not add a merchant HTTP route for reconnect. The deauthorize **webhook** is not a reconnect route.

### 5.5 Token check

Job `check_channel_tokens` (integrations queue, daily, jobId `{channelAccountId}:{date}`): for `status=active`, probe with the **page** token (`GET /me` or `GET /{page-id}?fields=id`). Update `last_token_check_at`. Failure → §5.4 error path. Page tokens often have **no** `expires_in`; null `token_expires_at` is normal — still probe. Probe is the backstop, not the only revocation detector.

---

## 6. Graph client

| Pin       | Value                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ |
| Base      | `https://graph.facebook.com/${META_GRAPH_VERSION}`                                         |
| Version   | Env `META_GRAPH_VERSION`. **Working pin: `v23.0`**. Never `latest`. Bump = this file + env |
| Auth      | `access_token` query or `Authorization: Bearer` page token                                 |
| Timeout   | **10s** per Graph call                                                                     |
| Transport | `undici`                                                                                   |

### 6.1 Outbound send (`deliver_outbound`)

Job: `14` §7, jobId `{messageId}`. Load token via `credentials_ref`.

**Idempotency (before any Graph call):**

```
if messages.external_message_id IS NOT NULL
   or delivery_status IN ('sent', 'delivered'):
     return success — do not send again
if delivery_status = 'draft': return success without Graph — leave `draft`
if channel_account.status != active: set failed, no Graph
```

A crash after Meta accepted but before we stored `external_message_id` can still double-send once — accept in MVP (no Graph idempotency key). The check above stops **job retries** from duplicating.

| Channel   | Endpoint (typical)                        | Recipient |
| --------- | ----------------------------------------- | --------- |
| Messenger | `POST /{page-id}/messages`                | PSID      |
| Instagram | `POST /{page-id}/messages` (IG messaging) | IGSID     |
| WhatsApp  | stub                                      | —         |

Success: store `messages.external_message_id`, `delivery_status=sent`, emit `message.sent`.

Provider **429**: stay `queued`, backoff (`14` attempts 3, 5s then 10s). The BullMQ group limiter (§7) should make this rare.

Provider 4xx (bad recipient, outside window): `retryable=false` → `failed` + DLQ. WhatsApp 24h window is **Phase 2**; MVP ignore `whatsapp_window_expires_at`.

Never report `delivered` on a refused send (`14` §5). `delivered` only from a `delivery` webhook.

Human/AI image send: worker reads S3, uploads per Graph (or hosted URL if Meta accepts). Do not send our internal S3 URL if the bucket is private — use a short-lived signed GET or Graph upload. Pin: **Graph upload** for images.

### 6.2 Identity

`CustomerService.resolve({ businessId, platform: channel, platformUserId })`:

- Hit unique `(business_id, platform, platform_user_id)` (`12` §7.2)
- If that customer has `erased_at` (should not: identities are deleted on erase): treat as miss
- Else create `customers` + identity (`lifecycle_stage=unknown_visitor`)
- Merged loser: follow `merged_into_customer_id` (skip if survivor erased)

Thread: unique `(channel_account_id, external_thread_id)`. Messenger thread id = PSID (or Meta thread key if present). Instagram = IGSID / thread id from payload. Pin: `external_thread_id` = `platformUserId` when Meta does not send a separate thread id.

---

## 7. Provider rate limits

BullMQ **group** limiter keyed by `channel_account_id` on `deliver_outbound` (`14` §9). That is the **only** outbound token bucket. Do not add a second limiter inside `send()`.

| Channel     |       Max / 1s | Notes                                         |
| ----------- | -------------: | --------------------------------------------- |
| `messenger` |         **20** | Conservative vs Graph page throughput         |
| `instagram` |         **10** | DMs are tighter; raise only after 429 metrics |
| `whatsapp`  | n/a until flag | Phase 2 Cloud API                             |

These are **our** ceilings, not Meta’s published max. 429 still backs off. Do not drop without DLQ. Do not lower them because AI is slow — inbound→reply latency is `messages.created_at` (in vs out) + `ai_metadata.latency_ms` (`15`), not extra columns here.

Per-business AI burst 60/min stays in `14` (our LLM), not here.

---

## 8. WhatsApp stub (MVP)

| Ship                                                                       | Do not                                   |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| `adapters/whatsapp/` implementing `ChannelAdapter` with throws / empty map | Unofficial clients                       |
| Columns `waba_id`, `phone_number_id`, `whatsapp_window_expires_at`         | 24h window enforcement                   |
| Routes behind flag (`13` §10.2)                                            | Template authoring UI                    |
| `feature_flags.whatsapp_enabled` checks                                    | Subscribe WA webhooks in prod until flag |

Phase 2 fills send/map and OAuth scopes. Same canonical DTOs.

---

## 9. Logging

Log: `channel_account_id`, `external_event_id`, Graph status, correlation id (`18`).

**Never log:** access tokens, `META_APP_SECRET`, `Authorization`, raw `X-Hub-Signature-256` + body together, PSID in the same line as message text in info logs (PII — debug only, sampled).

`integration_events.headers`: strip `Authorization`; keep `X-Hub-Signature-256` name but not as a secret store.

---

## 10. How coding agents must use this

1. New channel = `ChannelAdapter` + `12` channel enum (already has `whatsapp`) + flag. Not a new Nest app.
2. Conversations accept **only** `CanonicalInbound`. No `entry.messaging` in that module.
3. HMAC on **raw bytes** with **app secret**. Verify GET with **`META_WEBHOOK_SECRET`**.
4. Do not persist invalid HMAC.
5. Do not call `AIOrchestrator` from the webhook handler.
6. Tokens: Secrets Manager + `credentials_ref`. Never `access_token` / ciphertext columns in MVP (OQ-68).
7. Echoes are not inbound customer messages.
8. No unofficial WhatsApp packages in `package.json`.
9. Graph version from env; do not hardcode a second version beside `META_GRAPH_VERSION`.
10. Image fetch/upload is a job, not the 500 ms ack path.
11. `deliver_outbound`: skip Graph if `external_message_id` set or status already `sent`/`delivered`.
12. Do not add `integration_events.processing_status`. `processed_at` + BullMQ are enough.
13. Channel `error`: banner + reconnect via existing **merchant** OAuth + `POST /channel-accounts` (reuse row). No new merchant route. The deauthorize **webhook** is not reconnect. `active` duplicate is 409 `conflict`.
14. Persist policy is the §4.3 table. Ignored WA = **no row**. Unknown page = row with `processed_at=now()`, no enqueue. Do not leave `processed_at` null on a no-map insert.
15. HMAC is **computed** over raw bytes; do not re-serialize JSON.
16. Do not Graph a `draft`. Page tokens live in SM; the OAuth **user** token lives in Redis for 10 minutes only.
17. One webhook POST = one `integration_events` row; do not split mids into extra HTTP-layer rows.
18. App deauthorized / permission revoked / page removed → §5.4 immediately, not only Graph `401` on send. Store `authorized_meta_user_id` at connect **and** reconnect. Parse `signed_request` / `object=permissions` in UnifiedMessaging, not `ChannelAdapter`.

---

## 11. Open questions

| #     | Question                                                 | Working answer                                                                                                                        | Owner       | Revisit                               |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------- |
| OQ-65 | Graph version                                            | **`v23.0`** via `META_GRAPH_VERSION`. Bump this file when Meta sunsets                                                                | Engineering | Meta changelog                        |
| OQ-66 | Messenger vs IG QPS                                      | **20 / 10** per account per second                                                                                                    | Engineering | First 429 cluster                     |
| OQ-67 | HMAC key                                                 | **App secret**, not `META_WEBHOOK_SECRET`                                                                                             | Engineering | Decided                               |
| OQ-68 | Tenant tokens in Secrets Manager vs KMS-envelope column? | **SM in MVP** (one secret per channel_account). Revisit envelope ciphertext in `12`+`17` if SM count/latency hurts — not at bootstrap | Engineering | > few hundred active channel_accounts |
| OQ-69 | `customer_identities.identity_status` / `last_seen_at`?  | **No in MVP.** Unique `(business_id, platform, platform_user_id)` is enough. Unlink = next inbound creates or matches                 | Engineering | IG unlink incidents                   |

Do not reopen OQ-42 (outbox), unofficial WhatsApp, or `/realtime`.

---

## 12. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Integration Architecture`
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` FR-INT
- `docs/00_product/03_MVP_SCOPE.md` Option C
- `docs/10_engineering/13_API_DESIGN.md` §10
- `docs/10_engineering/14_SYSTEM_DESIGN.md` §4–5, §7, §9
- `docs/10_engineering/12_DATABASE_DESIGN.md` §8
- `docs/10_engineering/18_DEPLOYMENT.md` §2, §9
- `docs/10_engineering/11_TECH_STACK.md` §10
- `docs/10_engineering/17_SECURITY_DESIGN.md` — JWT, SSRF, SM
