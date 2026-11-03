## 13. Notifications, analytics, usage, flags, audit

| Method  | Path                             | Perm              | Notes                                                                                                                                                                                                                                                                                                                                                        |
| ------- | -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`   | `/api/v1/notifications`          | Member (own rows) | Query: `unread=true`, `cursor`. Sort priority then recency (FR-NOTIF-003)                                                                                                                                                                                                                                                                                    |
| `PATCH` | `/api/v1/notifications/:id/read` | Own               | **204**                                                                                                                                                                                                                                                                                                                                                      |
| `POST`  | `/api/v1/notifications/read-all` | Own               | **204**                                                                                                                                                                                                                                                                                                                                                      |
| `GET`   | `/api/v1/analytics/overview`     | `analytics.read`  | Query: `from`, `to` (business TZ dates). **Four KPIs only** from `analytics_daily` sums (`01` §15). Include `messagesAi` / `messagesHuman` as a **breakdown** of messages handled, not a fifth tile. `handoffsByReason` object. `conversion` = `conversion_confirmed / conversion_ai_pending` (null if denom 0). Employees see the same numbers. **No cost** |
| `GET`   | `/api/v1/usage`                  | `usage.read`      | Current period vs `plans.limits`. Warnings at 80% / 95% (FR-BILL-006). Owner only                                                                                                                                                                                                                                                                            |
| `GET`   | `/api/v1/feature-flags`          | Member            | Resolved flags (platform default ⊕ business override)                                                                                                                                                                                                                                                                                                        |
| `PATCH` | `/api/v1/feature-flags/:feature` | `flags.write`     | Body: `{ "enabled": true }`. Closed keys: `whatsapp_enabled`, `voice_agent`, `advanced_analytics`, `vip_auto_handoff`, `ai_shadow_mode`. Unknown key → 400                                                                                                                                                                                                   |
| `GET`   | `/api/v1/audit-logs`             | `audit.read`      | Should FR-AUD-002. Query: `from`, `to`, `entity_type`, `cursor`. No secrets in payload                                                                                                                                                                                                                                                                       |

Do not add custom-report or export-builder routes (`advanced_analytics` is a flag, not a fifth KPI).

---

## 14. Realtime (Socket.IO)

| Pin          | Value                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host         | `api.<apex>` — **same** backend task as REST (`18`). No fourth ECS service                                                                                                                                                                                                                                                                        |
| Path         | **`/socket.io`** (engine default; ALB + Cloudflare skip-challenge). Brain Dump `WS /realtime` and any `/realtime` mention in `11` are **superseded**                                                                                                                                                                                              |
| Auth         | Access JWT + **`businessId`** in handshake (`17`). Reject → disconnect. Re-check membership when emitting to a room if the connection is older than the access TTL **or** on a membership/business event — do not treat handshake as forever                                                                                                      |
| Rooms        | Server joins only: `business:{businessId}`, `user:{userId}`, and `conversation:{conversationId}` while that member has the thread open (server tracks; client cannot `join`)                                                                                                                                                                      |
| Invalidation | Member `removed_at` set → disconnect that socket from `business:{id}` and that tenant’s `conversation:*` rooms. Business `deleted_at` set → disconnect every member in `business:{id}`. Role change → re-authorize (do not keep handshake permissions for the life of the socket). Password reset → disconnect **all** sockets for that `user_id` |
| Direction    | **Server → client** for domain data. **Occupancy only:** client may emit `thread:open` / `thread:close` `{ conversationId }` — server authorizes and joins/leaves `conversation:{id}` (`14_SYSTEM_DESIGN.md` §12). No typing, no domain writes                                                                                                    |
| SoT          | REST. On reconnect the client **refetches** list + open thread from last cursor (FR-RT-003–004)                                                                                                                                                                                                                                                   |
| Fan-out      | `@socket.io/redis-adapter` (`11`)                                                                                                                                                                                                                                                                                                                 |

Client events (translator only; payloads are ids + small fields, not full transcripts):

| Client event              | When                     | Client should                  |
| ------------------------- | ------------------------ | ------------------------------ |
| `conversation.message`    | message persisted        | Append / refetch thread if gap |
| `conversation.status`     | state changed            | Update badge                   |
| `conversation.handoff`    | entered `HUMAN_REQUIRED` | Move to Needs me               |
| `conversation.score`      | lead score recomputed    | Temperature badge              |
| `conversation.suggestion` | suggestion draft ready   | Suggestion panel               |
| `notification.new`        | in-app notification row  | Bell                           |

Do not put fields on the socket that are not on REST. Delivery / room occupancy internals: `14_SYSTEM_DESIGN.md`.

SSE is a fallback only if the ALB cannot upgrade — not the happy path (`11`). Socket.IO polling transport is the built-in degrade; the UI may also poll `GET /conversations` when disconnected (FR-RT-005).

---

## 15. Explicitly not in the public API (MVP)

| Item                                                 | Why                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/ai/respond`                            | In-process worker only                                                                                      |
| GraphQL / tRPC / gRPC                                | REST                                                                                                        |
| Payment intents, payment links, Stripe               | Phase 4                                                                                                     |
| Fulfilment `PROCESSING` / `SHIPPED` / `DELIVERED`    | FR-ORD-014                                                                                                  |
| Pipeline drag / `PATCH /pipeline`                    | FR-CONV-054 Won't                                                                                           |
| Snooze                                               | Could                                                                                                       |
| MFA                                                  | Won't                                                                                                       |
| Custom roles                                         | Won't                                                                                                       |
| Unofficial WhatsApp                                  | Forbidden                                                                                                   |
| Swagger UI on production                             | `11`                                                                                                        |
| Client-chosen Socket.IO rooms                        | FR-RT-002                                                                                                   |
| `conversations.order_id` anywhere                    | Dropped in `12`                                                                                             |
| Fifth analytics tile / cost on `/analytics/overview` | `01` §15, OQ-08                                                                                             |
| Worker HTTP                                          | `18`                                                                                                        |
| `users.security_version` / access-JWT denylist       | MVP: membership check + session revoke. Nuclear: rotate `BETTER_AUTH_SECRET` (`17`)                         |
| `billing.manage` routes (Stripe, self-serve upgrade) | Code is seeded; no HTTP surface until Phase 4. Owner usage is `GET /usage` + `GET /ai/usage` (`usage.read`) |

---

## 16. How coding agents must use this

1. Add the Zod schema in `packages/shared`, then the Nest controller, then Swagger decorators. Do not hand-write OpenAPI YAML as source of truth.
2. Every handler: auth (unless §2.3) → tenant (§2.4, skip for `/auth/me`, logout, `POST /businesses`) → permission code (§2.11) → Zod body → module **service** (not another module’s Prisma).
3. Mutating POSTs listed in §2.5 require `Idempotency-Key`.
4. Confirm-order and inbox “open order” go through `OrderService` and `orders.conversation_id`.
5. Do not mount `POST /ai/respond`.
6. Do not return JS numbers for money.
7. Do not implement `/realtime` as a second engine path.
8. WhatsApp routes return `feature_disabled` until the flag is on; still ship the stub.
9. `GET /analytics/overview` reads `analytics_daily` only — no live scans (FR-ANL-003).
10. Invalid HMAC on Meta POST is **401**, **no row**, no enqueue (`16`). Do not persist a “signature failed” event.
11. If a field is not in `12`, do not sneak it into a DTO as “API-only state” stored in Redis.
12. Enforce §2.1 size limits; 413 `payload_too_large`. Do not leave Express at 100 KB.
13. Do not hold REST for Gemini/Meta/CSV parse. **202** for suggest, playground, import, reindex.
14. Inbox cursor is the sales-priority tuple, not `(created_at, id)`.
15. Do not add `retryable` / `severity` to the error JSON. Map from `code`.
16. Disconnect sockets on member removal, business delete, and password reset — handshake is not a lifetime grant.
17. Occupancy emits are `thread:open` / `thread:close` only. No client `join`, no typing, no domain writes on the socket.
18. `POST /customers/:id/erase` is Owner/Admin only (`customers.erase`). Do not `DELETE FROM customers`.

---

## 17. Open questions

| #                 | Question                                  | Working answer                                                                                                                                                | Owner       | Revisit                      |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------- |
| OQ-56             | Message delivery / draft persistence      | **Column** `messages.delivery_status` in `12` (`MessageDeliveryStatus`). Do not use null `external_message_id` as draft (playground also has null)            | Engineering | Schema + this file — decided |
| OQ-57             | Access JWT contains `business_id`?        | **No.** `X-Business-Id` + membership check so switching tenant does not require a new access token                                                            | Engineering | Decided                      |
| OQ-58             | Access-JWT denylist / `security_version`? | **Not in MVP.** Tenant kill = membership row. Password reset = revoke sessions + disconnect sockets. Nuclear access kill = rotate `BETTER_AUTH_SECRET` (`17`) | Engineering | Decided                      |
| _(none reopened)_ | Socket path `/realtime` vs `/socket.io`   | **`/socket.io`** per `18`                                                                                                                                     | Engineering | Decided                      |

Existing OQ-40, 42, 43, 53, 54, 55 stay in `11`/`12`. Do not reopen them here.

---

## 18. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# API Specification`, `# User Permission Matrix`, Sales Command Center realtime
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` — FRs, §14 gates, §15 KPIs
- `docs/10_engineering/10_ARCHITECTURE.md`
- `docs/10_engineering/11_TECH_STACK.md`
- `docs/10_engineering/12_DATABASE_DESIGN.md`
- `docs/10_engineering/14_SYSTEM_DESIGN.md` — transitions, jobs, occupancy
- `docs/10_engineering/15_AI_ARCHITECTURE.md` — orchestrator (not HTTP)
- `docs/10_engineering/16_INTEGRATION_DESIGN.md` — HMAC, OAuth, adapters
- `docs/10_engineering/17_SECURITY_DESIGN.md` — JWT, RBAC, erasure
- `docs/10_engineering/18_DEPLOYMENT.md`
- `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md` — briefing shape
