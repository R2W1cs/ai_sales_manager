- Given the customer wants the unavailable item specifically, then the conversation escalates with an inventory conflict reason.

---

### US-E-05 — Staff are notified of a new order request

**As an** owner, **I want** an unmissable alert when the AI produces an order, **so that** I confirm it while the customer is still warm.

**Priority:** M · **Requirements:** FR-NOTIF-001, FR-NOTIF-002, FR-NOTIF-003, FR-NOTIF-004, FR-HAND-005

**AC:**

- Given a pending order is created, then an in-app notification is created for Owner and Admin (and the assignee if set) showing customer, product, amount, and waiting status.
- Given the notification, then clicking it opens the source conversation with the order in context.
- Given multiple notifications, then they sort by priority then recency and the unread count is accurate.
- Given I mark one or all as read, then the count updates and the state persists across sessions.

---

### US-E-06 — Confirm an order in one action

**As an** employee, **I want** to confirm the order from the conversation, **so that** I do not navigate to a separate orders screen mid-chat.

**Priority:** M · **Requirements:** FR-ORD-004, FR-ORD-005, FR-HAND-010, FR-HAND-006

**AC:**

- Given a pending order on the open conversation, then a confirm action is visible with the order summary.
- Given I confirm, then the order becomes `CONFIRMED`, `order_confirmed_at` is recorded, and the conversation advances to `ORDER_CONFIRMED`.
- Given a human first opens or takes the handed-off conversation, then `handoff_completed_at` is recorded once.
- Given I confirm, then the conversion KPI reflects it in the next rollup.

---

### US-E-07 — Cancel a pending order

**As an** employee, **I want** to cancel an order the customer no longer wants, **so that** my stock and metrics stay accurate.

**Priority:** M · **Requirements:** FR-ORD-004, FR-ORD-008

**AC:**

- Given a pending order, when I cancel it with a reason, then its status becomes `CANCELLED` and the associated reservation is released.
- Given cancellation, then the conversation can be resumed by the AI if the staff member chooses.
- Given an invalid transition (for example `CANCELLED` back to `PENDING_CONFIRMATION`), then the API rejects it.

---

### US-E-08 — Record offline payment

**As an** employee collecting cash on delivery, **I want** to mark payment received, **so that** the record reflects reality.

**Priority:** M · **Requirements:** FR-ORD-006

**AC:**

- Given a confirmed order, when I mark payment completed, then the payment status updates and the actor and timestamp are recorded.
- Given payment status changes, then it is independent of order status; an order may be confirmed and unpaid.

---

### US-E-09 — Create an order manually

**As an** employee handling an unusual request, **I want** to create an order myself, **so that** the system holds all sales, not only AI-generated ones.

**Priority:** M · **Requirements:** FR-ORD-003, FR-ORD-009

**AC:**

- Given I create an order manually with customer, items, and quantities, then it is saved with the human creator recorded.
- Given the orders list, then I can distinguish AI-created from manually created orders.
- Given manual orders, then they are excluded from the AI-attributed conversion metric.

---

### US-E-10 — Escalate non-purchase situations correctly

**As an** owner, **I want** every sensitive situation routed to a human with the right urgency, **so that** the AI never mishandles an angry or legal matter.

**Priority:** M · **Requirements:** FR-HAND-001, FR-HAND-002, FR-HAND-007 · **Canonical:** `06_AI_HUMAN_HANDOFF_RULES.md`

**AC:**

- Given a customer expresses anger or dissatisfaction, then the conversation escalates at critical priority with the complaint reason and the AI attempts no upsell.
- Given a refund request, then the AI never approves or denies it and escalates at critical priority.
- Given a customer asks for a human, then the AI escalates at high priority and confirms politely that someone will come.
- Given a legally sensitive topic, then the AI escalates at critical priority without offering an opinion.
- Given a VIP-tagged customer and the VIP auto-handoff flag enabled, then the conversation escalates at critical priority.
- Given a bulk or out-of-catalog request, then the AI escalates at high priority with the request captured in the briefing.
- Given any escalation, then the reason and priority are recorded and the notification reflects the priority.

---

## 8. Epic F — Customers and notifications

### US-F-01 — Recognise a returning customer

**As an** owner, **I want** the AI to know who it is talking to, **so that** repeat buyers feel remembered instead of interrogated.

**Priority:** M · **Requirements:** FR-CUST-001, FR-CUST-006, FR-CUST-007, FR-CUST-011

**AC:**

- Given a customer messages from a channel identity seen before, then the existing customer record is matched, not duplicated.
- Given a new Instagram or Messenger identity shares a **verified** phone with an existing customer, then the identity is auto-linked to that customer.
- Given only a similar name or an unverified phone, then a separate customer is created (no auto-merge).
- Given a customer with a confirmed past order, then their lifecycle stage is at least `customer` and the AI may reference the prior purchase.
- Given a customer in `order_pending`, then the AI provides status updates only and does not attempt to sell again.
- Given a brand-new identity, then a customer record is created at `unknown_visitor`.

---

### US-F-02 — Maintain a customer profile

**As an** employee, **I want** to view and correct customer details, **so that** deliveries reach the right place.

**Priority:** M · **Requirements:** FR-CUST-002, FR-CUST-004, FR-CUST-005

**AC:**

- Given a customer record, then I can view name, phone, email, address, language, tags, notes, conversations, and orders in one place.
- Given I edit a field, then the change is saved and audited.
- Given I add a tag or note, then it is visible to the team and to the AI context where applicable.

---

### US-F-03 — Flag a VIP

**As an** owner, **I want** to mark my best customers, **so that** they always get a human quickly.

**Priority:** M · **Requirements:** FR-CUST-008

**AC:**

- Given I tag a customer VIP, then their lifecycle stage reflects VIP treatment.
- Given VIP auto-handoff is enabled for my business, then their next conversation escalates at critical priority.
- Given VIP auto-handoff is disabled, then the AI applies the VIP tone rules without forcing escalation.

---

### US-F-04 — Export customer data

**As an** owner, **I want** to export my customers, **so that** my data is not locked in.

**Priority:** S · **Requirements:** FR-CUST-009

**AC:**

- Given I request an export, then I receive a file containing my business's customers only.
- Given I am an Employee, then the export action is unavailable.
- Given an export occurs, then it is recorded in the audit log.

---

### US-F-05 — Merge duplicate customers

**As an** admin, **I want** to merge two customer records that are the same person on different channels, **so that** history is not split.

**Priority:** M · **Requirements:** FR-CUST-010, FR-CUST-011

**AC:**

- Given two customers on my business, when I merge them as Owner or Admin, then identities, orders, notes, and conversations attach to the surviving record and the merge is audited.
- Given I am an Employee, then merge is unavailable.
- Given only similar names, then the system does not merge automatically.

---

## 9. Epic G — Analytics, billing, observability, platform

### US-G-01 — See whether the AI is making me money

**As an** owner, **I want** four clear numbers, **so that** I can decide whether to keep paying.

**Priority:** M · **Requirements:** FR-ANL-001, FR-ANL-002, FR-ANL-003 · **Canonical definitions:** `01_PRODUCT_REQUIREMENTS.md` §15

**AC:**

- Given a selected period, then I see messages handled, orders created, human handoffs, and conversion percentage.
- Given handoffs, then I can see the breakdown by escalation reason.
- Given I reload, then the same period returns identical figures.
- Given my business timezone, then period boundaries follow it rather than server time.
- Given sandbox or test data exists, then it is excluded from all four figures.

---

### US-G-02 — Understand my usage against my plan

**As an** owner, **I want** to see how many messages I have used, **so that** I am not surprised when the AI stops.

**Priority:** M · **Requirements:** FR-BILL-004, FR-BILL-005, FR-BILL-006, FR-BILL-010

**AC:**

- Given the usage page, then I see current period consumption against my plan limits for messages, AI replies, conversations, channels, seats, and monthly AI budget when set.
- Given I cross 80% and 95% of a hard limit, then I receive a warning surfaced in the dashboard.

---

### US-G-03 — Hit my limit without losing customers

**As an** owner over my plan limit, **I want** messages to keep arriving, **so that** I can still serve customers manually while I decide to upgrade.

**Priority:** M · **Requirements:** FR-BILL-007, FR-BILL-008

**AC:**

- Given I reach any hard limit (messages, AI replies, conversations, or AI budget), then AI auto-replies stop.
- Given the limit is reached, then inbound messages continue to be received and displayed and humans can still reply.
- Given the limit is reached, then the owner is notified and an upgrade call to action is visible in the dashboard and the inbox.
- Given I am at the channel limit, then connecting another channel is blocked with a clear explanation.

---

### US-G-04 — Rate the AI's answers

**As an** employee, **I want** to thumb-rate AI messages, **so that** the agent improves instead of repeating mistakes.

**Priority:** M · **Requirements:** FR-OBS-006, FR-OBS-007

**AC:**

- Given any AI message, then I can rate it positive or negative.
- Given a negative rating, then I must select a reason from the fixed enum and may add a comment.
- Given feedback exists, then Owner and Admin can filter it by date, reason, and prompt version.
- Given a rating, then the prompt version of the rated message is stored with it.

---

### US-G-05 — Audit what the AI did

**As an** admin debugging a bad interaction, **I want** to see every tool call, **so that** I can tell whether the data or the model was wrong.

**Priority:** M · **Requirements:** FR-OBS-001, FR-OBS-008

**AC:**

- Given a conversation, then I can view its AI action log with tool name, input, output, success, error, and duration per call.
- Given a rate-limit event, then it appears in the action log.
- Given a failed tool call, then the error is recorded and the conversation behaviour matches the uncertainty rule.

---

### US-G-06 — Watch AI cost

**As an** owner, **I want** to see what the AI costs me, **so that** I understand my margins.

**Priority:** S · **Requirements:** FR-OBS-004, FR-OBS-005

**AC:**

- Given AI turns occurred, then token counts and estimated cost are recorded per turn with model and prompt version.
- Given the usage summary, then Owner sees cost aggregated by day and model.
- Given I am an Employee, then no monetary AI data is visible to me.

---

### US-G-07 — Roll out features per tenant

**As a** platform operator, **I want** to enable a capability for one business, **so that** I can pilot without deploying.

**Priority:** M · **Requirements:** FR-FLAG-001, FR-FLAG-002, FR-FLAG-003, FR-FLAG-004

**AC:**

- Given I enable a flag for a business, then the behaviour changes on the next request with no redeploy.
- Given a platform-level default, then businesses without an explicit override inherit it.
- Given a disabled channel flag, then that channel is not offered in the integrations UI.

---

### US-G-08 — Version prompts safely

**As a** platform operator, **I want** prompt changes to be new versions, **so that** I can compare quality and roll back.

**Priority:** M · **Requirements:** FR-AI-026, FR-AI-027, FR-AI-025

**AC:**

- Given I change a prompt, then a new version is created and the previous version remains intact.
- Given only one version per type may be active, then activating a new version deactivates the prior one atomically.
- Given any AI message, then the prompt version used is recorded and retrievable.
- Given a prompt or model change, then the golden set runs in CI and a regression blocks the merge.

---

### US-G-10 — Score AI conversations

**As an** admin reviewing quality, **I want** conversation-level evaluations stored, **so that** we can see where the AI fails.

**Priority:** M · **Requirements:** FR-AI-032, FR-OBS-011

**AC:**

- Given a golden-set run, production sample, or staff review, then an `ai_evaluations` row is stored with score, failure reason, and evaluator type.
- Given evaluations exist, then they are distinct from per-message thumbs (`ai_feedback`).

---

### US-G-09 — Prove tenant isolation

**As an** owner, **I want** certainty that no other merchant can see my data, **so that** I can trust the platform with my customers.

**Priority:** M · **Requirements:** FR-BIZ-006, NFR-SEC-04, NFR-SEC-05

**AC:**

- Given a valid token for business A, when I request a resource id belonging to business B, then the response is not found or forbidden and never leaks existence details.
- Given any list endpoint, then results contain only the active business's records.
- Given an Employee calls an Owner-only endpoint directly, then it is rejected server-side regardless of UI state.

---

## 10. Epic H — End-customer experience

The end customer never logs in, but their experience is a first-class requirement. These stories are verified through the AI evaluation harness and manual scripts.

### US-H-01 — Get an instant, correct answer

**As a** shopper messaging a store at 11pm, **I want** an immediate accurate reply, **so that** I do not wait until morning to decide.

**Priority:** M · **Requirements:** FR-AI-020, NFR-PERF-02

**AC:**

- Given I ask about a product, then I receive a reply within the latency target with the real price and availability.
- Given the store is closed, then I still get an answer and, where a human is needed, a realistic callback expectation based on working hours.

---

### US-H-02 — Be understood in my own language

**As a** Tunisian shopper who mixes Arabic and French, **I want** to be answered naturally, **so that** the conversation does not feel like a form.

**Priority:** M · **Requirements:** FR-AI-022, NFR-I18N-01

**AC:**

- Given I write in Tunisian Arabic, then the reply is in Tunisian Arabic.
- Given I code-switch within one message, then the reply is coherent and in the dominant language of my message.
- Given I switch languages mid-conversation, then the AI follows my switch.

---

### US-H-03 — Buy without friction

**As a** shopper who has decided, **I want** to be asked only what is necessary, **so that** ordering feels like a conversation, not paperwork.

**Priority:** M · **Requirements:** FR-HAND-008

**AC:**

- Given I say I want to buy, then I am asked one question at a time and never re-asked for information I already gave.
- Given I finish giving details, then I am told clearly that a team member will confirm my order.
- Given the handoff, then I am not promised a payment link, discount, or delivery date that was not defined by the merchant.

---

### US-H-04 — Reach a human when I need one

**As an** upset shopper, **I want** a person, **so that** I am not stuck arguing with software.

**Priority:** M · **Requirements:** FR-HAND-001, FR-HAND-007

**AC:**

- Given I ask for a human, then the AI stops replying autonomously and tells me a team member will respond.
- Given I express anger, then no upsell or sales language appears in the final AI message before handoff.
- Given I request a refund, then the AI does not decide it and defers to a human.

---

## 11. Blanket acceptance criteria

These apply to **every** story and are verified once per endpoint and screen rather than restated per story.

| #      | Criterion                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| BAC-1  | All data access is scoped to the active business; cross-tenant reads and writes are impossible through any endpoint.                 |
| BAC-2  | Authorisation is enforced server-side against the permission matrix in `17_SECURITY_DESIGN.md`; hidden UI is never the only control. |
| BAC-3  | Every mutating endpoint validates input and returns field-level errors in the standard error envelope defined in `13_API_DESIGN.md`. |
| BAC-4  | Every write that can be retried is idempotent; a duplicate request returns the original result without a second side effect.         |
| BAC-5  | Every list endpoint is paginated with a bounded maximum page size.                                                                   |
| BAC-6  | Every screen defines an empty state, a loading state, and an error state with a next action.                                         |
| BAC-7  | Arabic content renders right-to-left correctly, including mixed-direction text.                                                      |
| BAC-8  | No customer PII appears in application logs.                                                                                         |
| BAC-9  | Every state transition and AI decision relevant to the story is persisted for audit.                                                 |
| BAC-10 | Sandbox and test data are excluded from analytics KPIs and from billing usage counters.                                              |

---

## 12. Coverage check

| Requirement area | Stories                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| FR-AUTH          | US-A-01, A-02, A-03, A-05                                                             |
| FR-BIZ           | US-A-04, A-05, A-06, A-07, A-08, A-09, A-10, G-09                                     |
| FR-CAT           | US-B-01, B-02, B-03, B-04                                                             |
| FR-KNOW          | US-B-04, B-05, B-06, B-07, B-08, B-09                                                 |
| FR-INT           | US-C-01, C-02, C-03, C-04, C-05, C-07                                                 |
| FR-CONV          | US-D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-15, D-16, D-17, D-18, D-21 |
| FR-AI            | US-A-08, D-10, D-11, D-12, D-13, D-14, D-20, G-08, G-10, H-01, H-02                   |
| FR-HAND          | US-A-10, E-01, E-03, E-04, E-10, H-03, H-04                                           |
| FR-ORD           | US-E-02, E-03, E-06, E-07, E-08, E-09                                                 |
| FR-CUST          | US-F-01, F-02, F-03, F-04, F-05                                                       |
| FR-NOTIF         | US-C-02, E-05, D-22                                                                   |
| FR-LEAD          | US-D-16, D-19                                                                         |
| FR-RT            | US-D-02, D-23                                                                         |
| FR-ANL           | US-G-01                                                                               |
| FR-BILL          | US-G-02, G-03, A-05                                                                   |
| FR-OBS           | US-D-04, G-04, G-05, G-06, G-10                                                       |
| FR-FLAG          | US-G-07                                                                               |
| FR-AUD           | US-A-06, F-02, F-04 (blanket BAC-9)                                                   |

Every `M`-priority requirement in `01_PRODUCT_REQUIREMENTS.md` is covered by at least one story. Requirements marked `W` intentionally have no story.

---

## 13. Open questions

| #     | Question                                                                                                         | Working answer                                                                                                                                      | Owner       | Revisit     |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| OQ-11 | Should an edited-then-approved AI draft count as an AI message or a human message for analytics and attribution? | Count as **AI-sent with human edit flag**; the edit is recorded for quality analysis but attribution stays with the AI (US-D-10).                   | Product     | Phase 2     |
| OQ-12 | When a conversation reopens after `RESOLVED`, does it return to `AI_ACTIVE` or to its prior state?               | Returns to `AI_ACTIVE` if `ai_enabled` was true and no pending order exists; otherwise `HUMAN_REQUIRED` (US-D-15). Recorded in `41_ASSUMPTIONS.md`. | Engineering | Milestone 5 |
| OQ-13 | Can an Employee cancel a pending order, or only Owner/Admin?                                                     | Employee may cancel with a required reason, since they are the ones talking to the customer (US-E-07).                                              | Product     | Phase 2     |
| OQ-14 | Should the customer be told a human has taken over?                                                              | No explicit system message in MVP; the human simply replies. Avoids a robotic seam in the conversation.                                             | Product     | Phase 2     |

---

## 14. References

- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` — requirement register, activation gates, KPI definitions
- `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md` — escalation triggers, priorities, briefing schema
- `docs/10_engineering/14_SYSTEM_DESIGN.md` — conversation state machine
- `docs/20_design/22_UX_FLOWS.md` — screen flows realising these stories
- `docs/30_execution/32_FEATURE_SPECIFICATIONS.md` — per-feature implementation specs
