---

## 6. Epic D — Inbox, conversations, AI autonomy

### US-D-01 — Work a prioritised inbox

**As an** employee, **I want** conversations needing me to appear at the top, **so that** I handle the most valuable and most urgent first.

**Priority:** M · **Requirements:** FR-CONV-001, FR-CONV-002, FR-CONV-003, FR-CONV-004

**AC:**

- Given conversations in mixed states, then those in `HUMAN_REQUIRED` sort above others, ordered by priority `critical` → `high` → `normal`, then oldest handoff first.
- Given I filter by status, channel, or assignee, then the list updates accordingly and the filter persists across navigation within the session.
- Given each row, then it shows customer, channel, last message preview, unread state, status badge, priority badge, and assignee.

---

### US-D-02 — See new activity without refreshing

**As an** employee, **I want** the inbox to update live, **so that** I do not miss a waiting customer.

**Priority:** M · **Requirements:** FR-CONV-005, FR-NOTIF-006

**AC:**

- Given the inbox is open, when a new inbound message arrives, then the conversation appears or moves without a manual refresh.
- Given a conversation escalates while I am viewing the list, then its status and priority badges update in place.
- Given the connection drops, then the UI indicates stale data and recovers automatically when connectivity returns.

---

### US-D-03 — Read the full context of a conversation

**As an** employee taking over, **I want** all context on one screen, **so that** I do not ask the customer to repeat themselves.

**Priority:** M · **Requirements:** FR-CONV-010, FR-CONV-008

**AC:**

- Given I open a conversation, then I see the transcript with sender types visually distinguished, the customer profile, lifecycle stage, order timeline, AI status, and the handoff briefing when present.
- Given long history, then older messages load on demand without losing scroll position.

---

### US-D-04 — Understand why the AI escalated

**As an** employee, **I want** a plain answer to "why did the AI transfer this?", **so that** I know what to do first.

**Priority:** M · **Requirements:** FR-CONV-020, FR-OBS-002, FR-HAND-003

**AC:**

- Given a conversation in `HUMAN_REQUIRED`, then the UI states the escalation reason, priority, and the required action from the briefing.
- Given I am Owner or Admin and I expand the detail, then I see the recorded decision trace: intent, confidence, rules checked, and outcome.
- Given I am an Employee, then I see the briefing, not the raw reasoning trace.
- Given a purchase handoff, then the briefing shows the pending order id and amount.

---

### US-D-05 — Read a summary instead of the whole thread

**As an** employee, **I want** an automatic summary at handoff, **so that** I can act in seconds rather than reading fifty messages.

**Priority:** M · **Requirements:** FR-CONV-019

**AC:**

- Given a conversation enters `HUMAN_REQUIRED`, then a summary is generated and stored covering what the customer wants, their concern, what the AI already collected, the handoff reason, products discussed, and the AI's recommendation.
- Given more than ten new messages arrive before a human opens the thread, then the summary is regenerated.
- Given summary generation fails, then a template-based fallback summary is stored rather than nothing.

---

### US-D-06 — Take over from the AI

**As an** employee, **I want** to take control instantly, **so that** the AI does not talk over me.

**Priority:** M · **Requirements:** FR-CONV-011, FR-CONV-012, FR-HAND-004

**AC:**

- Given an AI-active conversation, when I click Take over, then AI replies are disabled for that conversation and the status becomes `HUMAN_HANDLING` if it was `HUMAN_REQUIRED`.
- Given I simply send a message without clicking Take over, then the AI is disabled for that conversation automatically.
- Given the AI had a job in flight when I took over, then that job does not send a message after my takeover.

---

### US-D-07 — Give the conversation back to the AI

**As an** employee, **I want** to resume AI handling once I have resolved the issue, **so that** routine follow-ups do not stay on my plate.

**Priority:** M · **Requirements:** FR-CONV-013

**AC:**

- Given no order is awaiting confirmation on this conversation, when I click Resume AI, then AI handling re-enables and the status returns to `AI_ACTIVE`.
- Given an order on this conversation is in `PENDING_CONFIRMATION`, when I attempt Resume AI, then it is blocked with an explanation that the order must be confirmed or cancelled first.

---

### US-D-08 — Assign work to a specific person

**As an** admin, **I want** to assign conversations, **so that** two people do not reply to the same customer.

**Priority:** M · **Requirements:** FR-CONV-014

**AC:**

- Given I assign a conversation to a member, then the assignee is shown in the list and detail, and the assignment is recorded with actor and timestamp.
- Given a conversation is reassigned, then the previous assignment is closed and the history is retained.
- Given I filter by "assigned to me", then only my active assignments appear.

---

### US-D-09 — Leave internal notes

**As an** employee, **I want** to write notes only my team can see, **so that** the next person has context without messaging the customer.

**Priority:** M · **Requirements:** FR-CONV-015

**AC:**

- Given I add a note, then it appears in the thread visually distinct from messages and is never delivered to the customer.
- Given any note, then its author and timestamp are shown.

---

### US-D-10 — Approve AI replies before they send

**As a** cautious owner in my first week, **I want** to approve each AI reply, **so that** I build trust before letting it send on its own.

**Priority:** M · **Requirements:** FR-AI-010, FR-AI-011, FR-AI-012, FR-AI-015

**AC:**

- Given my business is new, then the reply mode defaults to `approval_required`.
- Given the AI generates a reply in `approval_required`, then it is stored as a draft, is not delivered, and appears in an actionable queue.
- Given I approve a draft, then it is delivered to the customer and recorded as an AI-sent message.
- Given I edit a draft before approving, then the edited text is delivered and the edit is recorded for quality analysis.
- Given I switch to `auto_send`, then subsequent replies deliver without approval.

---

### US-D-11 — Configure the AI's voice

**As an** owner, **I want** to set my agent's name, tone, and language, **so that** it sounds like my brand and not a generic robot.

**Priority:** M · **Requirements:** FR-AI-002, FR-AI-003, FR-AI-004, FR-AI-007

**AC:**

- Given I set agent name, personality, tone, default language, and greeting, then the next AI reply reflects them without a redeploy.
- Given I set the default language to Arabic, then replies default to Arabic while still matching a customer who writes in French.
- Given I adjust the confidence threshold, then escalation behaviour changes on the next turn.

---

### US-D-12 — Trust that the AI never invents facts

**As an** owner, **I want** guaranteed grounding, **so that** the AI never quotes a price or stock level that is not real.

**Priority:** M · **Requirements:** FR-AI-020, FR-AI-021, FR-AI-023

**AC:**

- Given a customer asks the price of a product, then the figure in the reply matches the current variant price exactly and the tool call is logged for that turn.
- Given a product does not exist in my catalog, then the AI says it is unavailable and offers alternatives or handoff, and never describes a fabricated item.
- Given a stock check returns zero, then the AI does not offer the item as purchasable.
- Given tools return conflicting data, then the AI states uncertainty and offers handoff instead of choosing.

---

### US-D-13 — Handle a customer the AI does not understand

**As an** owner, **I want** the AI to ask once and then get help, **so that** confused customers are not trapped in a loop.

**Priority:** M · **Requirements:** FR-AI-024

**AC:**

- Given classifier confidence is below the threshold, then the AI asks exactly one clarifying question.
- Given the following turn is also below the threshold, then the conversation escalates with reason `low_confidence` at normal priority.
- Given escalation, then the AI sends no further autonomous replies on that conversation.

---

### US-D-14 — Keep working when the AI provider fails

**As an** owner, **I want** the product to degrade gracefully, **so that** an outage at a model vendor does not silently lose my customers.

**Priority:** M · **Requirements:** FR-AI-028, FR-AI-029, NFR-REL-07

**AC:**

- Given the primary model errors, then the system retries with the fallback model and the message is answered normally.
- Given all model attempts fail or exceed the latency ceiling, then the conversation escalates to human with an integration or timeout reason and I am notified.
- Given an outage, then the inbox remains usable and humans can still send messages.
- Given an outage, then no degraded or empty AI message is delivered to the customer.

---

### US-D-15 — Close a conversation

**As an** employee, **I want** to close resolved conversations, **so that** my queue reflects real work.

**Priority:** M · **Requirements:** FR-CONV-016, FR-CONV-017

**AC:**

- Given I close a conversation, then its status becomes `RESOLVED` and it leaves the active queue.
- Given a closed conversation receives a new inbound message, then it reopens into the appropriate active state.
- Given a conversation has no activity for the configured window and no pending order, then it auto-closes and the transition is logged as system-initiated.

---

### US-D-16 — Know who matters without opening anything

**As an** owner with 200 conversations today, **I want** the list ordered by who is worth my attention, **so that** I never scroll looking for the buyer.

**Priority:** M · **Requirements:** FR-CONV-031, FR-CONV-032, FR-CONV-033, FR-CONV-034, FR-LEAD-009

**AC:**

- Given conversations in mixed states, then those needing a human appear above all AI-handled ones regardless of lead score.
- Given two conversations both needing a human, then the higher handoff priority sorts first, and equal priorities sort oldest-waiting first.
- Given AI-handled conversations, then they sort by temperature, then score, then recency.
- Given an angry customer scoring 20 and a hot lead scoring 95, then the angry customer appears first.
- Given I open the inbox for the first time in a session, then the default view is "Needs me", not "All".
- Given a list card, then it shows customer, message snippet, temperature badge, product of interest, value, channel, assignee, and relative time without my opening it.

---

### US-D-17 — Work every channel in one place

**As an** employee, **I want** one inbox for Instagram and Messenger, **so that** I am not switching apps to find out who is waiting.

**Priority:** M · **Requirements:** FR-CONV-035, FR-CONV-036

**AC:**

- Given conversations from multiple channels, then they appear in a single list with a channel icon per row.
- Given I filter by channel, then the list narrows without leaving the unified view.
- Given I have not connected a given channel, then it does not appear as a filter option at all.
- Given the product, then there is no per-channel page anywhere in the navigation.

---

### US-D-18 — Get the customer's context beside the chat

**As an** employee, **I want** identity, lead state, and history next to the conversation, **so that** I can act without opening three screens.

**Priority:** M · **Requirements:** FR-CONV-030, FR-CONV-039, FR-CONV-040, FR-CONV-041, FR-CONV-042

**AC:**

- Given an open conversation, then the right pane shows name, phone, product of interest, lead score, plain-language status, and a timeline of what has happened.
- Given the timeline, then it merges messages, state changes, AI actions, and order events in chronological order.
- Given the panel, then no more than four primary actions are offered and they match the conversation's current state.
- Given a stored phone number, then the call action opens a telephone link rather than requiring me to copy the number.

---

### US-D-19 — Trust the lead score

**As an** owner, **I want** to see why a lead is hot, **so that** I believe the ordering instead of ignoring it.

**Priority:** M · **Requirements:** FR-LEAD-001, FR-LEAD-003, FR-LEAD-007, FR-LEAD-002

**AC:**

- Given a scored conversation, then I can reveal the contributing signals and their point values.
- Given the score is displayed, then it is never labelled as a probability or likelihood of purchase.
- Given a purchase intent is detected, then the score rises and the temperature badge updates without a refresh.
- Given a conversation is resolved or its order cancelled, then the score resets.
- Given scoring runs, then no LLM call is made for it.

---

### US-D-20 — Let the AI help while I am the one replying

**As an** employee handling a conversation, **I want** a suggested reply I can send or edit, **so that** I keep the AI's speed while keeping control.

**Priority:** M · **Requirements:** FR-AI-016, FR-AI-017, FR-AI-018, FR-AI-019, FR-AI-020a, FR-AI-020b

**AC:**

- Given I am handling a conversation, when I request a suggestion, then a grounded draft appears with send, edit, and dismiss actions.
- Given a suggestion is displayed during `HUMAN_REQUIRED`, then nothing is delivered to the customer until I act — the paused-AI guarantee still holds.
- Given the conversation is a complaint or refund, then no suggestion is offered.
- Given I send a suggestion, then it is recorded as an AI message flagged as human-approved.
- Given I edit before sending, then the edited text is sent and the edit is captured for quality analysis.
- Given suggestions are generated, then each generation is recorded in AI usage and is not triggered on every keystroke.

---

### US-D-21 — See my sales as a pipeline

**As an** owner, **I want** a Kanban view of leads and orders, **so that** I can see where revenue is stuck.

**Priority:** M · **Requirements:** FR-CONV-050, FR-CONV-051, FR-CONV-052, FR-CONV-053

**AC:**

- Given the pipeline page, then I see four columns — new leads, qualified, payment pending, sold — each with a count and total value.
- Given a card, then it shows customer, product, value, and temperature, and opens the conversation when clicked.
- Given the payment-pending column, then card copy states the order is awaiting my confirmation, never awaiting customer payment.
- Given the pipeline, then it introduces no status that does not already exist on a conversation or an order.

---

### US-D-22 — Not be spammed

**As an** owner, **I want** to be notified only when something needs me, **so that** I keep notifications turned on.

**Priority:** M · **Requirements:** FR-NOTIF-010, FR-NOTIF-011, FR-NOTIF-012, FR-NOTIF-013, FR-NOTIF-014

**AC:**

- Given the AI is handling conversations normally, then I receive no notifications at all.
- Given a hot lead, an order request, AI uncertainty, or an angry customer, then I am notified.
- Given the same conversation triggers the same type repeatedly, then I receive at most one notification per hour for it.
- Given several hot leads within a short window, then they arrive as one grouped notification.
- Given a non-critical notification, then it accumulates in the notification centre rather than interrupting me.

---

### US-D-23 — Keep a correct screen when the connection drops

**As an** employee on a weak mobile connection, **I want** the inbox to stay accurate, **so that** I do not miss a customer because a socket died.

**Priority:** M · **Requirements:** FR-RT-001, FR-RT-003, FR-RT-004, FR-RT-005

**AC:**

- Given an open inbox, when a message arrives, then it appears within the realtime latency target without a refresh.
- Given my connection drops, then the UI indicates the degraded state and continues updating by polling.
- Given my connection is restored, then the client refetches the list and open thread so no missed event leaves the screen wrong.
- Given any pushed update, then the same data is retrievable through the REST API.

---

## 7. Epic E — Purchase handoff and orders

This epic is the product's core value loop. Trigger definitions and priorities are canonical in `06_AI_HUMAN_HANDOFF_RULES.md`.

### US-E-01 — AI detects buying intent and collects details

**As an** owner, **I want** the AI to gather order information when someone wants to buy, **so that** I receive a ready-to-confirm order instead of a raw chat.

**Priority:** M · **Requirements:** FR-HAND-008, FR-CUST-003

**AC:**

- Given a customer expresses intent to buy, then the AI confirms the specific product and variant before collecting anything else.
- Given collection begins, then the AI asks for one piece of information per turn (name, phone, address, quantity), not all at once.
- Given the customer provides information, then it is validated and written to the customer record.
- Given the customer supplies an unparseable phone number, then the AI asks again once with a format hint before escalating.
- Given collection is in progress, then the conversation status is `ORDER_INTENT_DETECTED`.

---

### US-E-02 — AI reserves stock during collection

**As an** owner, **I want** the last unit held while details are collected, **so that** I do not sell the same item to two customers.

**Priority:** M · **Requirements:** FR-ORD-010, FR-ORD-011, FR-ORD-012

**AC:**

- Given the AI confirms a variant with buying intent, then a reservation is created for the requested quantity with a 30-minute expiry.
- Given a reservation is active, then available stock reported to other conversations excludes it.
- Given the order is created, then the reservation is marked committed.
- Given collection is abandoned or the reservation expires, then it is released by the sweep job and stock becomes available again.
- Given only one unit exists and two conversations reach intent simultaneously, then exactly one reservation succeeds and the other customer is offered alternatives.

---

### US-E-03 — AI creates a pending order and hands off

**As an** owner, **I want** a real order record the moment the customer is ready, **so that** nothing depends on someone reading the chat.

**Priority:** M · **Requirements:** FR-ORD-001, FR-ORD-002, FR-HAND-002, FR-HAND-003, FR-HAND-004

**AC:**

- Given all required fields are collected, then the AI re-verifies stock and creates an order with status `PENDING_CONFIRMATION` and payment status `NOT_COMPLETED`.
- Given the order is created, then it stores the customer snapshot, line items with unit prices, total, currency, source conversation, and AI as creator.
- Given the order is created, then the AI triggers handoff with reason `purchase_handoff` at high priority, the conversation becomes `HUMAN_REQUIRED`, and AI replies are disabled.
- Given handoff, then a briefing is persisted containing identity, summary, products, reason, order id, amount, and required action.
- Given handoff, then the AI tells the customer a team member will confirm, and makes no promise about payment method, timing, or discount.

---

### US-E-04 — Stock disappears mid-conversation

**As an** owner, **I want** the AI to handle a sold-out item gracefully, **so that** I never have to cancel an order I could not fulfil.

**Priority:** M · **Requirements:** FR-HAND-009

**AC:**

- Given stock fell to zero between the first check and order creation, then no order is created.
- Given this situation, then the AI apologises, states the item is unavailable, and offers in-stock alternatives.
