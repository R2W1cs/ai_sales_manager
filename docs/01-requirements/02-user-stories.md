# 02. User Stories and Acceptance Criteria

Stories follow `As a <role>, I want <goal>, so that <benefit>`. Acceptance criteria use Given / When / Then so each one can become an automated test. IDs are `US-<epic>-<nn>` and are referenced by the backlog, design and traceability matrix.

**Priorities** use MoSCoW: **M** must, **S** should, **C** could, **W** won't (this phase).

## Epics

| Epic | Theme |
|---|---|
| A | Account, workspace, team, onboarding |
| B | Catalog and business knowledge |
| C | Channel connection |
| D | Inbox, conversations, AI autonomy |
| E | Purchase handoff and orders |
| F | Customers and notifications |
| G | Analytics and plan usage |

The catalogue below contains the stories that define the system's behaviour and drive the design. Smaller variations (for example sign-out or removing a teammate) follow the same patterns.

---

## Epic A. Account, workspace, onboarding

### US-A-01 Register an account `M`
As a **merchant**, I want to register with email and password, so that I can own a workspace.

- **Given** an unused email and a valid password, **when** I register, **then** an account is created and I am signed in.
- **Given** an email that already exists, **when** I register, **then** I see a clear error and no second account is created.
- **Given** a weak password, **when** I register, **then** registration is rejected with the rule that failed.

### US-A-02 Create my business workspace `M`
As a **merchant**, I want to create a workspace with name, timezone and currency, so that all my data is separated from other shops.

- **Given** I am signed in with no workspace, **when** I submit a valid name, timezone and currency, **then** a workspace is created and I become its Owner.
- **Given** a workspace exists, **when** any user from another workspace queries my data, **then** nothing from my workspace is returned.

### US-A-03 Invite a teammate `M`
As an **Owner or Admin**, I want to invite a colleague by email with a role, so that they can help work conversations.

- **Given** I have the invite permission, **when** I invite `agent@shop.tn` as Employee, **then** an invitation is created and emailed.
- **Given** an invitation, **when** the invitee accepts, **then** they join with exactly the invited role.
- **Given** any attempt to invite someone as Owner, **then** the request is rejected (403).

### US-A-04 Activate the AI only when it is safe `M`
As an **Owner**, I want the AI to refuse activation until the shop is ready, so that customers never meet a half-configured assistant.

Activation requires all five gates:

| Gate | Condition |
|---|---|
| G1 Catalog | At least one active product with a variant that has a price and stock value |
| G2 Rules | Delivery, payment and return rules present and acknowledged |
| G3 Channel | At least one active channel account |
| G4 AI test | A playground simulation completed, or one approved reply in approval mode |
| G5 Handoff | Owner acknowledged that purchase intent creates a pending order that a human must confirm |

- **Given** one or more gates are unmet, **when** I try to activate, **then** the API returns an error that lists every unmet gate, and the button is disabled in the UI.
- **Given** all gates are met, **when** I activate, **then** the AI starts answering on active channels.

### US-A-05 Test the AI before customers see it `M`
As an **Owner**, I want a playground that simulates customer messages, so that I can judge the AI's voice safely.

- **Given** the playground, **when** I send a message, **then** the AI replies using my catalog and rules, but nothing is sent to Meta, no KPI is counted and no usage is billed.

---

## Epic B. Catalog and business knowledge

### US-B-01 Add a product with variants `M`
As an **Admin**, I want to add a product with size/colour variants, prices and stock, so that the AI can quote them.

- **Given** valid product data, **when** I save, **then** the product and its variants are stored under my workspace.
- **Given** a variant with a negative price or stock, **when** I save, **then** it is rejected with a field-level error.

### US-B-02 Import a catalog by CSV `M`
As an **Admin**, I want to import products from CSV, so that I do not retype hundreds of items.

- **Given** a CSV, **when** I upload it, **then** it is validated first and I see a per-row report before anything is written.
- **Given** a validated import, **when** I confirm, **then** valid rows are created and 1,000 rows complete in under 60 s.
- **Given** invalid rows, **then** they are listed with the reason and are not imported.

### US-B-03 Keep the AI's knowledge fresh `M`
As an **Admin**, I want edits to products, rules and FAQs to reach the AI automatically, so that it never quotes outdated information.

- **Given** I edit a price, **when** the change is saved, **then** subsequent AI answers use the new price and the knowledge index is refreshed.

### US-B-04 Define delivery, payment and return rules `M`
As an **Admin**, I want to define delivery zones with fees, accepted payment methods and the return policy, so that the AI can answer those questions exactly.

- **Given** a rule set, **when** a customer asks about delivery to Sfax, **then** the AI answers with the configured fee and nothing else.

### US-B-05 Prevent the AI from discounting `M`
As an **Owner**, I want the AI to never offer a discount that is not a defined rule, so that it cannot give away margin.

- **Given** no matching discount rule, **when** a customer asks for a lower price, **then** the AI declines politely and hands over with reason `negotiation`.

---

## Epic C. Channel connection

### US-C-01 Connect Instagram and Messenger `M`
As an **Owner**, I want to connect my Instagram and Facebook page, so that the AI can answer there.

- **Given** valid Meta authorisation, **when** I connect, **then** a channel account is stored with encrypted tokens and shown as active.
- **Given** an expired token, **then** the channel health shows an error and I am told how to reconnect.

### US-C-02 Never lose or duplicate an inbound message `M`
As an **Owner**, I want every customer message stored exactly once, so that no sale is missed and no customer is answered twice.

- **Given** Meta delivers the same webhook twice, **then** only one message exists and the AI runs once.
- **Given** the server crashes after acknowledging a webhook, **then** the message is still processed by the recovery sweep.

### US-C-03 One conversation view across channels `M`
As an **Employee**, I want Instagram, Messenger and widget chats in one inbox, so that I do not switch apps.

---

## Epic D. Inbox, conversations, AI autonomy

### US-D-01 Work a prioritised inbox `M`
As an **Employee**, I want conversations that need a human at the top, ordered by urgency, so that I handle the most important first.

- **Given** conversations in `HUMAN_REQUIRED` with priorities critical / high / normal, **then** they are listed in that order, then by wait time.

### US-D-02 See new activity without refreshing `M`
As an **Employee**, I want new messages to appear live, so that I do not poll the page.

- **Given** an open inbox, **when** a customer message is stored, **then** it appears within 2 s.

### US-D-03 Understand why the AI escalated `M`
As an **Employee**, I want a short briefing with the reason, the collected details and a summary, so that I can take over without reading the whole thread.

### US-D-04 Take over from the AI `M`
As an **Employee**, I want to take over a conversation, so that the AI stops replying while I talk.

- **Given** an AI conversation, **when** I take over, **then** `ai_enabled` becomes false, the AI sends nothing more, and the action is confirmed in under 500 ms.

### US-D-05 Give the conversation back to the AI `M`
As an **Employee**, I want to resume the AI, so that routine chat is automated again.

- **Given** a pending order exists on the thread, **when** I resume, **then** it is blocked with `pending_order_blocks_resume`.

### US-D-06 Approve AI replies before they send `M`
As an **Owner**, I want to approve drafts while I build trust, so that nothing goes out unreviewed.

- **Given** reply mode `approval_required`, **then** AI replies are saved as drafts and sent only after approval.
- **Given** reply mode `draft_only`, **then** approval is refused and staff copy the text manually.

### US-D-07 Trust that the AI never invents facts `M`
As an **Owner**, I want every price, stock level and policy in a reply to come from a tool result, so that customers are never misled.

- **Given** the catalog has no matching product, **then** the AI says it does not know and offers a human.
- **Given** a draft reply that contradicts tool data, **then** the guardrail blocks it before send.

### US-D-08 Keep working when the AI provider fails `M`
As an **Employee**, I want the inbox to keep working during an LLM outage, so that I can still reply by hand.

- **Given** the primary model fails, **then** a fallback model is tried; if all fail the message is queued, the owner is notified, and humans can still reply.

### US-D-09 Handle a customer the AI does not understand `M`
As a **customer**, I want a person to take over when the AI is unsure, so that I am not stuck in a loop.

- **Given** low confidence after one clarifying question, **then** the conversation escalates with reason `low_confidence`.

### US-D-10 Close a conversation `M`
As an **Employee**, I want to close a resolved conversation, so that the inbox stays clean.

- **Given** a pending order exists, **when** I close, **then** it is rejected until the order is confirmed or cancelled.

---

## Epic E. Purchase handoff and orders

### US-E-01 AI detects buying intent and collects details `M`
As a **customer**, I want the assistant to ask me only for what is missing (variant, quantity, name, phone, address), one question at a time.

- **Given** "nheb nechri el robe", **then** collection starts and the conversation moves to `ORDER_INTENT_DETECTED`.

### US-E-02 Reserve stock while collecting `M`
As a **merchant**, I want stock held for a customer who is mid-purchase, so that two customers do not buy the last item.

- **Given** stock of 1 and two concurrent buyers, **then** exactly one reservation succeeds.
- **Given** a reservation that is never confirmed, **then** it expires automatically.

### US-E-03 AI creates a pending order and hands off `M`
As a **merchant**, I want a complete pending order created and the customer told that a team member will confirm, so that no detail is lost.

- **Given** all fields collected and stock re-verified, **then** a `PENDING_CONFIRMATION` order is created, the conversation becomes `HUMAN_REQUIRED` with reason `purchase_handoff`, and the last AI message makes no payment or discount promise.

### US-E-04 Stock disappears mid-conversation `M`
As a **customer**, I want honest alternatives if the item sells out, so that I am not promised something unavailable.

- **Given** stock fails the final re-check, **then** no order is created and the AI offers alternatives or escalates with `inventory_conflict`.

### US-E-05 Staff are notified of a new order request `M`
As an **Employee**, I want an in-app notification for each pending order.

### US-E-06 Confirm an order in one action `M`
As an **Employee**, I want to confirm a pending order with one click.

- **Given** a pending order, **when** I confirm, **then** the order becomes `CONFIRMED`, the reservation becomes a stock deduction, and the conversation moves to `ORDER_CONFIRMED`.

### US-E-07 Cancel a pending order `M`
As an **Employee**, I want to cancel a pending order, so that reserved stock is released.

- **Given** a pending order, **when** I cancel, **then** the reservation is released and the conversation is not auto-resumed to the AI.

### US-E-08 Escalate non-purchase situations correctly `M`
As an **Owner**, I want payment disputes, refunds, complaints, legal topics and similar cases to go straight to a human, so that the AI never handles them.

Fourteen exception triggers exist besides the purchase handoff; see the [handoff table in the design](../03-design/04-sequence-flows.md#f8-exception-handoff).

---

## Epic F. Customers and notifications

### US-F-01 Recognise a returning customer `M`
As an **Employee**, I want a returning customer matched across channels, so that I see their history.

### US-F-02 Maintain a customer profile `M`
As an **Employee**, I want to tag customers and add notes, so that context is shared.

### US-F-03 Flag a VIP `M`
As an **Owner**, I want VIP customers flagged, so that they can be escalated to a human.

### US-F-04 Export customer data `S`
As an **Owner**, I want to export my customers, so that I own my data.

### US-F-05 Merge duplicate customers `M`
As an **Admin**, I want to merge two records of the same person.

---

## Epic G. Analytics and plan usage

### US-G-01 See whether the AI is making money `M`
As an **Owner**, I want four KPIs for a chosen period: messages handled (AI vs human), orders created, human handoffs by reason, and conversion.

- **Given** a period, **then** conversion equals confirmed AI-created orders divided by AI-created pending orders, in the business timezone.

### US-G-02 Understand usage against my plan `M`
As an **Owner**, I want to see AI usage against my plan limit.

### US-G-03 Hit my limit without losing customers `M`
As an **Owner**, I want a graceful result at the limit: inbound is still stored and staff are alerted.

### US-G-04 Watch AI cost `S`
As an **Owner**, I want to see average AI cost per conversation.

---

## Cross-cutting acceptance rules

| Rule | Applies to |
|---|---|
| Every tenant-scoped read or write is filtered by workspace; a cross-tenant access is a Sev-1 defect | All stories |
| Every state change that matters is auditable | D, E |
| Every error message says what happened and what to do next | All UI stories |
| Arabic text renders right-to-left, including mixed Latin product names | C, D |
| Duplicate requests (webhook, job, order create) never produce duplicate side effects | C, D, E |
