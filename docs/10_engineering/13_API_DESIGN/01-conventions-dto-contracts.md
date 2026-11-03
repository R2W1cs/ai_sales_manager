# 13 — API Design

| Field           | Value                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `13_API_DESIGN`                                                                                                                                                        |
| Status          | Approved — canonical for HTTP and Socket.IO contracts                                                                                                                  |
| Owner           | Engineering                                                                                                                                                            |
| Audience        | Backend, frontend, AI coding agents                                                                                                                                    |
| Depends on      | `10_ARCHITECTURE.md`, `11_TECH_STACK.md`, `12_DATABASE_DESIGN.md`, `01_PRODUCT_REQUIREMENTS.md`, `18_DEPLOYMENT.md`                                                    |
| Consumed by     | Nest controllers in `apps/api`, Next.js clients in `apps/web`, `14_SYSTEM_DESIGN.md`, `16_INTEGRATION_DESIGN.md`, `17_SECURITY_DESIGN.md`, `31_IMPLEMENTATION_PLAN.md` |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# API Specification`, plus Must FRs in `01` not listed there                                                                    |

---

## 1. Purpose and scope

This document is **canonical for what the Nest API exposes**. If a route, header, status, or DTO field is not here, it does not exist. Add it here first, then implement.

**In scope:** REST `/api/v1` routes, public health/webhook paths, request/response envelopes, auth and tenant headers, idempotency, pagination, money/dates, permission _codes_ per route, Socket.IO path and client event names.

**Out of scope, and where it lives instead:**

| Topic                                                                                                                      | Canonical location               |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Module ownership, who may call whom                                                                                        | `10_ARCHITECTURE.md`             |
| Library versions, JWT lifetimes, Zod/Swagger split                                                                         | `11_TECH_STACK.md`               |
| Tables, columns, enums, JSONB Zod names                                                                                    | `12_DATABASE_DESIGN.md`          |
| State-machine _allowed transitions_, BullMQ, locks, numeric AI rate limits, lead-score weights, reconnect polling interval | `14_SYSTEM_DESIGN.md`            |
| Orchestrator, RAG, prompt assembly, traces internals                                                                       | `15_AI_ARCHITECTURE.md`          |
| Meta HMAC algorithm, OAuth scopes, adapter mapping                                                                         | `16_INTEGRATION_DESIGN.md`       |
| JWT algorithm, cookie flags at the crypto layer, full RBAC enforcement, encryption, erasure                                | `17_SECURITY_DESIGN.md`          |
| Hosts, ALB, ECS                                                                                                            | `18_DEPLOYMENT.md`               |
| Handoff _reasons_ and `handoff_context` keys                                                                               | `06_AI_HUMAN_HANDOFF_RULES.md`   |
| Four KPI _definitions_                                                                                                     | `01_PRODUCT_REQUIREMENTS.md` §15 |

Do not invent GraphQL, tRPC, or a second public host. Do not mount job internals as HTTP.

**References:** `§N` is a section of **this** file. Sibling engineering docs are **filenames** (`11_TECH_STACK.md`, `12_DATABASE_DESIGN.md`, `14_SYSTEM_DESIGN.md`, `15_AI_ARCHITECTURE.md`, `16_INTEGRATION_DESIGN.md`, `17_SECURITY_DESIGN.md`, `18_DEPLOYMENT.md`). This file has its own §11 / §12 / §14 / §16 / §17 / §18 — a bare `` `16` `` does **not** mean Meta HMAC.

OpenAPI JSON is **generated** from Nest controllers (`@nestjs/swagger`; not yet wired — see `42_TECH_DEBT.md`). **Source of truth for request/response shapes is Zod in `packages/shared`**, then this file. Swagger UI: local + staging only; not an unauthenticated production surface (`11_TECH_STACK.md`).

---

## 2. Cross-cutting rules

### 2.1 Base URL and content

| Rule        | Pin                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Public REST | `https://api.<apex>/api/v1/...` (`18`)                                                                                                  |
| JSON        | `Content-Type: application/json; charset=utf-8` unless noted                                                                            |
| Uploads     | S3 presigned `PUT` for images; CSV import posts the file body as JSON. No multipart parser is registered                                |
| Version     | `/api/v1` only in MVP. No unversioned tenant routes                                                                                     |
| CORS        | Allowlist `https://app.<apex>` (and local `http://localhost:3000`). `credentials: true`. No `*`                                         |
| Request id  | Honour `X-Request-Id` if present, otherwise generate. Echoed on the response and bound to pino as `request_id` via Fastify's `genReqId` |

**Request size** (Fastify `bodyLimit`, set on the adapter in `apps/api/src/bootstrap.ts`). Exceeding → **413** `payload_too_large`. Do not rely on the framework default.

`bodyLimit` is process-wide, so it is set to the largest surface below (512 KB, the Meta webhook). The tighter per-surface caps are enforced in the Zod contracts and in `MetaHmacGuard`, not by the adapter.

| Surface                        |      Limit | Notes                                                                                                                                                                 |
| ------------------------------ | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON body                      | **256 KB** |                                                                                                                                                                       |
| `messages.content` / note body |  **10 KB** | Also enforce in Zod                                                                                                                                                   |
| CSV import                     |  **10 MB** | File bytes, not JSON. Enforced in the import service, above the adapter cap                                                                                           |
| Image upload (presigned S3)    |  **10 MB** | Merchant upload; bytes never transit the API. Inbound Meta images are fetched by the **worker** after webhook ack — not this cap                                      |
| Meta webhook raw body          | **512 KB** | **JSON size**, and the value of the adapter `bodyLimit`. HMAC runs on `request.rawBody` (`16` §4.2). Attachments are URLs in the payload (`16_INTEGRATION_DESIGN.md`) |

Frontend `GET /health` is on `app.<apex>`, not this API.

**v1 compatibility** (this document + `packages/shared` Zod). `/api/v1` only in MVP; there is no v2 route.

| Change                                 | Within v1                                                               |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Add optional response field            | Allowed                                                                 |
| Remove or rename a field               | **Forbidden** — needs `/api/v2`                                         |
| Make a required request field optional | Allowed                                                                 |
| Add a required request field           | **Forbidden** — v2                                                      |
| Add an enum value                      | Allowed; clients must treat unknown values as a fallback (do not crash) |
| Remove an enum value                   | **Forbidden** — v2                                                      |
| Change a field’s type or meaning       | **Forbidden** — v2                                                      |

Do not “fix” a DTO in place because a coding agent prefers a new name.

### 2.2 Authentication

Access JWT: **15 minutes**, `Authorization: Bearer <token>` (`11_TECH_STACK.md` §5.2). Payload: `{ "sub": "<user_id>", "typ": "access" }`. **No `business_id` in the access token** — tenant is §2.4.

Refresh JWT: **14 days**, HttpOnly, Secure (staging/prod), `SameSite=Lax`, cookie name **`aisales_refresh`**, `Path=/api/v1/auth`, **host-only** (no `Domain`). Rotated on every successful refresh. Reuse of a revoked token in an active family revokes the family (`12` §5.2; protocol in `17` §3.4).

Never put the refresh token in JSON or in `localStorage`.

**Revocation (no `security_version` column).** Tenant routes are not “JWT-valid for 15 minutes.” Every authenticated tenant call re-loads membership (`removed_at IS NULL`, business not deleted) — that is FR-BIZ-011. A leftover access token cannot read a business the user was removed from.

| Event                 | Refresh tokens                               | Access JWT (15 min)                                                | Socket.IO                                                |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Logout (this session) | Revoke **this family**                       | Stops working at next refresh; `/auth/me` may succeed until expiry | Disconnect this connection                               |
| Password reset        | Revoke **all families** for that `user_id`   | Same; `/auth/me` until expiry is accepted                          | Disconnect all of that user’s sockets                    |
| Member removed        | Unchanged unless last membership (`12` §2.5) | Tenant APIs **403** on the next request                            | **Disconnect** and leave `business:{id}` (this file §14) |
| Business soft-deleted | Unchanged                                    | Tenant APIs **403**                                                | Leave `business:{id}`; disconnect members of that tenant |

Do **not** add `users.security_version` or an access-token denylist in MVP. Instant global kill of access sessions is rotate `BETTER_AUTH_SECRET` (`17` §2). Do not put `business_id` in the access token (OQ-57).

Socket.IO uses the **same access token** (`handshake.auth.token` or `Authorization` header). Re-validate membership on handshake **and** when the user is removed or the business is deleted — do not wait for token expiry (this file §14).

### 2.3 Public vs authenticated

Unauthenticated:

| Method | Path                                 | Why                                              |
| ------ | ------------------------------------ | ------------------------------------------------ |
| `GET`  | `/ready`                             | ALB backend (`18`)                               |
| `GET`  | `/health`                            | Process up (optional on backend)                 |
| `GET`  | `/health/live`                       | Terminus liveness (`11`)                         |
| `POST` | `/api/v1/auth/register`              |                                                  |
| `POST` | `/api/v1/auth/login`                 |                                                  |
| `POST` | `/api/v1/auth/refresh`               | Cookie                                           |
| `POST` | `/api/v1/auth/forgot-password`       | Should FR-AUTH-008                               |
| `POST` | `/api/v1/auth/reset-password`        | Should FR-AUTH-008                               |
| `GET`  | `/api/v1/auth/google`                | Should FR-AUTH-006                               |
| `GET`  | `/api/v1/auth/google/callback`       | Should FR-AUTH-006                               |
| `POST` | `/api/v1/auth/invitations/accept`    | FR-AUTH-011                                      |
| `GET`  | `/api/v1/integrations/meta/callback` | OAuth redirect                                   |
| `GET`  | `/api/v1/webhooks/meta`              | Meta hub verify                                  |
| `POST` | `/api/v1/webhooks/meta`              | Meta inbound — signature, not JWT                |
| `POST` | `/api/v1/webhooks/meta/deauthorize`  | Meta app deauthorize — `signed_request`, not JWT |

Everything else under `/api/v1` requires a valid access token **and** a resolved tenant (§2.4), except:

- `GET /api/v1/auth/me` — token only; returns memberships so the client can pick a business
- `POST /api/v1/auth/logout` — access token or still-valid refresh cookie; no tenant
- `POST /api/v1/businesses` — authenticated; **no** `X-Business-Id` (creating the workspace)

### 2.4 Tenant resolution (FR-AUTH-007, FR-BIZ-006)

Header: **`X-Business-Id: <uuid>`**.

1. Load membership: `business_members` for `(user_id, business_id)` with `removed_at IS NULL`, and `businesses.deleted_at IS NULL`.
2. Else **403** `forbidden` (do not leak whether the id exists).
3. If the header is **omitted**: exactly one active membership → use it; **zero** → **403** `no_business`; **more than one** → **400** `business_required`.

Do not trust a client-supplied `business_id` in the JSON body as the tenant. Body ids are resources _inside_ the resolved tenant. Path `:businessId` on workspace routes must equal the resolved tenant or **403**.

Every query is `WHERE business_id = $resolved`. Returning another tenant’s row is a defect, not a 404 vs 403 bikeshed — use **404** for missing-in-tenant, **403** for wrong-tenant / missing permission.

### 2.5 Idempotency (NFR-REL-04)

Header: **`Idempotency-Key`** (UUID or opaque string ≤ 128 chars).

| Surface                                                                                                                                                                                                           | Required  | Storage                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------- |
| `POST /api/v1/orders`                                                                                                                                                                                             | **Yes**   | `orders.idempotency_key` unique `(business_id, key)` |
| `POST .../conversations/:id/messages`                                                                                                                                                                             | **Yes**   | `messages.idempotency_key` unique                    |
| Other mutating POSTs that create or transition (takeover, resume-ai, close, confirm-order, assign, approve, suggest, merge, invitations, businesses, playground, import upload, import confirm, channel-accounts) | **Yes**   | `idempotency_keys` (`12` §5.11)                      |
| Webhooks                                                                                                                                                                                                          | No header | `integration_events` unique (`12` §8.3)              |
| GET / PATCH-as-read                                                                                                                                                                                               | No        |                                                      |

Behaviour:

- Same key + same body hash → replay stored **status + body** (original 200 / 201 / **202** / 204). **No** second AI run, order, send, import, or stock reserve.
- Same key + **different** body → **409** `idempotency_key_conflict`.
- Missing key on a required POST → **400** `validation_error`.
- Keys expire **24h** (`12` §2.12). After expiry a retry is a new request.

Do not use Redis `conversation:{id}:processing` as an idempotency store.

### 2.6 Error envelope

One shape. Do not return Nest/Prisma dumps.

```json
{
  "error": {
    "code": "validation_error",
    "message": "Human-readable English; UI translates",
    "details": {}
  },
  "request_id": "uuid"
}
```

`code` is a closed English snake_case set. **`retryable` and `hint` are not JSON fields** — the client maps them from `code`. Do not add `severity` to the body (pino owns that).

| code                          | HTTP | retryable | hint            |
| ----------------------------- | ---- | --------- | --------------- |
| `unauthorized`                | 401  | no        | `reauth`        |
| `forbidden`                   | 403  | no        | `none`          |
| `no_business`                 | 403  | no        | `none`          |
| `not_found`                   | 404  | no        | `none`          |
| `validation_error`            | 400  | no        | `none`          |
| `business_required`           | 400  | no        | `pick_business` |
| `conflict`                    | 409  | no        | `none`          |
| `idempotency_key_conflict`    | 409  | no        | `none`          |
| `invalid_transition`          | 409  | no        | `none`          |
| `pending_order_blocks_resume` | 409  | no        | `none`          |
| `ambiguous_pending_order`     | 409  | no        | `none`          |
| `quota_exceeded`              | 403  | no        | `upgrade`       |
| `rate_limited`                | 429  | **yes**   | `retry_after`   |
| `feature_disabled`            | 403  | no        | `none`          |
| `activation_not_ready`        | 422  | no        | `none`          |
| `ai_paused`                   | 403  | no        | `upgrade`       |
| `webhook_invalid_signature`   | 401  | no        | `none`          |
| `oauth_expired`               | 400  | no        | `reauth`        |
| `payload_too_large`           | 413  | no        | `none`          |
| `not_implemented`             | 501  | no        | `none`          |
| `internal_error`              | 500  | **yes**   | `retry`         |
| `service_unavailable`         | 503  | **yes**   | `retry_after`   |

Field errors: `details.fields` = `{ "<path>": ["message"] }` (BAC-3).

Activation failure (FR-BIZ-025): `activation_not_ready` with `details.unmet_gates`: `["G1","G2",...]` — never a generic 403.

Quota: `details.metric` is one of `seats` | `channel_accounts` | `ai_messages_per_month` | `max_ai_replies_per_month` | `max_conversations` | `monthly_ai_budget_usd`.

### 2.7 Pagination

**Cursor**, not page numbers.

| Query   | Default | Max |
| ------- | ------- | --- |
| `limit` | 50      | 100 |

Response:

```json
{ "data": [], "next_cursor": null }
```

`next_cursor` is opaque (base64url). Clients must not parse it. Do not use `OFFSET`. Do not sort by UUIDv4 alone.

**Time-ordered lists** (messages, orders, audit-logs, customers by `created_at`): cursor is `{ "t": "<created_at ISO>", "id": "<uuid>" }`. Next page toward the past:

```sql
ORDER BY created_at DESC, id DESC
WHERE (created_at, id) < (:cursor_t, :cursor_id)
LIMIT :limit
```

Message history (FR-CONV-007): first open runs that query (latest page); the UI **reverses** the page so the thread reads oldest→newest; further cursors prepend older rows.

**Inbox `sort=sales_priority`:** do **not** use `(created_at, id)`. The cursor must encode the sort tuple from §6.1 (`human_needed`, `handoff_priority`, `handoff_at`, `lead_temperature`, `lead_score`, `last_message_at`, `id`). Comparator is lexicographic on that tuple. Using the messages SQL here is a defect (FR-CONV-031, FR-LEAD-009).

**Notifications:** sort `handoff_priority` then `created_at DESC, id DESC` (FR-NOTIF-003). Cursor encodes `(priority, t, id)` — not `(created_at, id)` alone.

### 2.8 Money, dates, enums, language

| Topic                 | Pin                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money                 | JSON **string** matching Prisma `Decimal(12,3)`, e.g. `"12.540"`. Never a JS number. Display `12 540 DT` is UI-only                                         |
| Currency              | `TND` on the business; order snapshots copy it                                                                                                              |
| Dates                 | ISO-8601 timestamptz in UTC. Period query params `from` / `to` are **calendar dates in the business timezone**, inclusive start, exclusive end+1 (`01` §15) |
| Enums                 | Request: exact strings from `12` §3; unknown → 400. Response: clients must tolerate a **new** enum value added later in v1 (§2.1) without crashing          |
| API `message` strings | English. Merchant UI is French (`next-intl`)                                                                                                                |

### 2.9 Rate limits

| Surface                                       | Mechanism                                                           | Pin                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /auth/login`, register, forgot-password | `@nestjs/throttler`                                                 | Per IP **and** per email: **5 / minute**. FR-AUTH-009                                    |
| Public webhooks                               | Fast path only; invalid HMAC does **not** persist or enqueue (`16`) | Numeric flood caps in `14_SYSTEM_DESIGN.md`                                              |
| AI turns / suggestions                        | Redis sliding windows (`11` §7.1)                                   | **Numbers in `14_SYSTEM_DESIGN.md`**. HTTP: `429` / `ai_paused` when over plan or budget |

`Retry-After` on 429 (seconds).

### 2.10 Health (not under `/api/v1`)

| Path               | Meaning                                                              | Auth   |
| ------------------ | -------------------------------------------------------------------- | ------ |
| `GET /ready`       | Postgres **and** Redis reachable. **ALB matcher for backend** (`18`) | Public |
| `GET /health/live` | Process up, no deps                                                  | Public |
| `GET /health`      | Same as live on backend (optional)                                   | Public |

Implement `/ready` as the Terminus readiness check. Do not make `/health/ready` a second ALB target. Worker has no HTTP.

### 2.11 Permission codes

Seed `permissions.code` with this closed list (`12` §5.6). `17` owns enforcement internals. Merchant UI may label Employee **Agent**; the code stays `employee`.

| code                  | Owner | Admin | Employee                       |
| --------------------- | ----- | ----- | ------------------------------ |
| `billing.manage`      | ✓     | —     | —                              |
| `business.delete`     | ✓     | —     | —                              |
| `usage.read`          | ✓     | —     | —                              |
| `members.manage`      | ✓     | ✓     | —                              |
| `business.write`      | ✓     | ✓     | —                              |
| `integrations.manage` | ✓     | ✓     | —                              |
| `catalog.write`       | ✓     | ✓     | —                              |
| `rules.write`         | ✓     | ✓     | —                              |
| `knowledge.write`     | ✓     | ✓     | —                              |
| `ai.configure`        | ✓     | ✓     | —                              |
| `ai.playground`       | ✓     | ✓     | —                              |
| `ai.traces.read`      | ✓     | ✓     | —                              |
| `flags.write`         | ✓     | ✓     | —                              |
| `customers.merge`     | ✓     | ✓     | —                              |
| `customers.export`    | ✓     | ✓     | —                              |
| `customers.erase`     | ✓     | ✓     | —                              |
| `audit.read`          | ✓     | ✓     | —                              |
| `analytics.read`      | ✓     | ✓     | ✓ (same four figures; no cost) |
| `inbox.read`          | ✓     | ✓     | ✓                              |
| `inbox.write`         | ✓     | ✓     | ✓                              |
| `orders.write`        | ✓     | ✓     | ✓                              |
| `customers.write`     | ✓     | ✓     | ✓                              |

Missing permission → **403** `forbidden`. Do not hide the route.

### 2.12 Request deadlines

| Surface        | Pin                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON / REST    | **15 seconds**. Prefer failing over hanging. ALB idle **4000s** is for Socket.IO (`18`), not an excuse to hold REST                                       |
| Socket.IO      | Not 15s. Engine + ALB idle as in `18`                                                                                                                     |
| Webhook `POST` | Persist + enqueue `retry_webhook_processing` + **200** with p95 **< 500 ms** (NFR-PERF-01), still under the 15s cap. Map/LLM stay off this request (`14`) |
| Takeover       | Sync, target **< 500 ms** (NFR-PERF-04c)                                                                                                                  |

**Do not keep HTTP open** for LLM generation, CSV parse/import, reindex, or embedding jobs. Those return **202** `{ "jobId" }` and/or the resource id. The client shows a pending state and refetches or waits on Socket.IO (NFR-PERF-04d for suggestions: result visible **< 5 s**, not a 5 s HTTP hold).

Sync **201/200** is allowed when the handler only writes Postgres and enqueues (human send, approve, order create). Waiting on Meta or Gemini inside the request is a defect.

---

## 3. Resource DTOs (JSON)

Field names = API = `packages/shared` camelCase. Column mapping is `12`. Omit secrets: `password_hash`, token hashes, provider credentials, raw webhook bodies (except the webhook ingest itself).

**Money strings** and **ISO dates** as §2.8. JSONB blobs use the Zod export named in `12` §14.

### 3.1 User and membership

`User`: `id`, `email`, `name`, `emailVerifiedAt`, `createdAt`.

`Membership`: `businessId`, `role` (`owner` \| `admin` \| `employee`), `joinedAt`, `lastActiveAt`.

`Session`: `{ user, memberships: Membership[], accessToken, tokenType: "Bearer", expiresIn: 900 }` — `accessToken` only on login/register/refresh/accept-invite/Google callback.

### 3.2 Business

`Business`: `id`, `name`, `industry`, `country`, `defaultLanguage`, `timezone`, `currency`, `createdAt`, `updatedAt`, `deletedAt`. No `settings` keys in MVP (`BusinessSettingsSchema` empty strict).

`Onboarding`: flags from `business_onboarding` **plus computed** `aiActivationReady: boolean` and `unmetGates: ("G1"\|"G2"\|"G3"\|"G4"\|"G5")[]` (`01` §14). Do not persist `aiActivationReady`.

### 3.3 Conversation list/detail

List row (FR-CONV-004, FR-CONV-034):

`id`, `status`, `source`, `channel` (`instagram` \| `messenger` \| `whatsapp` \| `playground`), `aiEnabled`, `assignedUserId`, `handoffPriority`, `escalationReason`, `handoffAt`, `leadScore`, `leadTemperature`, `lastMessageAt`, `lastMessagePreview`, `unread` (true when `staff_read_at` is null or `< last_message_at`), `isTest`, `customer` (`id`, `name`, `phone`), `pendingOrder` (`id`, `status`, `total`, `currency`) **or `null`**.

`pendingOrder` is loaded from Orders: `conversation_id = id AND status = PENDING_CONFIRMATION`. **Not** `conversations.order_id` (does not exist). If more than one pending row, return the **oldest** and set `pendingOrderAmbiguous: true` (staff must confirm by order id).

Detail adds: `summary`, `handoffContext` (`HandoffContextSchema` or null), `collectedFields`, `leadScoreFactors`, `channelAccountId`, `customer` (full `Customer`), `assignedUser` (`id`, `name`).

Employees receive `handoffContext` (briefing). They do **not** receive decision traces (`GET …/decision-traces` requires `ai.traces.read`).

### 3.4 Message

`id`, `conversationId`, `direction`, `senderType`, `senderUserId`, `content`, `contentType`, `deliveryStatus`, `aiMetadata` (null if not AI outbound), `attachments` (`id`, `url`, `contentType`, `sizeBytes`), `createdAt`, `externalMessageId` (null if not yet accepted by Meta).

`deliveryStatus` (`12` `MessageDeliveryStatus`): `draft` \| `queued` \| `sent` \| `delivered` \| `failed`.

Inbound customer: `sent`. `approval_required` / `draft_only` AI output: insert `draft`. Approve or human send: `queued` → Integrations → `sent` or `failed`. `delivered` only if the provider returns a receipt; otherwise remain `sent`.

Internal notes are **not** messages.

### 3.5 Order

`id`, `customerId`, `conversationId`, `status`, `paymentStatus`, `currency`, `subtotal`, `deliveryFee`, `total` (strings), `customerSnapshot`, `deliveryAddress`, `createdByType`, `createdByUserId`, `isTest`, `orderConfirmedAt`, `cancelledAt`, `completedAt`, `createdAt`, `items[]` (`variantId`, `quantity`, `unitPrice`, `nameSnapshot`, `skuSnapshot`, `attributesSnapshot`).

No payment-link fields.

### 3.6 Customer

`id`, `name`, `phone`, `email`, `address`, `language`, `preferences`, `lifecycleStage`, `confirmedOrderCount`, `lastConfirmedOrderAt`, `tags[]`, `identities[]` (`platform`, `platformUserId`, `verifiedAt` — no provider tokens), `isTest`. Skip rows with `mergedIntoCustomerId` set except on an explicit merge-audit GET.

---
