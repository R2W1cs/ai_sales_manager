## 10. FR-AI — Agent configuration and controlled autonomy

AI _behaviour_ (intents, tools, grounding, output constraints) is canonically specified in `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md`. This section covers what the **merchant can configure** and what the **platform must guarantee**.

### 10.1 Agent configuration

| ID        | Requirement                                                                                                                                                    | Priority | Verify      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| FR-AI-001 | Each business has exactly one configurable primary sales agent in MVP.                                                                                         | M        | AT          |
| FR-AI-002 | Owner/Admin can configure agent name, personality description, default language (`ar` / `fr` / `en`), tone, and greeting and fallback templates.               | M        | AT          |
| FR-AI-003 | Owner/Admin can configure sales strategy flags (upsell aggressiveness, cross-sell on/off).                                                                     | M        | AT          |
| FR-AI-004 | Owner/Admin can set the escalation confidence threshold; default is 0.65.                                                                                      | M        | AT          |
| FR-AI-005 | Owner/Admin can configure model settings: primary model, fallback model, max tokens, temperature, retrieval top-k, blocked topics, and a custom system append. | S        | AT          |
| FR-AI-006 | Owner/Admin can enable or disable the agent globally for the business.                                                                                         | M        | AT          |
| FR-AI-007 | Configuration changes take effect on the next conversation turn without redeploy.                                                                              | M        | AT          |
| FR-AI-008 | Multiple agents per business, per-channel agents.                                                                                                              | W        | — (Phase 5) |

### 10.2 Reply modes

| ID         | Requirement                                                                                                                                                                                                                             | Priority | Verify |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-AI-010  | The business can operate in one of three reply modes: `auto_send`, `approval_required`, or `draft_only`.                                                                                                                                | M        | AT     |
| FR-AI-011  | New businesses default to `approval_required`. Completing the AI test gate (G4) unblocks live AI; it does **not** change `reply_mode`. The owner must explicitly opt into `auto_send` (onboarding step 6 optional toggle, or Settings). | M        | AT     |
| FR-AI-012  | In `approval_required`, AI output is persisted as a draft and is not delivered until a staff member approves it.                                                                                                                        | M        | AT     |
| FR-AI-013  | In `draft_only`, AI output is persisted as a draft that staff may copy or edit and send manually; approval does not auto-send.                                                                                                          | S        | AT     |
| FR-AI-014  | Staff can edit a draft before approving; the edited text is what is sent, and the edit is recorded for feedback analysis.                                                                                                               | S        | AT     |
| FR-AI-015  | Pending drafts are surfaced in the inbox as an actionable queue.                                                                                                                                                                        | M        | MT     |
| FR-AI-016  | While a human is handling a conversation, the AI can offer a suggested reply that the human may send, edit, or dismiss.                                                                                                                 | M        | MT     |
| FR-AI-017  | A suggestion is a draft only: displaying one during `HUMAN_REQUIRED` does not violate the paused-AI rule, because nothing is delivered without an explicit human action.                                                                | M        | AT, IN |
| FR-AI-018  | Suggestions obey every guardrail that applies to sent messages, including grounding, no discounts, no refund approval, and no payment promises.                                                                                         | M        | EV     |
| FR-AI-019  | Suggestions are suppressed on complaint and refund conversations.                                                                                                                                                                       | M        | AT, EV |
| FR-AI-020a | Suggestions are generated on demand and debounced, never on every keystroke, and each generation is recorded in AI usage like any other model call.                                                                                     | M        | AT     |
| FR-AI-020b | Sending a suggestion records an AI message flagged as human-approved; editing before sending records the edit for feedback analysis.                                                                                                    | M        | AT     |

### 10.3 Platform guarantees

| ID        | Requirement                                                                                                                                                                                                                                        | Priority | Verify |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-AI-020 | The AI must never state a price, stock quantity, delivery fee, discount, or policy that did not come from a tool result or business rule in the same turn.                                                                                         | M        | EV, AT |
| FR-AI-021 | The AI must never invent products, promise unavailable items, grant unauthorised discounts, or approve refunds.                                                                                                                                    | M        | EV     |
| FR-AI-022 | The AI replies in the business default language unless the customer clearly uses another supported language, in which case it matches the customer.                                                                                                | M        | EV     |
| FR-AI-023 | When tools return empty or conflicting data, the AI states uncertainty and offers human handoff rather than guessing.                                                                                                                              | M        | EV     |
| FR-AI-024 | On low classifier confidence the AI asks one clarifying question; a second consecutive low-confidence turn escalates.                                                                                                                              | M        | AT, EV |
| FR-AI-025 | Every outbound AI message records intent, confidence, tools called, model, latency, and prompt version.                                                                                                                                            | M        | AT     |
| FR-AI-026 | Prompts are versioned; the active version per type is immutable and a change creates a new version.                                                                                                                                                | M        | AT     |
| FR-AI-027 | Platform default prompts are seeded per business and can be overridden by the merchant.                                                                                                                                                            | M        | AT     |
| FR-AI-028 | If the primary model fails, the system retries with the fallback model before escalating.                                                                                                                                                          | M        | AT, OB |
| FR-AI-029 | If all model attempts fail or exceed the latency ceiling, the conversation escalates to human with an integration/timeout reason rather than sending a degraded reply.                                                                             | M        | AT     |
| FR-AI-030 | Owner/Admin can run a playground conversation against current configuration without touching a live channel.                                                                                                                                       | M        | MT     |
| FR-AI-031 | The playground can run the four canned scenarios (price, angry customer, buying intent, recommendation) and free-form chat; it shows the AI response and tools called; the decision trace is visible to Owner/Admin only.                          | M        | MT     |
| FR-AI-032 | Sampled, golden-set, and staff-reviewed conversations persist an `ai_evaluations` row (`conversation_id`, `score`, `failure_reason`, `evaluator_type`, `created_at`) covering correctness, grounding, language, tools, escalation, and conversion. | M        | AT     |

---

## 11. FR-HAND — Human handoff

Trigger list, priorities, briefing schema, and behaviour during handoff are canonical in `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md`. Requirements here state the obligations the system must meet.

| ID          | Requirement                                                                                                                                                                                                                                               | Priority | Verify      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| FR-HAND-001 | All fifteen defined `HUMAN_REQUIRED` triggers are implemented in MVP.                                                                                                                                                                                     | M        | AT, EV      |
| FR-HAND-002 | Every handoff records an escalation reason and a priority.                                                                                                                                                                                                | M        | AT          |
| FR-HAND-003 | Every handoff persists a staff briefing containing customer identity, conversation summary, intent, products discussed, AI recommendation, reason, linked pending order and amount when applicable, and the required action.                              | M        | AT          |
| FR-HAND-004 | Entering `HUMAN_REQUIRED` sets `ai_enabled = false`; the AI produces no further autonomous replies on that conversation.                                                                                                                                  | M        | AT          |
| FR-HAND-005 | Entering `HUMAN_REQUIRED` emits a notification to Owner and Admin (and assignee when set) with the correct priority.                                                                                                                                      | M        | AT          |
| FR-HAND-006 | The time a human first opens or takes the conversation is recorded as `handoff_completed_at`.                                                                                                                                                             | M        | AT          |
| FR-HAND-007 | The AI never upsells on a complaint and never confirms a refund or payment.                                                                                                                                                                               | M        | EV          |
| FR-HAND-008 | On detected purchase intent, the AI confirms product and variant, verifies stock, collects required fields one question per turn, creates a pending order, triggers handoff, and tells the customer a team member will confirm — with no payment promise. | M        | AT, EV      |
| FR-HAND-009 | Purchase handoff re-verifies stock immediately before order creation; insufficient stock produces an apology and alternatives instead of an order.                                                                                                        | M        | AT          |
| FR-HAND-010 | Staff can confirm a pending order from the conversation view in one action.                                                                                                                                                                               | M        | AT          |
| FR-HAND-011 | Email, SMS, WhatsApp, and push notification of handoffs.                                                                                                                                                                                                  | W        | — (Phase 4) |

---

## 12. FR-ORD, FR-CUST, FR-NOTIF — Commerce records

### 12.1 Orders

| ID         | Requirement                                                                                                                                                                    | Priority | Verify      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| FR-ORD-001 | The AI can create an order with status `PENDING_CONFIRMATION` and payment status `NOT_COMPLETED`.                                                                              | M        | AT          |
| FR-ORD-002 | An order stores a customer snapshot (name, phone, address), line items with variant, quantity and unit price, totals, currency, source conversation, and creator (AI or user). | M        | AT          |
| FR-ORD-003 | Staff can create an order manually.                                                                                                                                            | M        | AT          |
| FR-ORD-004 | Staff can transition an order to `CONFIRMED`, `CANCELLED`, or `COMPLETED`; invalid transitions are rejected.                                                                   | M        | AT          |
| FR-ORD-005 | Confirming an order records `order_confirmed_at` and advances the conversation to `ORDER_CONFIRMED`.                                                                           | M        | AT          |
| FR-ORD-006 | Staff can mark payment status as completed when payment is collected offline.                                                                                                  | M        | AT          |
| FR-ORD-007 | Order creation is idempotent by idempotency key: a retried request returns the original order rather than creating a second one.                                               | M        | AT          |
| FR-ORD-008 | Cancelling a pending order releases any associated stock reservation.                                                                                                          | M        | AT          |
| FR-ORD-009 | The orders list is filterable by status and date and shows source (AI vs manual).                                                                                              | M        | MT          |
| FR-ORD-010 | Stock is reserved for a variant and quantity during order collection, with a default expiry of 30 minutes.                                                                     | M        | AT          |
| FR-ORD-011 | Reservations move to committed on order creation, released on cancel or timeout, and expired reservations are swept by a scheduled job.                                        | M        | AT          |
| FR-ORD-012 | Available stock exposed to the AI subtracts active reservations, preventing double-selling the last unit across concurrent conversations.                                      | M        | AT          |
| FR-ORD-013 | Payment provider integration, in-chat checkout, payment links.                                                                                                                 | W        | — (Phase 4) |
| FR-ORD-014 | Fulfilment statuses (`PROCESSING`, `SHIPPED`, `DELIVERED`) and logistics integration.                                                                                          | W        | —           |

### 12.2 Customers

| ID          | Requirement                                                                                                                                                                | Priority | Verify |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-CUST-001 | A customer record is created or matched on first inbound message via `customer_identities` (`platform`, `platform_user_id`). Same platform id is always the same customer. | M        | AT     |
| FR-CUST-002 | A customer stores name, phone, email, address, language, preferences, tags, and notes.                                                                                     | M        | AT     |
| FR-CUST-003 | Information collected by the AI during a conversation updates the customer record.                                                                                         | M        | AT     |
| FR-CUST-004 | Staff can view and edit a customer profile and see full purchase and conversation history.                                                                                 | M        | AT     |
| FR-CUST-005 | Staff can add tags and internal notes to a customer.                                                                                                                       | M        | AT     |
| FR-CUST-006 | Each customer has a lifecycle stage derived automatically from order and conversation events.                                                                              | M        | AT     |
| FR-CUST-007 | Lifecycle stage influences AI tone and recommendation behaviour as specified in `05_AI_BEHAVIOR_SPECIFICATION.md`.                                                         | M        | EV     |
| FR-CUST-008 | A customer can be manually tagged VIP; VIP handling is governed by the handoff rules.                                                                                      | M        | AT     |
| FR-CUST-009 | Owner/Admin can export customer data.                                                                                                                                      | S        | AT     |
| FR-CUST-010 | Owner/Admin can manually merge two customer records; the merge is audited; Employee cannot merge.                                                                          | M        | AT     |
| FR-CUST-011 | A new identity with a **verified** phone that already belongs to a customer on the same business is auto-linked. Unverified phone or name similarity never auto-merges.    | M        | AT     |

### 12.3 Notifications

| ID           | Requirement                                                                                                                                                                                                           | Priority | Verify      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| FR-NOTIF-001 | The system creates an in-app notification for new order requests and for handoffs, carrying type, priority, title, message, and linked entity.                                                                        | M        | AT          |
| FR-NOTIF-002 | Notifications are targeted at Owner and Admin, plus the assignee when a conversation is assigned.                                                                                                                     | M        | AT          |
| FR-NOTIF-003 | The UI shows an unread count and a notification list sorted by priority then recency.                                                                                                                                 | M        | MT          |
| FR-NOTIF-004 | A notification links directly to the relevant conversation or order.                                                                                                                                                  | M        | MT          |
| FR-NOTIF-005 | Users can mark one notification or all notifications as read.                                                                                                                                                         | M        | AT          |
| FR-NOTIF-006 | New notifications appear without page refresh.                                                                                                                                                                        | S        | MT          |
| FR-NOTIF-007 | Email, SMS, WhatsApp, browser push channels.                                                                                                                                                                          | W        | — (Phase 4) |
| FR-NOTIF-010 | Notifications fire on exactly four situations: a new hot lead, an order request or payment confirmation, AI uncertainty (low confidence, policy conflict, integration failure), and an angry or complaining customer. | M        | AT          |
| FR-NOTIF-011 | Routine AI replies, routine inbound messages, and state changes with no human action attached never produce a notification.                                                                                           | M        | AT          |
| FR-NOTIF-012 | Notifications are deduplicated to at most one per conversation per trigger type per hour.                                                                                                                             | M        | AT          |
| FR-NOTIF-013 | Repeated hot-lead notifications within a short window are collapsed into a single grouped notification.                                                                                                               | M        | AT          |
| FR-NOTIF-014 | Only `critical` notifications interrupt; lower priorities accumulate in the notification centre.                                                                                                                      | M        | MT          |
| FR-NOTIF-015 | Non-critical notifications respect the business's configured working hours.                                                                                                                                           | S        | AT          |

---
