## 6. Locks

| Lock              | Key                            | TTL                 | Purpose                                                                                  |
| ----------------- | ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------- |
| Conversation turn | `conversation:{id}:processing` | **30s**, Lua-extend | One **inbound AI turn**, suggest, or playground job per thread (shared lock — see OQ-60) |
| Stock             | **none in Redis**              | —                   | `SELECT … FOR UPDATE` on the variant (`12` §6.5)                                         |

Value is a **random token** (UUIDv4), not a bare flag:

```
SET conversation:{id}:processing {token} NX EX 30
```

If `NX` fails: BullMQ `delay` 2s and retry (counts toward `attempts`). Heartbeat every **10s** and `finally` release **must** be compare-and-set (Lua: `if GET == token then EXPIRE|DEL`). A `DEL` without the token deletes the next worker’s lock — that is a defect.

TTL stays **30s** (Brain Dump / `05` / `11`, NFR-PERF-02 p95). Heartbeat covers a turn that runs past 30s. A frozen worker must **lose** the lock; do not set TTL 60s or a 45s “max turn” that exceeds the p95 budget.

Before persisting an outbound or calling `transition`, re-read the token. Mismatch → abort writes (another worker owns the thread).

Do not use this lock as an idempotency store (`13` §2.5).

---

## 7. Jobs (BullMQ)

`attempts: 3` (NFR-REL-03: three **runs**, not three extra retries). Built-in BullMQ exponential only — **no custom backoff**:

`backoff: { type: "exponential", delay: 5000 }` → delay = `5000 * 2^(attemptsMade - 1)` → **5s then 10s**, then DLQ + alert (`18` BullMQ alarms).

Do not write 5s / 20s / 80s. That would be `4^(n-1)` and needs a custom strategy we are not adding.

Processors live in the **owning module** (`10`). Queue name is not ownership (OQ-41: `score_lead` stays on `ai`).

| Queue           | Job                        | Trigger                                                                                             | jobId / uniqueness                                                                      | Owner module           |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| `ai`            | `process_inbound_message`  | `message.received` when AI should run                                                               | `{conversationId}:{inboundMessageId}`                                                   | AI                     |
| `ai`            | `send_ai_reply`            | after generation in `auto_send`                                                                     | `{outboundMessageId}`                                                                   | AI → Integrations      |
| `ai`            | `generate_suggestion`      | `POST …/suggest`                                                                                    | `{conversationId}:suggest:{idempotencyKey}`                                             | AI                     |
| `ai`            | `summarize_conversation`   | enter `HUMAN_REQUIRED`, takeover, or >10 new messages before human open (`FR-CONV-019`)             | `{conversationId}:summary:{handoffAt or seq}`                                           | AI                     |
| `ai`            | `score_lead`               | §10.3                                                                                               | `{conversationId}:score:{trigger}:{yyyy-mm-ddTHH}` (hourly bucket) or `:nightly:{date}` | Conversations          |
| `embeddings`    | `index_document`           | knowledge save                                                                                      | `{documentId}:{contentHash}`                                                            | Products               |
| `embeddings`    | `reindex_business`         | `POST /ai/reindex`, successful import                                                               | `{businessId}:reindex:{runId}`                                                          | Products               |
| `catalog`       | `validate_import`          | `POST /products/import`                                                                             | `{importId}:validate`                                                                   | Products               |
| `catalog`       | `run_import`               | `POST /products/import/:id/confirm`                                                                 | `{importId}:run`                                                                        | Products               |
| `integrations`  | `deliver_outbound`         | queued message                                                                                      | `{messageId}`                                                                           | Integrations           |
| `integrations`  | `retry_webhook_processing` | after `integration_events` insert; also sweep `processed_at IS NULL` AND `created_at < now() - 30s` | `{integrationEventId}`                                                                  | Integrations           |
| `integrations`  | `fetch_inbound_media`      | inbound image after message insert (`16`)                                                           | `{messageId}:media`                                                                     | Integrations           |
| `integrations`  | `check_channel_tokens`     | cron daily                                                                                          | `{channelAccountId}:{date}`                                                             | Integrations           |
| `analytics`     | `rollup_daily`             | cron 01:10 business TZ                                                                              | `{businessId}:{day}`                                                                    | Analytics              |
| `billing`       | `sync_usage_aggregates`    | cron hourly                                                                                         | `{businessId}:{hour}`                                                                   | Analytics / Businesses |
| `notifications` | `notify_handoff`           | `HUMAN_REQUIRED` **except** `purchase_handoff`                                                      | dedupe via `notifications.dedupe_key`                                                   | Notifications          |
| `notifications` | `notify_order_request`     | `order.pending_confirmation`                                                                        | same                                                                                    | Notifications          |
| `notifications` | `notify_hot_lead`          | score crosses `lead_hot_min` upward                                                                 | same; collapse 10 min (`12`)                                                            | Notifications          |
| `maintenance`   | `expire_reservations`      | cron every 1 min                                                                                    | singleton per env                                                                       | Products               |
| `maintenance`   | `auto_close_inactive`      | cron daily per TZ                                                                                   | `{businessId}:{date}`                                                                   | Conversations          |
| `maintenance`   | `sweep_retention`          | cron daily                                                                                          | singleton                                                                               | Platform — `12` §2.12  |

`catalog` and `maintenance` are first-class queues. `11` §7.2 must stay identical to this table.

Do not enqueue `process_inbound_message` from the webhook HTTP handler. The worker does that only when §4 step 5 is true. Duplicate `jobId` → BullMQ no-op (job already exists).

---

## 8. Domain events

In-process EventEmitter after commit, then enqueue. Payloads: ids + small fields, always `businessId`. Handlers are idempotent.

**Durability caveat (MVP):** only the **Meta webhook path** is durable via `integration_events` + `processed_at` + sweep (`§4`). In-process domain events (`order.confirmed`, `lead.score_changed`, `usage.recorded`, …) are **best-effort**: crash after Postgres commit but before emit/enqueue can drop a side effect. Handlers must be safe to miss once (idempotent jobs, nightly sweeps, refetch-on-open). Do not add Kafka or `outbox_events` for MVP (OQ-42). Critical money/order paths still land in Postgres first; notifications and realtime may lag until retry or poll.

| Event                        | Producer                         | Consumers                                                                                          |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `message.received`           | Conversations                    | `process_inbound_message`, `score_lead`, Realtime, Analytics                                       |
| `message.sent`               | Integrations (provider accepted) | Analytics, Realtime                                                                                |
| `conversation.state_changed` | Conversations                    | Analytics, `notify_handoff`, `score_lead`, Realtime `conversation.status` / `conversation.handoff` |
| `conversation.updated`       | Conversations                    | Realtime list (preview, assignee)                                                                  |
| `ai.response.generated`      | AI                               | `send_ai_reply` or draft UI; evaluation (`15`)                                                     |
| `ai.escalation.requested`    | AI / Conversations               | same as state_changed into `HUMAN_REQUIRED` — do not double-notify                                 |
| `order.created`              | Orders                           | Analytics                                                                                          |
| `order.pending_confirmation` | Orders                           | `notify_order_request`, `score_lead`, Realtime                                                     |
| `order.confirmed`            | Orders                           | Conversations → `ORDER_CONFIRMED`, `score_lead`, Analytics                                         |
| `order.cancelled`            | Orders                           | Products release, `score_lead`, Conversations (no auto-resume)                                     |
| `lead.score_changed`         | Conversations                    | Realtime `conversation.score`, `notify_hot_lead` if crossed hot                                    |
| `usage.recorded`             | Billing path                     | limit enforcement                                                                                  |
| `integration.webhook.failed` | Integrations                     | alert                                                                                              |

No `conversations.order_id`. Inbox pending order is `OrderService` (`12`, `13`).

Drop brain-dump `order.handoff.completed` — `state_changed` + `order.pending_confirmation` cover it.

Notification **types** (`12`): `ORDER_REQUEST` (pending order), `HANDOFF` (complaint / refund / angry — `06` triggers in that family), `ESCALATION` (low confidence, policy_conflict, integration_failure, `ai_timeout`), `HOT_LEAD`. Confirming an order does **not** invent a fifth type. `notify_handoff` **skips** `purchase_handoff` (already `ORDER_REQUEST`).

Dedupe: `notifications.dedupe_key` hour bucket (`12` §13.1). At most one per conversation per type per hour.

---

## 9. Rate limits

Auth HTTP limits stay in `13` §2.9 (5/min login). This section is **AI and channel**.

Redis sliding windows (`11` §7.1). Log hits as `ai_actions` `action_type=rate_limited` (FR-OBS-008).

| Scope                          | Key                                   |                                                                  Limit | Action                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per customer identity          | `rl:identity:{customerIdentityId}:5m` |                                                 **30** inbound / 5 min | Delay `process_inbound_message` (queue, do not drop). At most one customer-visible slowdown line per identity per hour if we send anything; prefer **queue silently** if a warning would violate grounding |
| Per customer identity          | `rl:identity:{customerIdentityId}:1h` |                                               **100** inbound / 1 hour | Skip AI for the rest of the hour; inbound still persists; notify Owner/Admin `ESCALATION`. **Do not** add a 16th `escalation_reason` and do **not** force `HUMAN_REQUIRED`                                 |
| Per business burst             | `rl:business:{businessId}:1m`         |                                              **60** AI replies / 1 min | Delay `send_ai_reply` / `deliver_outbound`                                                                                                                                                                 |
| Per business month             | `usage_aggregates` vs `plans.limits`  |                            plan cap / optional `monthly_ai_budget_usd` | Hard: skip AI auto-reply globally for the tenant; humans continue; Owner notified (FR-BILL-007). Soft warn 80% / 95%                                                                                       |
| Per conversation               | lock §6                               |                                                               1 AI job |                                                                                                                                                                                                            |
| Per `channel_account` outbound | BullMQ limiter                        | Messenger **20**/s, Instagram **10**/s (`16_INTEGRATION_DESIGN.md` §7) | Never drop without DLQ                                                                                                                                                                                     |

Do not copy Graph field names into Conversations. HMAC/OAuth live in `16_INTEGRATION_DESIGN.md`.

WhatsApp conversation-start meter: Phase 2. Schema already has `UsageMetric`.

---

## 10. Lead scoring

Deterministic arithmetic. **Never** an LLM (FR-LEAD-002). Visible to Employees (FR-LEAD-008). Not a probability (FR-LEAD-007).

Processor: Conversations module, queue `ai` (OQ-41). Reads Conversations rows + **service calls** (`OrderService.hasPending`, `CustomerService.flags`). No `JOIN` to `orders` / `customers` / `ai_actions`.

### 10.1 Signals (MVP weights)

Clamp 0–100. Persist applied points in `lead_score_factors` (`LeadScoreFactorsSchema`).

| Signal                                           | Points | Source (via)                     |
| ------------------------------------------------ | ------ | -------------------------------- |
| `purchase_intent` classified this thread         | +40    | `conversations.last_intent`      |
| Order `PENDING_CONFIRMATION` on this thread      | +30    | `OrderService`                   |
| `price_question` or `availability_check`         | +15    | `last_intent`                    |
| Customer has phone or address                    | +10    | `CustomerService`                |
| Specific variant in `collected_fields`           | +10    | `conversations.collected_fields` |
| Returning customer (`confirmed_order_count ≥ 1`) | +10    | `CustomerService`                |
| VIP tag                                          | +15    | `CustomerService`                |
| Bulk / large quantity in `collected_fields`      | +10    | `collected_fields`               |
| Message in last 30 minutes                       | +5     | `last_message_at`                |
| No customer inbound for > 48h                    | −20    | `last_message_at` + last inbound |

Do not add ML features. Changing a weight is this file + tests, not a prompt tweak. Do not add `conversation_scoring_snapshot` / `lead_features` in MVP — nightly is non-`RESOLVED` rows only.

### 10.2 Temperature

From `ai_settings.lead_hot_min` (default **80**) and `lead_warm_min` (default **50**):

| Band   | Rule                                    |
| ------ | --------------------------------------- |
| `hot`  | `score >= lead_hot_min`                 |
| `warm` | `lead_warm_min <= score < lead_hot_min` |
| `cold` | `score < lead_warm_min`                 |

Write `conversations.lead_temperature` for the inbox index (`12`).

### 10.3 When to recompute (FR-LEAD-004)

`score_lead` on: `message.received`, `conversation.state_changed`, `order.pending_confirmation`, `order.confirmed`, `order.cancelled`, nightly `maintenance` pass over non-`RESOLVED` rows.

**Reset to 0** then recompute: conversation → `RESOLVED`; order on this thread → `CANCELLED` (FR-LEAD-006). Resolved stays 0.

Inbox sort: human-needed **always** beats score (`13` §6.1, FR-LEAD-009). Scoring must not reorder `HUMAN_REQUIRED` below a hot `AI_ACTIVE` thread.

---

## 11. Reservations

Create/commit/release/expire: `InventoryService` transaction + `FOR UPDATE` (`12` §6.5). TTL default `ai_settings.reservation_ttl_minutes = 30`.

`expire_reservations`: `status=active AND expires_at <= now()` → `expired` in that same transaction style. Expired rows do not subtract from `available_stock`.

Cancel order → `released`. Confirm → `committed` + `inventory_movements` when that Should ships.

Re-check inventory immediately before `create_pending_order` (`06` §7). If insufficient: apologize, offer alternatives, do not create the order.

---

## 12. Realtime internals

HTTP path, event **names**, auth, invalidation: `13_API_DESIGN.md` §14. This section is occupancy and reconnect.

### 12.1 Occupancy

Client **must not** `socket.join`. Exception (not a domain write):

| Emit           | Body                 | Server                                                                                                          |
| -------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `thread:open`  | `{ conversationId }` | If `inbox.read`, membership, and `conversation.business_id` = handshake tenant: `join conversation:{id}` (`17`) |
| `thread:close` | `{ conversationId }` | `leave` that room                                                                                               |

Unauthorized → ignore (do not error-disconnect the whole socket).

`business:{id}` and `user:{id}` are joined at handshake after JWT + **`businessId`** membership load (`17`). One tenant per socket.

### 12.2 Emit mapping

Gateway **translates** §8 events to `13` client events. Payload: ids + small fields already on REST. No transcript-only-on-socket.

Fan-out: `@socket.io/redis-adapter`.

Re-check membership if the connection is older than access TTL **or** on member-remove / business-delete (`13`).

### 12.3 Reconnect

Socket is not SoT. On `connect`: client refetches list + open thread from last cursor (`13`).

When the socket is **down**: UI polls `GET /conversations` every **15 seconds** (FR-RT-005). When **up**: no list poll. Socket.IO’s own polling transport is the engine degrade, not this interval.

---

## 13. Failure behaviour

Every row: log with correlation id. No silent drop.

| Scenario                                   | Behaviour                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM error / 15s timeout                    | Fallback models inside the turn (`11` §9, `15`). Provider **circuit breaker** when a model is globally unhealthy — skip straight to fallback (`15_AI_ARCHITECTURE.md`). Then `HUMAN_REQUIRED` `ai_timeout` / `integration_failure` (`06` §4.15). Do not send a degraded guess |
| All models fail                            | Same exception pipeline; inbound already persisted                                                                                                                                                                                                                            |
| Meta Graph down on send                    | Stay `queued`; backoff; DLQ after 3                                                                                                                                                                                                                                           |
| Persist webhook fails                      | **Non-200** so Meta retries. Never 200-then-lose                                                                                                                                                                                                                              |
| Postgres down                              | API 503; jobs retry; webhook non-200                                                                                                                                                                                                                                          |
| Tool failure                               | Uncertain + offer human; escalate; do not invent stock/price                                                                                                                                                                                                                  |
| Duplicate webhook                          | `ON CONFLICT DO NOTHING`; no second job                                                                                                                                                                                                                                       |
| Stock race                                 | `FOR UPDATE`; loser gets insufficient; no Redis mutex                                                                                                                                                                                                                         |
| Stale embeddings                           | Next `index_document` / `reindex_business`; do not block inbound                                                                                                                                                                                                              |
| Hard usage cap                             | Skip AI; humans reply; Owner notified                                                                                                                                                                                                                                         |
| `ai_agents.enabled=false`                  | Skip AI; persist inbound                                                                                                                                                                                                                                                      |
| Worker crash mid-turn                      | Lock TTL 30s with no heartbeat; token fencing so `finally` cannot `DEL` another worker; job retry; abort persist if token mismatch                                                                                                                                            |
| Crash after webhook 200 before map/enqueue | `processed_at` null → `retry_webhook_processing` sweep. Message may already exist (idempotent insert). No `outbox_events`                                                                                                                                                     |

Do not send “we'll reply shortly” as a fake AI success. If a system message is used, `sender_type=system`, once per thread per incident hour.

---

## 14. How coding agents must use this

1. All status changes go through `ConversationService.transition`. No Prisma `status:` in AI or Integrations.
2. Webhook handlers must not call `AIOrchestrator`.
3. `score_lead` is arithmetic + service calls. No LLM. No cross-module `JOIN`.
4. Stock: `InventoryService` + `FOR UPDATE`. Not the conversation lock.
5. New jobs: this table + `11` §7.2 if the queue is new. jobId must be deterministic.
6. New `escalation_reason`: `06` first, then here if a transition changes.
7. Occupancy emits are `thread:open` / `thread:close` only. No `join` from the client.
8. Do not add `outbox_events` (OQ-42) or a 16th handoff trigger for rate limits. Webhook durability is `processed_at` + `retry_webhook_processing`.
9. Playground jobs set `is_test` and skip Meta, rollup, and `usage_events`. Still write `ai_usage` and traces (`15`).
10. Conversation lock: random token, Lua compare-and-del / compare-and-expire. Never `DEL` the key blindly.
11. BullMQ: `attempts: 3`, built-in exponential `delay: 5000` (5s, 10s). No custom 5/20/80.
12. `retry_webhook_processing`: every post-map step idempotent; partial completion + sweep is normal.
13. Domain EventEmitter is best-effort except the webhook `integration_events` path.
14. `processTurn` must not call `ConversationService.transition`. Apply `TurnResult.intendedTransition` in the worker after the lock re-check (`15` §3).

---

## 15. Open questions

| #     | Question                                                                     | Working answer                                                                                                                                                                         | Owner       | Revisit                   |
| ----- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------- |
| OQ-41 | `score_lead` on `ai` queue?                                                  | **Keep.** Ownership is Conversations; queue name is ops                                                                                                                                | Engineering | Worker metrics            |
| OQ-42 | Outbox table?                                                                | **No** in MVP. Webhook path uses `integration_events` as the durable inbox (`processed_at` + sweep). Add a table only after a lost-enqueue incident this sweep cannot cover. No Kafka. | Engineering | Lost-enqueue incident     |
| OQ-09 | Auto-close `HUMAN_REQUIRED`?                                                 | **Yes** at 30 days if no pending order. 7-day warning = Phase 2                                                                                                                        | Product     | Phase 2                   |
| OQ-59 | `catalog` / `maintenance` queues vs stuffing `embeddings`                    | **Own queues** so metrics match the module                                                                                                                                             | Engineering | Decided                   |
| OQ-60 | `generate_suggestion` shares `conversation:{id}:processing` with inbound AI? | **Yes in MVP.** Staff suggest may wait behind an active customer turn (~seconds). Separate `draft_generation` lock only if inbox UX proves painful                                     | Product     | Post-launch inbox metrics |
| OQ-61 | `conversation_scoring_snapshot` / `lead_features` denorm?                    | **No in MVP.** Revisit if nightly `score_lead` over non-`RESOLVED` rows exceeds **60s** p95 per business                                                                               | Engineering | Worker metrics            |

Do not reopen OQ-40, 43, 53–58.

---

## 16. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Conversation State Machine`, `# Event Architecture`, `# Background Jobs`, `# Rate Limiting`, `# Failure Scenarios`, lead scoring
- `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md`
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` FR-CONV, FR-LEAD, FR-RT, FR-BILL, NFR-REL-03
- `docs/10_engineering/10_ARCHITECTURE.md` §5–6
- `docs/10_engineering/11_TECH_STACK.md` §7
- `docs/10_engineering/12_DATABASE_DESIGN.md`
- `docs/10_engineering/13_API_DESIGN.md`
- `docs/10_engineering/15_AI_ARCHITECTURE.md`
- `docs/10_engineering/16_INTEGRATION_DESIGN.md`
- `docs/10_engineering/17_SECURITY_DESIGN.md`
- `docs/10_engineering/18_DEPLOYMENT.md`
