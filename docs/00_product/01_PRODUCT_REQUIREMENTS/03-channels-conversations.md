## 8. FR-INT — Channel integrations

MVP ships **Instagram + Messenger** through a single Meta app, using official APIs only (Instagram Messaging API, Messenger Platform API). A shared Meta Integration Service owns OAuth, tokens, and webhook routing; two adapters translate to the canonical message shape. **WhatsApp** (Cloud API) is **Phase 2** — adapter stub and canonical shape included in MVP so addition is incremental. Unofficial WhatsApp automation is prohibited. Adapter design: `16_INTEGRATION_DESIGN.md`.

| ID         | Requirement                                                                                                                                         | Priority | Verify                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------- |
| FR-INT-001 | Owner/Admin can start a Meta OAuth flow from the Integrations page.                                                                                 | M        | MT                                                   |
| FR-INT-002 | After OAuth, the user selects which Facebook Page(s) to connect; a linked Instagram professional account is connected with the Page when available. | M        | MT                                                   |
| FR-INT-003 | Each connected surface is stored as a `channel_account` with channel type, external account id, credentials reference, status, and webhook secret.  | M        | AT                                                   |
| FR-INT-004 | Provider credentials are stored encrypted; raw tokens are never returned by any API or written to logs.                                             | M        | AT, IN                                               |
| FR-INT-005 | The integrations page shows per-account connection status, last inbound message time, and last error.                                               | M        | MT                                                   |
| FR-INT-006 | Owner/Admin can disconnect a channel account; disconnection stops inbound processing and outbound sends but preserves history.                      | M        | AT                                                   |
| FR-INT-007 | Inbound webhooks are signature-verified; invalid signatures are rejected and logged.                                                                | M        | AT                                                   |
| FR-INT-008 | The webhook endpoint persists the raw payload and returns `200` before any AI processing occurs.                                                    | M        | AT, OB                                               |
| FR-INT-009 | Duplicate webhook deliveries produce no duplicate message, no duplicate AI run, and no duplicate order.                                             | M        | AT                                                   |
| FR-INT-010 | Provider payloads are mapped to the canonical internal message shape; no provider-specific field reaches the AI or inbox modules.                   | M        | IN                                                   |
| FR-INT-011 | Outbound sends respect provider rate limits with exponential backoff and a dead-letter queue after exhausting retries.                              | M        | AT, OB                                               |
| FR-INT-012 | Token expiry or permission revocation sets the channel account to an error state and notifies Owner/Admin.                                          | M        | AT                                                   |
| FR-INT-013 | Inbound attachments (images) are stored and shown in the inbox even though MVP AI does not interpret image content.                                 | M        | AT                                                   |
| FR-INT-014 | WhatsApp channel (Meta WhatsApp Cloud API).                                                                                                         | W        | — (Phase 2, behind `feature_flags.whatsapp_enabled`) |

### 8.1 WhatsApp requirements (Phase 2 — not MVP)

Deferred to prove the core sales loop on Instagram and Messenger first. Full spec: Brain Dump `# Integration Architecture → Phase 2`.

| ID         | Requirement                                                                           | Priority    | Verify      |
| ---------- | ------------------------------------------------------------------------------------- | ----------- | ----------- |
| FR-INT-020 | Connect a WhatsApp Business number via Meta OAuth; store WABA id and phone number id. | S (Phase 2) | MT          |
| FR-INT-021 | WhatsApp prerequisites stated before the merchant starts the flow.                    | S (Phase 2) | MT          |
| FR-INT-022 | Pending WhatsApp verification never blocks MVP channels or AI activation.             | S (Phase 2) | AT          |
| FR-INT-023 | Each inbound WhatsApp message opens or refreshes a 24-hour service window.            | S (Phase 2) | AT          |
| FR-INT-024 | Inside the service window, AI and human replies send as normal free-form messages.    | S (Phase 2) | AT          |
| FR-INT-025 | Outside the service window, no autonomous AI reply and no free-form send attempt.     | S (Phase 2) | AT          |
| FR-INT-026 | Outside the window, thread marked closed; staff may send an approved template.        | S (Phase 2) | MT          |
| FR-INT-027 | Templates are pre-registered with Meta; never LLM-generated.                          | S (Phase 2) | AT, IN      |
| FR-INT-028 | Approved templates synced from Meta with approval status.                             | S (Phase 2) | AT          |
| FR-INT-029 | Provider-refused sends never reported as delivered.                                   | S (Phase 2) | AT          |
| FR-INT-030 | WhatsApp conversation starts metered separately (Meta per-conversation cost).         | S (Phase 2) | AT          |
| FR-INT-031 | Per-channel-account outbound throttling respects each provider's limits.              | M           | AT          |
| FR-INT-032 | Unofficial WhatsApp automation prohibited in the codebase.                            | M           | IN          |
| FR-INT-033 | Interactive WhatsApp types and in-app template authoring.                             | W           | — (Phase 3) |

---

## 9. FR-CONV — Conversations and inbox

The conversation state machine (statuses, allowed transitions, auto-transitions) is canonically defined in `docs/10_engineering/14_SYSTEM_DESIGN.md`. Requirements here describe user-observable behaviour only.

### 9.1 Inbox

| ID          | Requirement                                                                                                                                         | Priority | Verify |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-CONV-001 | Staff see a unified inbox of all conversations for the active business across all connected channels.                                               | M        | MT     |
| FR-CONV-002 | The inbox can be filtered by status, channel, and assignee.                                                                                         | M        | AT     |
| FR-CONV-003 | Conversations requiring human attention are sorted first by handoff priority (`critical` → `high` → `normal`), then by handoff time (oldest first). | M        | AT     |
| FR-CONV-004 | Each list row shows customer name/handle, channel, last message preview, unread state, status badge, priority badge, and assignee.                  | M        | MT     |
| FR-CONV-005 | New inbound messages and status changes appear in an open inbox without manual refresh.                                                             | M        | MT     |
| FR-CONV-006 | The inbox supports search by customer name, phone, or message text.                                                                                 | S        | AT     |
| FR-CONV-007 | Message history is paginated and loads older messages on demand.                                                                                    | M        | AT     |
| FR-CONV-008 | Every message displays its sender type (customer, AI, human, system) with visually distinct treatment.                                              | M        | MT     |

### 9.2 Conversation detail and human control

| ID          | Requirement                                                                                                                                                                  | Priority | Verify |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-CONV-010 | The detail view shows the full transcript, the customer profile, lifecycle stage, order timeline, AI status, and the handoff briefing when present.                          | M        | MT     |
| FR-CONV-011 | Staff can send a message to the customer; sending as a human sets `ai_enabled = false` for that conversation.                                                                | M        | AT     |
| FR-CONV-012 | Staff can explicitly **Take over**, which pauses the AI and transitions `HUMAN_REQUIRED` → `HUMAN_HANDLING`.                                                                 | M        | AT     |
| FR-CONV-013 | Staff can **Resume AI**, permitted only when no order is awaiting confirmation on that conversation.                                                                         | M        | AT     |
| FR-CONV-014 | Staff can assign a conversation to a member; assignment history is recorded with actor and timestamp.                                                                        | M        | AT     |
| FR-CONV-015 | Staff can add internal notes visible only to team members, never sent to the customer.                                                                                       | M        | AT     |
| FR-CONV-016 | Staff can close a conversation, moving it to `RESOLVED`.                                                                                                                     | M        | AT     |
| FR-CONV-017 | A conversation with no activity for 30 days (configurable) and no pending order auto-closes to `RESOLVED`.                                                                   | S        | AT     |
| FR-CONV-018 | Staff can snooze a conversation until a chosen time.                                                                                                                         | C        | AT     |
| FR-CONV-019 | A conversation summary is generated automatically on entry to `HUMAN_REQUIRED` and on takeover, and regenerated if more than 10 new messages arrive before a human opens it. | M        | AT, EV |
| FR-CONV-020 | Staff can see **why** the AI escalated, rendered from the stored decision trace and handoff context.                                                                         | M        | MT     |
| FR-CONV-021 | Concurrent processing of one conversation is prevented; two near-simultaneous inbound messages never produce interleaved or duplicated AI replies.                           | M        | AT     |
| FR-CONV-022 | Typing indicators and read receipts.                                                                                                                                         | W        | —      |

### 9.3 Sales command center layout and triage

The operator surface is a **sales command center**, not a chat client. Layout, copy, and interaction detail: `docs/20_design/22_UX_FLOWS.md`. The requirements below are the behavioural contract that design must satisfy.

| ID          | Requirement                                                                                                                                                                                                                                | Priority | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| FR-CONV-030 | The inbox presents three panes: conversation list (triage), chat thread, and customer context with actions.                                                                                                                                | M        | MT     |
| FR-CONV-031 | The conversation list is ordered by **sales priority**, not by recency: conversations in `HUMAN_REQUIRED` first (by handoff priority, then oldest wait), then AI-handled conversations by lead temperature, then lead score, then recency. | M        | AT     |
| FR-CONV-032 | The default view is "Needs me" (escalations plus hot leads), not "All conversations".                                                                                                                                                      | M        | MT     |
| FR-CONV-033 | Conversations are grouped and badged by lead temperature (hot / warm / cold).                                                                                                                                                              | M        | MT     |
| FR-CONV-034 | Each list card shows customer, last message snippet, temperature badge, product of interest, value, channel icon, assignee, and relative time — enough to triage without opening it.                                                       | M        | MT     |
| FR-CONV-035 | There is a single unified inbox across channels with channel filters; there are no per-channel pages.                                                                                                                                      | M        | MT     |
| FR-CONV-036 | A channel appears in the filter list only when the business has a connected account on it; each conversation row displays its channel.                                                                                                     | M        | AT     |
| FR-CONV-037 | The chat pane shows a persistent indicator of who is currently responding (AI or a named human) and renders customer, AI, human, and system events distinguishably.                                                                        | M        | MT     |
| FR-CONV-038 | Outbound message delivery state (sending, sent, delivered, failed) is visible in the thread, and a failed provider send exposes a retry action.                                                                                            | M        | AT     |
| FR-CONV-039 | The customer panel shows identity, contact, lead information with an explanation affordance for the score, plain-language status, and an event timeline.                                                                                   | M        | MT     |
| FR-CONV-040 | The conversation timeline is derived from existing messages, state transitions, AI actions, and orders; it introduces no new storage.                                                                                                      | M        | IN     |
| FR-CONV-041 | Primary actions (take over, confirm order, call, assign) are reachable from the customer panel, limited to four primary buttons, and context-sensitive to the conversation state.                                                          | M        | MT     |
| FR-CONV-042 | The call action opens a telephone link to the stored customer phone number.                                                                                                                                                                | S        | MT     |
| FR-CONV-043 | AI control (AI mode, take over, pause, resume, send) reflects **server** state, so two staff members can never both believe they own a conversation.                                                                                       | M        | AT     |
| FR-CONV-044 | No payment-link or payment-collection affordance exists anywhere in the UI while payments are out of scope.                                                                                                                                | M        | IN     |

### 9.4 Sales pipeline view

| ID          | Requirement                                                                                                                   | Priority | Verify                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| FR-CONV-050 | A pipeline page presents leads and orders as Kanban columns: new leads, qualified, payment pending, sold.                     | M        | MT                                                                                |
| FR-CONV-051 | Columns are a **read-only projection** of existing conversation and order status and introduce no new state or status field.  | M        | IN                                                                                |
| FR-CONV-052 | Each column shows a count and total value; each card shows customer, product, value, and temperature.                         | M        | MT                                                                                |
| FR-CONV-053 | Card copy for the payment-pending column says the order awaits **staff confirmation**, never that it awaits customer payment. | M        | IN                                                                                |
| FR-CONV-054 | Drag-to-advance between columns.                                                                                              | W        | — (post-MVP; must execute state-machine transitions, never write status directly) |

### 9.5 FR-LEAD — Lead scoring

Signals, weights, bands, and recomputation triggers are canonical in `docs/10_engineering/14_SYSTEM_DESIGN.md`.

| ID          | Requirement                                                                                                                          | Priority | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| FR-LEAD-001 | Every conversation carries a lead score in the range 0–100 and a derived temperature band.                                           | M        | AT     |
| FR-LEAD-002 | The score is computed by deterministic rules over persisted signals; scoring must never invoke an LLM.                               | M        | AT, IN |
| FR-LEAD-003 | The contributing signals and their point values are stored per conversation so the score can be explained in the UI.                 | M        | AT     |
| FR-LEAD-004 | The score is recomputed on inbound message, conversation state change, order creation and confirmation, and on a nightly decay pass. | M        | AT     |
| FR-LEAD-005 | Temperature thresholds are configurable per business rather than hard-coded.                                                         | M        | AT     |
| FR-LEAD-006 | The score resets when the conversation is resolved or its order is cancelled.                                                        | M        | AT     |
| FR-LEAD-007 | The score is never presented as a probability of purchase or any other statistical claim.                                            | M        | IN     |
| FR-LEAD-008 | Lead score is visible to all staff roles, including Employees.                                                                       | M        | AT     |
| FR-LEAD-009 | Lead scoring must never reorder a conversation ahead of one requiring human action; escalation ordering always wins.                 | M        | AT     |
| FR-LEAD-010 | Machine-learned or LLM-derived scoring.                                                                                              | W        | —      |

### 9.6 FR-RT — Realtime

| ID        | Requirement                                                                                                                                                                                 | Priority | Verify |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-RT-001 | New messages, status changes, handoffs, lead-score changes, and notifications reach an open UI without manual refresh.                                                                      | M        | MT     |
| FR-RT-002 | Realtime connections authenticate with the same credentials as the REST API, and subscriptions are scoped server-side; a client may never subscribe to an arbitrary tenant or conversation. | M        | AT     |
| FR-RT-003 | The realtime channel is an accelerator, not a source of truth: no data may exist only in a pushed payload, and every view is refetchable over REST.                                         | M        | IN     |
| FR-RT-004 | On reconnection the client reconciles by refetching the list and the open thread from its last cursor, so a missed frame never leaves the UI permanently wrong.                             | M        | AT     |
| FR-RT-005 | When the realtime connection cannot be established, the UI degrades to polling and indicates the degraded state.                                                                            | M        | MT     |
| FR-RT-006 | Realtime fan-out works across multiple application instances.                                                                                                                               | M        | AT     |

---
