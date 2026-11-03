# 16 — Integration Design

| Field           | Value                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `16_INTEGRATION_DESIGN`                                                                                                                                                                      |
| Status          | Approved — canonical for Meta adapters, webhooks, OAuth, outbound Graph                                                                                                                      |
| Owner           | Engineering                                                                                                                                                                                  |
| Audience        | Integrations module, worker, AI coding agents                                                                                                                                                |
| Depends on      | `10_ARCHITECTURE.md`, `11_TECH_STACK.md` §10, `12_DATABASE_DESIGN.md`, `13_API_DESIGN.md`, `14_SYSTEM_DESIGN.md`, `18_DEPLOYMENT.md`, `01_PRODUCT_REQUIREMENTS.md` FR-INT, `03_MVP_SCOPE.md` |
| Consumed by     | Nest `integrations/` in `apps/api`, `17_SECURITY_DESIGN.md` (token storage), `31_IMPLEMENTATION_PLAN.md`                                                                                     |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Integration Architecture`, `# Event Architecture`                                                                                                   |

---

## 1. Purpose and scope

This document is **canonical for how we talk to Meta**. If an HMAC step, OAuth scope, adapter method, Graph path, or per-page QPS is not here, it does not exist. Add it here first, then implement.

**In scope:** adapter interface, canonical inbound/outbound DTOs, webhook verify + HMAC, persist policy, OAuth connect, token storage refs, map Graph → canonical, outbound send, media fetch, echo/receipt handling, deauthorize / permission-revoke / page-removed, WhatsApp **stub**, provider rate limiters.

**Out of scope, and where it lives instead:**

| Topic                                           | Canonical location               |
| ----------------------------------------------- | -------------------------------- |
| HTTP routes and status codes                    | `13_API_DESIGN.md`               |
| Persist → 200 → enqueue sequence, job ids       | `14_SYSTEM_DESIGN.md` §4         |
| Tables `channel_accounts`, `integration_events` | `12_DATABASE_DESIGN.md` §8       |
| Hosts `hooks.<apex>`, Cloudflare grey           | `18_DEPLOYMENT.md`               |
| Orchestrator                                    | `15_AI_ARCHITECTURE.md`          |
| JWT / RBAC / field encryption internals         | `17_SECURITY_DESIGN.md`          |
| Unofficial WhatsApp                             | **Forbidden** (`03`, FR-INT-032) |

Conversations **never** parse Graph JSON. AI **never** calls Graph. Integrations never imports `AIOrchestrator` (`10` §5.2).

**References:** `§N` is this file. Sibling docs are filenames. This file has no competing §13/§14.

---

## 2. Invariants

1. **Official Graph only.** `fetch` / `undici`. No Twilio, 360dialog, Baileys, `whatsapp-web.js`, puppeteer-to-WA (`11` §10).
2. One Meta **app** per environment (staging test app, prod live app). Instagram + Messenger share it (FR-INT).
3. HMAC fail → **401**, **no** row. After a valid HMAC, persist vs skip is **§4.3** (table). If a row is written for a no-map case, `processed_at=now()` and **never** enqueue.
4. Webhook never waits on LLM, Graph media download, or S3 (`14`). Media fetch is a **follow-on** job.
5. Page/IG access tokens live in **Secrets Manager** in MVP (FR-INT-003/004). `credentials_ref` only on the row. Never plaintext token columns, never in logs. Envelope-encrypted DB ciphertext is **`17` + OQ-68** after secret-count pain — not now. `webhook_secret_ref` is unused in MVP (HMAC is app-level `META_APP_SECRET`).
6. Echoes of our own outbound do **not** enqueue `process_inbound_message`.
7. `whatsapp_enabled=false`: `whatsapp_business_account` → **200, no insert** (§4.3). WhatsApp routes `feature_disabled` (`13`). Stub adapter still compiles.
8. Only `status=active` ingests to Conversations or Graph. `pending` / `error` / `disconnected`: HTTP still **200**; worker sets `processed_at` without identity/message/AI; `deliver_outbound` fails closed, no Graph.
9. `deliver_outbound`: if `external_message_id` is set **or** `delivery_status` is `sent`/`delivered`, **return success without Graph**. Send only `queued` or `failed` (explicit retry). **Never** Graph a `draft`.
10. Reconnect / resume of any row with status **≠ `active`** **reuses** that row. 409 `conflict` only for an **active** duplicate (`13`). Broken-but-still-`active` → `DELETE` (disconnect) then connect again.

---

## 3. Adapter interface

Folder layout (`10` §4.2): `integrations/meta/` + `adapters/{instagram,messenger,whatsapp}`.

```ts
interface ChannelAdapter {
  readonly channel: "instagram" | "messenger" | "whatsapp";
  mapInbound(raw: unknown, ctx: MapContext): CanonicalInbound[];
  send(input: CanonicalOutbound, token: string): Promise<SendResult>;
  outboundLimiter: { max: number; durationMs: 1000 };
}
```

`UnifiedMessaging` picks the adapter from `channel_accounts.channel`. WhatsApp implementation: methods throw `feature_disabled` / no-op map until the flag is on. Do not delete the stub.

`outboundLimiter` is the **config** copied into the BullMQ group limiter (`14` §9 / this file §7). `send()` must **not** implement a second in-process or Redis bucket.

### 3.1 `CanonicalInbound` (`packages/shared`)

```json
{
  "provider": "meta",
  "channel": "instagram",
  "eventKind": "message",
  "externalAccountId": "page-or-ig-id",
  "externalThreadId": "string",
  "externalMessageId": "string",
  "platformUserId": "IGSID-or-PSID",
  "text": "optional",
  "attachments": [{ "type": "image", "providerUrl": "https://..." }],
  "timestamp": "ISO-8601",
  "isEcho": false,
  "rawEventId": "string"
}
```

`eventKind`: `message` \| `delivery` \| `read` \| `lifecycle` \| `other`.

`lifecycle` = app deauthorized, permission revoked, or page/IG removed. Not a customer message.

No Graph field names (`mid`, `igs`, `payload.entry`) leak into Conversations or AI (`FR-INT-010`).

### 3.2 `CanonicalOutbound`

```json
{
  "channel": "messenger",
  "recipientPlatformUserId": "PSID",
  "text": "optional",
  "imageS3Key": "optional",
  "externalReplyToId": "optional"
}
```

MVP send: **text**, or **one image** (S3 → Graph upload / URL). No buttons, templates, or typing indicators (Won't). Phase 2 WhatsApp templates: stub route only (`13` §10.2).

### 3.3 `SendResult`

`{ ok: true, externalMessageId }` or `{ ok: false, retryable: boolean, providerCode?: string, message: string }`. `retryable` is **not** copied onto HTTP error JSON (`13`).

---

## 4. Webhooks

URL: `https://hooks.<apex>/api/v1/webhooks/meta` (`18`). Routes: `13` §10.3. Sequence: `14` §4.

### 4.1 GET — hub verify

Query: `hub.mode`, `hub.verify_token`, `hub.challenge`.

| Check                                                                                     | Result                                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------- |
| `hub.mode === "subscribe"` and `hub.verify_token` timing-safe-equal `META_WEBHOOK_SECRET` | **200** `text/plain` = `hub.challenge` |
| Else                                                                                      | **403** empty                          |

This token is **not** the HMAC key.

### 4.2 POST — HMAC

| Pin     | Value                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Header  | `X-Hub-Signature-256`                                                                                                    |
| Form    | `sha256=<hex>`                                                                                                           |
| Key     | **`META_APP_SECRET`** (app secret, NFR-SEC-07 / `11` §10)                                                                |
| Payload | **Raw body bytes** (Nest `rawBody: true`). Not `JSON.stringify(parsed)`                                                  |
| Compare | HMAC-SHA256(raw bytes, `META_APP_SECRET`) vs hex after `sha256=` (timing-safe). Do **not** HMAC `JSON.stringify(parsed)` |

Missing/invalid header or mismatch → **401** `webhook_invalid_signature`, **no insert**, no enqueue.

If `Content-Length` **> 512 KB**, **413** **before** HMAC. Otherwise HMAC the raw bytes, then 413 if the buffered body exceeds 512 KB (`13`).

### 4.3 After HMAC — persist policy

HTTP 200 vs non-200 when enqueue is required is still **`14` §4**. This table is **what** to insert. Do not invent a second sequence.

**Rule:** persist a row only when we need replay/debug or a worker must act. If we persist and there is **nothing to map**, set `processed_at=now()` on insert and **do not** enqueue (otherwise the 30s sweep retries forever). Invalid HMAC never gets a row.

**Evaluate after verify + resolve**, then first matching row wins.

| Case                                                                                                              | HTTP        | Insert `integration_events`?      | `processed_at`    | Enqueue `retry_webhook_processing` |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------- | ----------------- | ---------------------------------- |
| Missing/invalid HMAC                                                                                              | **401**     | **No**                            | —                 | **No**                             |
| Body **> 512 KB**                                                                                                 | **413**     | **No**                            | —                 | **No**                             |
| `object=whatsapp_business_account` and flag off                                                                   | **200**     | **No** (no WA noise in the inbox) | —                 | **No**                             |
| Unknown Graph `object` (not `page`, `instagram`, `permissions`; and not `whatsapp_business_account` when flag on) | **200**     | **No**                            | —                 | **No**                             |
| Valid `page` / `instagram` / `permissions`, **no** matching `channel_account`                                     | **200**     | **Yes** (debug)                   | **now**           | **No**                             |
| App deauthorized / permission revoked / page or IG removed, and we **can** resolve account(s)                     | **200**     | **Yes** (audit)                   | null until worker | **Yes**                            |
| Known `page` / `instagram` messaging (or `whatsapp_business_account` **when flag on**)                            | **200**     | **Yes**                           | null until worker | **Yes**                            |
| Duplicate unique key, `processed_at` already set                                                                  | **200**     | no-op                             | unchanged         | **No**                             |
| Duplicate unique key, `processed_at` null                                                                         | **200**     | no-op                             | unchanged         | **Yes** (same jobId)               |
| Enqueue required but Redis/BullMQ fail                                                                            | **non-200** | row may exist                     | null              | Meta retries                       |

`external_event_id` = Meta `entry[].id` + first messaging `mid` when present; else hash of raw body (stable). **One HTTP body = one row.** `mapInbound` may return many `CanonicalInbound`. Message-level dedupe is `messages` unique `(channel_account_id, external_message_id)` (`12`).

Resolve `channel_account` from `page_id` **or** `ig_user_id` **or** `external_account_id` **or** `authorized_meta_user_id` (§5.3). One Facebook Page may have **two** rows (Messenger + Instagram) — pick by `object` + channel for messaging; deauthorize of the installing user marks **both**. **One POST = one `integration_events` row** even when two accounts match (`channel_account_id` = first match; worker still updates every match).

Do not call adapters, Conversations, or `AIOrchestrator` on this request.

**Replay / debug (no extra status column):** `processed_at` null = not finished (received or in-flight — BullMQ is the processing flag). `processed_at` set = done. Unique `external_event_id` makes Meta retries a no-op insert. Worker failure → job retry then DLQ + `integration.webhook.failed`. Do **not** add `processing_status`.

### 4.4 Worker map (`retry_webhook_processing`)

**Lifecycle Graph objects** (`object=permissions`, page/IG removed) and the **deauthorize `signed_request`** are parsed in **UnifiedMessaging**, not `ChannelAdapter.mapInbound`. Adapters only map `page` / `instagram` / (Phase 2) `whatsapp` messaging payloads. Synthesize `CanonicalInbound` with `eventKind=lifecycle` when needed, then run the table.

Adapter `mapInbound` → for each `CanonicalInbound`:

| `eventKind` / flags                                                 | Action                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`, `isEcho=false`, has text or image                        | Identity + conversation + insert message (`14` §4). Set `channel_accounts.last_inbound_at`. Enqueue score / AI as specified there                                                                                           |
| `isEcho=true`                                                       | Ignore for AI. Do not insert a second copy of our outbound (we already have the row). Optional: match `external_message_id` and leave `sent`                                                                                |
| `delivery`                                                          | If we have `messages.external_message_id`, set `delivery_status=delivered`. No AI                                                                                                                                           |
| `read`                                                              | Ignore (no typing/read UI — Won't)                                                                                                                                                                                          |
| `lifecycle` (app deauthorized, permission revoked, page/IG removed) | §5.4 error path for matching account(s). No Conversations, no AI. Then `processed_at`                                                                                                                                       |
| `other` (postback, reaction, referral, comment, story)              | No Conversations insert. Raw already stored. Then `processed_at`                                                                                                                                                            |
| Image                                                               | Same customer-message insert as the text row when an attachment is present (`content_type=image`). **Not** a second message. Then enqueue `fetch_inbound_media` (jobId `{messageId}:media`) — **not** on the webhook thread |
| Channel missing or status ≠ `active` (and not `lifecycle`)          | No identity, no message, no AI. Still set `processed_at` (`14`). Applies to the **whole** batch                                                                                                                             |

Image-only inbound still creates a message so the inbox shows it (`FR-INT-013`, `15` asks for text).

`fetch_inbound_media`: GET `providerUrl` with page token if required; **SSRF rules in `17` §10** (https only, no private/metadata targets); PUT S3; insert `message_attachments` **ON CONFLICT DO NOTHING** on `(message_id, sort_order)` (`12`). Failure: retry 3 (`14`); inbox can show a broken-image state; do not block AI text turns.

### 4.5 Deauthorize callback (not Graph JSON)

Meta app setting **Deauthorize Callback URL**: `https://hooks.<apex>/api/v1/webhooks/meta/deauthorize` (`13`).

Body is `signed_request`: `base64url(sig).base64url(payload)`. HMAC-SHA256 of the payload with **`META_APP_SECRET`**, timing-safe compare to `sig`. Payload JSON includes `user_id`. Invalid → **401**, no row. Valid → §4.3 (deauthorize row). **200** after persist/enqueue per that table. Do **not** run this through `ChannelAdapter.mapInbound`. Do not parse `signed_request` on `POST /webhooks/meta`.

---
