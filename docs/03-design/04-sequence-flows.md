# 04. Flows and Sequence Diagrams

Every significant flow in the system, each with: **purpose**, **actors**, **preconditions**, a **sequence diagram**, a **step-by-step explanation**, and **failure and edge cases**. Flows are grouped as:

| Group | Flows |
|---|---|
| Setup | F1 Register and create workspace, F2 Invite teammate, F3 Catalog CSV import, F4 Knowledge indexing, F5 Connect a channel, F16 AI activation gates, F17 Playground |
| The message path | F6 Inbound webhook, F7 AI turn, F12 Outbound delivery, F13 Reply modes and approval, F14 AI suggestion, F15 LLM failure fallback |
| Handoff and orders | F8 Exception handoff, F9 Purchase collection and pending order, F10 Takeover and resume, F11 Confirm or cancel an order, F20 Reservation expiry |
| Platform | F18 KPI rollup, F19 Realtime updates |

Four principles run through all of them. Reading them first makes every diagram easier to follow.

| Principle | Meaning |
|---|---|
| **Persist, acknowledge, then enqueue** | A webhook is stored durably before the `200` is returned. The LLM is never awaited in the request. |
| **Facts come from tools** | Prices, stock and policies enter a reply only from tool results, never from model memory. |
| **One writer per state** | Only `ConversationService` changes conversation status; only `OrderService` changes orders; only `InventoryService` changes stock. |
| **At-least-once, effect-once** | Jobs and webhooks may repeat; unique keys and deterministic job ids make repeats harmless. |

---

## F1. Register and create workspace

**Purpose:** a new merchant gets an account and an isolated workspace.
**Actors:** Merchant, Web app, API, Database.
**Preconditions:** none.

```mermaid
sequenceDiagram
    actor M as Merchant
    participant W as Web app
    participant A as Auth service
    participant B as Business service
    participant DB as PostgreSQL

    M->>W: Submit email and password
    W->>A: POST register
    A->>A: Validate email format and password strength
    A->>DB: Insert user if email unused
    alt email already exists
        DB-->>A: Unique violation
        A-->>W: 409 email_in_use
        W-->>M: Show clear error
    else created
        DB-->>A: User row
        A->>DB: Create session
        A-->>W: 201 with session cookie
    end
    M->>W: Enter business name, timezone, currency
    W->>B: POST businesses
    B->>DB: Begin transaction
    B->>DB: Insert business
    B->>DB: Seed default roles and permissions
    B->>DB: Insert member as Owner
    B->>DB: Insert onboarding row with all gates false
    B->>DB: Commit
    B-->>W: 201 business and tenant context
    W-->>M: Open onboarding checklist
```

**Explanation**

1. Registration creates the user and a session. Passwords are hashed; the session cookie is HTTP-only.
2. Creating the workspace is **one transaction**: the business, its default roles, the Owner membership and the onboarding checklist all succeed or none do, so there is never a workspace without an owner.
3. From this point every request carries a tenant context derived from the session; the client never supplies `business_id`.

**Failure and edge cases:** duplicate email returns 409 without revealing which field failed beyond what is safe; weak password returns a field-level error; a failure after the user insert but before the workspace creation leaves a user with no workspace, and the UI resumes at "create workspace".

---

## F2. Invite a teammate

**Purpose:** an Owner or Admin adds a colleague with a role.
**Actors:** Owner/Admin, Invitee, API, Email service.
**Preconditions:** inviter has the `team.invite` permission.

```mermaid
sequenceDiagram
    actor O as Owner or Admin
    actor I as Invitee
    participant API as Business service
    participant G as Tenant guard
    participant DB as PostgreSQL
    participant E as Email service

    O->>API: POST invitations with email and role
    API->>G: Check team.invite permission
    alt role is Owner
        API-->>O: 403 cannot invite owner
    else allowed
        API->>DB: Insert invitation with hashed token and expiry
        API->>E: Send email with one-time link
        API-->>O: 201 invitation pending
    end
    I->>API: Open link and accept
    API->>DB: Find invitation by token hash
    alt expired or already used
        API-->>I: 410 invitation_invalid
    else valid
        API->>DB: Create or link user, insert member with invited role
        API->>DB: Mark invitation accepted
        API-->>I: Signed in to the workspace
    end
```

**Explanation:** only a **hash** of the token is stored, so a database leak does not reveal live links. The invitee receives exactly the role that was invited; there is no way to accept as a higher role.

**Edge cases:** inviting an existing member is rejected; inviting as Owner is always 403; removing the sole Owner is 403; an expired link can be re-issued.

---

## F3. Catalog CSV import

**Purpose:** load many products at once, safely.
**Actors:** Admin, API, Worker (`catalog` queue), Database.
**Preconditions:** `catalog.write` permission.

```mermaid
sequenceDiagram
    actor A as Admin
    participant API as Catalog API
    participant Q as Job queue
    participant V as Validate worker
    participant R as Run worker
    participant DB as PostgreSQL
    participant X as Embedding queue

    A->>API: Upload CSV
    API->>DB: Insert import run status uploaded
    API->>Q: Enqueue validate_import
    API-->>A: 202 with import id
    Q->>V: validate_import
    V->>V: Parse rows and check price, stock, required fields
    V->>DB: Save per-row errors, status validated
    A->>API: GET import report
    API-->>A: Counts and list of invalid rows with reasons
    A->>API: POST confirm
    API->>Q: Enqueue run_import
    Q->>R: run_import
    R->>DB: Upsert valid products and variants in batches
    R->>DB: Status succeeded
    R->>X: Enqueue reindex_business
    API-->>A: Notification import finished
```

**Explanation:** the two jobs are separate on purpose. The user always sees a **preview report** (valid, invalid and why) before anything is written. Rows are written in batches; the target is 1,000 rows in under 60 seconds. A finished import triggers re-indexing so the AI knows the new products (F4).

**Failure and edge cases:** an unreadable file fails at `uploaded`; invalid rows are never imported and never block valid rows; re-confirming the same import is a no-op because the job id is `{importId}:run`.

---

## F4. Knowledge indexing (retrieval for the AI)

**Purpose:** keep what the AI can retrieve in sync with the catalog, rules and FAQs.
**Actors:** Admin, API, Embedding worker, Embedding model, Database with vector support.

```mermaid
sequenceDiagram
    actor A as Admin
    participant API as Knowledge API
    participant DB as PostgreSQL with vectors
    participant Q as Embedding queue
    participant W as Index worker
    participant EM as Embedding model

    A->>API: Save product, FAQ or policy document
    API->>DB: Store document with content hash, status pending
    API->>Q: Enqueue index_document with id and hash
    Q->>W: index_document
    W->>DB: Load document and existing chunk hashes
    W->>W: Split into chunks
    loop each changed chunk
        W->>EM: Embed chunk text
        EM-->>W: Vector
        W->>DB: Upsert embedding row
    end
    W->>DB: Delete chunks no longer present
    W->>DB: Status ready
```

**Explanation:** the job id includes the **content hash**, so saving unchanged text does not re-embed anything, and saving the same change twice produces one job. Only changed chunks call the embedding model, which controls cost. During indexing the status is `indexing`; if embedding fails after retries it becomes `failed` and the owner sees a retry action.

**Edge cases:** retrieval always filters by `business_id` first, so one shop can never retrieve another's chunks.

---

## F5. Connect a channel (Instagram and Messenger)

**Purpose:** let the AI receive and send on the merchant's accounts.
**Actors:** Owner, Web app, API, Meta, Secret store.
**Preconditions:** `integrations.manage` permission. A Meta app is configured.

```mermaid
sequenceDiagram
    actor O as Owner
    participant W as Web app
    participant API as Integrations API
    participant M as Meta
    participant V as Secret store
    participant DB as PostgreSQL

    O->>W: Click Connect Instagram or Messenger
    W->>API: GET connect url
    API->>API: Create state value bound to session and business
    API-->>W: Redirect URL
    W->>M: Redirect Owner to Meta consent
    O->>M: Choose page and grant permissions
    M-->>W: Redirect back with code and state
    W->>API: POST callback with code and state
    API->>API: Verify state matches session
    API->>M: Exchange code for access token
    M-->>API: Token and page information
    API->>V: Store token, receive reference
    API->>DB: Insert channel account status pending with credentials reference
    API->>M: Subscribe page to webhook events
    API->>M: Verify subscription
    API->>DB: Status active
    API-->>W: Channel connected
```

**Explanation:** the OAuth `state` is bound to the session, which blocks cross-site request forgery. The access token **never touches the database**: only a reference to the secret store is saved. The channel is `active` only after the webhook subscription is verified, so gate G3 (F16) cannot be satisfied by a half-connected account.

**Edge cases:** denied consent leaves the account `pending` with a message; a daily job (`check_channel_tokens`) marks accounts `error` before tokens expire and notifies the owner; disconnecting keeps all conversation history.

---

## F6. Inbound webhook: persist, acknowledge, enqueue

**Purpose:** receive a customer message with zero loss and no duplication, quickly.
**Actors:** Customer, Meta, Webhook controller, Database, Queue, Worker.
**Non-functional targets:** acknowledgement p95 under 500 ms (NFR-PERF-01), no acknowledged message lost (NFR-REL-02).

```mermaid
sequenceDiagram
    actor C as Customer
    participant M as Meta
    participant WH as Webhook controller
    participant DB as PostgreSQL
    participant Q as Job queue
    participant WK as retry_webhook_processing worker
    participant CS as Conversation service
    participant RT as Realtime gateway

    C->>M: Sends message
    M->>WH: POST webhook with signature header
    WH->>WH: Verify HMAC signature
    alt invalid signature
        WH-->>M: 401, nothing stored
    else valid
        WH->>DB: Insert integration event on conflict do nothing
        alt duplicate already processed
            WH-->>M: 200 and stop
        else new or unprocessed
            WH->>Q: Enqueue job with id = event id
            alt enqueue failed
                WH-->>M: non-200 so Meta retries
            else enqueued
                WH-->>M: 200 acknowledged
            end
        end
    end
    Q->>WK: retry_webhook_processing
    WK->>WK: Map raw payload to canonical inbound
    WK->>DB: Check channel account is active
    WK->>DB: Resolve or create customer identity
    WK->>DB: Insert message on conflict do nothing
    WK->>CS: NEW to AI_ACTIVE if first message
    WK->>DB: Update last message time and preview
    WK->>Q: Enqueue score_lead
    opt AI should answer
        WK->>Q: Enqueue process_inbound_message
    end
    WK->>RT: Emit conversation.message
    WK->>DB: Set event processed_at
```

**Explanation**

1. **Verify first.** An invalid signature is rejected before anything is stored.
2. **Persist before acknowledging.** The raw event is the durable record. If the server dies after the `200`, the row exists with `processed_at` empty.
3. **Idempotent insert.** A duplicate delivery hits the unique constraint and is a no-op.
4. **Never wait for the LLM.** The webhook handler only stores and enqueues; mapping and AI happen in workers.
5. **The worker is also idempotent.** Every step can be repeated: the message insert, attachment insert and job ids are all deduplicated.
6. **AI only when appropriate.** The worker enqueues an AI turn only if `ai_enabled`, the agent is enabled, the usage cap is not exceeded, the reply mode allows a turn and the channel is active. Otherwise the inbound message is still stored and the inbox updates.

**Failure and edge cases**

| Case | Behaviour |
|---|---|
| Crash after `200`, before the worker finishes | A sweep job re-processes events where `processed_at` is empty and older than 30 s |
| Channel not active | Event marked processed, **no** customer message created |
| Delivery receipt or echo, not a customer message | Not treated as a customer message |
| Enqueue fails | Non-200 so Meta retries; the duplicate insert is harmless |
| Deauthorise callback | Handled as a lifecycle event; channel set to `disconnected` |

---

## F7. AI turn (`processTurn`)

**Purpose:** produce a grounded reply, or decide to hand over.
**Actors:** AI worker, Orchestrator, Intent classifier, Policy engine, Tools, LLM gateway, Guardrails, Database.
**Constraint:** at most one AI turn runs per conversation at a time.

```mermaid
sequenceDiagram
    participant Q as Job queue
    participant WK as process_inbound_message worker
    participant R as Redis lock
    participant O as AI orchestrator
    participant IC as Intent classifier
    participant PE as Policy engine
    participant T as Tool executor
    participant L as LLM gateway
    participant G as Guardrails
    participant DB as PostgreSQL

    Q->>WK: process_inbound_message
    WK->>R: SET conversation lock token with NX and 30 s expiry
    alt lock held by another turn
        WK->>Q: Delay 2 s and retry, do not drop
    else lock acquired
        WK->>WK: Start heartbeat to extend lock every 10 s
        WK->>O: processTurn
        O->>IC: Classify intent of latest message
        IC-->>O: Intent and confidence
        O->>PE: Check policy before generating
        alt exception trigger matched
            PE-->>O: Escalate with reason and priority
            O->>O: Prepare handoff briefing
        else answerable
            loop up to 8 tool calls and 2 rounds
                O->>L: Prompt with rules, history, tool schema
                L-->>O: Tool call request or final text
                O->>T: Execute allowed tool for this business
                T->>DB: Read catalog, stock or policy
                T-->>O: Tool result
            end
            O->>G: Verify draft against tool results and rules
            alt guardrail fails
                G-->>O: Reject
                O->>O: Regenerate once, else escalate low confidence
            else pass
                G-->>O: OK
            end
        end
        O-->>WK: TurnResult with reply and intended transition
        WK->>R: Check lock token still ours
        WK->>DB: Persist outbound message, actions, trace, usage
        WK->>DB: Apply intended transition through Conversation service
        WK->>R: Release lock only if token matches
    end
```

**Explanation**

1. **Serialise per conversation.** A Redis lock with a token and expiry stops two turns racing on one thread. A heartbeat extends it for long turns; the release is compare-and-delete so a slow worker cannot free someone else's lock.
2. **Policy before generation.** Exception triggers (refund, complaint, legal, and so on) are detected **before** the model writes anything, so the AI never improvises on those topics.
3. **Bounded tool loop.** The model may request tools; the executor validates each request against the current mode, scopes it to the business, and logs it. Hard caps stop runaway loops and cost.
4. **Guardrails verify the draft** against the tool facts and business rules (no invented price, no discount without a rule, no payment promise). One regeneration is allowed, then the turn escalates.
5. **Re-check the lock before any side effect.** If the lock was lost, sending is aborted; only a handoff that already created a pending order is still applied, so an order is never orphaned.
6. **Everything is recorded:** the actions, a decision trace for debugging, and token usage for cost tracking.

**Failure and edge cases:** tool failure produces an honest "I am not sure" reply and an `integration_failure` escalation; a model timeout triggers the fallback (F15); a duplicate job id is ignored by the queue.

---

## F8. Exception handoff

**Purpose:** pass topics the AI must not handle straight to a human with a useful briefing.
**Actors:** AI orchestrator, Policy engine, Conversation service, Notification service, Staff.

There are **15 triggers**; 14 are exceptions and one (#1) is the successful end of a purchase (F9).

| # | Situation | `escalation_reason` | Priority |
|---|---|---|---|
| 1 | Purchase completion (no online payment) | `purchase_handoff` | high |
| 2 | Payment issue (claims already paid, amount dispute) | `payment_issue` | critical |
| 3 | Refund request | `refund_request` | critical |
| 4 | Return or exchange | `return_exchange` | high |
| 5 | Complaint or negative sentiment | `complaint` | critical |
| 6 | Low confidence after one clarifying question | `low_confidence` | normal |
| 7 | Customer asks for a human | `human_request` | high |
| 8 | Negotiation or discount with no matching rule | `negotiation` | high |
| 9 | Custom or out-of-catalog order | `custom_order` | high |
| 10 | VIP or high-value customer (when the flag is on) | `vip_customer` | critical |
| 11 | Bulk or large quantity | `bulk_order` | high |
| 12 | Legal or sensitive topic | `legal_sensitive` | critical |
| 13 | Inventory conflict | `inventory_conflict` | high |
| 14 | Conflicting business rules | `policy_conflict` | normal |
| 15 | Integration or tool failure | `integration_failure` | critical |

```mermaid
sequenceDiagram
    actor C as Customer
    participant O as AI orchestrator
    participant PE as Policy engine
    participant HS as Handoff service
    participant CS as Conversation service
    participant DB as PostgreSQL
    participant N as Notification service
    participant RT as Realtime gateway
    actor S as Staff

    C->>O: "Ena ma jitnish el commande w nheb remboursement"
    O->>PE: Check triggers before generation
    PE-->>O: refund_request critical
    O->>HS: Build briefing from context
    HS-->>O: reason, priority, summary, collected fields
    O->>O: Write short pause message from the escalation prompt only
    O->>DB: Save briefing on conversation
    O->>CS: Transition to HUMAN_REQUIRED, ai_enabled false
    CS->>DB: Append status event
    CS-->>N: conversation.state_changed
    N->>DB: Create notification with dedupe key
    N-->>S: In-app alert
    CS-->>RT: conversation.handoff
    RT-->>S: Inbox moves thread to top by priority
    O-->>C: "Un membre de l'equipe va vous repondre"
```

**Explanation**

- If two triggers match in one turn, the **higher priority wins**; at equal priority the more specific commercial or legal reason beats `low_confidence`. The losing reason is stored in the briefing for audit.
- The briefing is saved **before** the final customer-facing reply, so the human always has context. A handoff without a valid briefing is treated as a defect.
- The AI's last message makes no promise about money, refunds, or outcomes. It only says a person will follow up.
- The inbox orders threads by priority (critical, high, normal) and then by waiting time.
- `purchase_handoff` notifications are sent as **order requests** (F9), not as generic handoff alerts, to avoid double notification.

**Edge cases:** an exception raised mid-collection moves `ORDER_INTENT_DETECTED` to `HUMAN_REQUIRED` without creating a new order, but keeps any reservation or order that already exists.

---

## F9. Purchase collection and pending order

**Purpose:** turn buying intent into a complete pending order a human can confirm in one click.
**Actors:** Customer, AI orchestrator, Tools, Inventory service, Order service, Conversation service, Staff.
**Key rule:** the purchase close is **code, not a prompt**: search, check stock, reserve, collect, re-check, create order, hand off.

```mermaid
sequenceDiagram
    actor C as Customer
    participant O as AI orchestrator
    participant T as Tools
    participant INV as Inventory service
    participant ORD as Order service
    participant CS as Conversation service
    participant DB as PostgreSQL
    participant N as Notification service
    actor S as Staff

    C->>O: "Nheb nechri el robe el zarka"
    O->>T: search_products
    T-->>O: Matching variants with price and stock
    O->>CS: Transition to ORDER_INTENT_DETECTED
    O->>C: Ask which size
    C-->>O: "M"
    O->>T: check_inventory
    T-->>O: Available
    O->>INV: reserve_stock for this conversation, short expiry
    INV->>DB: Atomic conditional insert if stock minus reserved is enough
    INV-->>O: Reservation active
    loop until complete, one question per turn
        O->>C: Ask next missing field
        C-->>O: Provides name, phone, address, quantity
    end
    O->>T: check_inventory final re-check
    alt still available
        T-->>O: OK
        O->>ORD: createPending with idempotency key
        ORD->>DB: Insert order and items as snapshots
        ORD-->>O: Order PENDING_CONFIRMATION
        O->>CS: Transition to HUMAN_REQUIRED, purchase_handoff, high
        O->>C: "Votre commande est enregistree, un membre de l'equipe la confirme"
        ORD-->>N: order.pending_confirmation
        N-->>S: Order request notification
    else stock gone
        T-->>O: Unavailable
        O->>INV: Release reservation
        O->>C: Offer alternatives or escalate inventory_conflict
    end
```

**Explanation**

1. **Intent is not enough.** "Nheb nechri" only starts collection. A handoff happens only when all required fields are present, stock has been re-verified, and the pending order exists.
2. **One question per turn** keeps messages short for a phone screen and makes the collected state easy to resume.
3. **Reserve early, commit late.** Holding stock during collection prevents selling the last item twice; the hold expires if the customer disappears (F20).
4. **Re-check at the end** because minutes may have passed between the first check and the last field.
5. **Idempotency key on the order** means a retried turn or double submission returns the same order.
6. **No payment, discount or delivery-date promises** appear in the closing message; those belong to the human.

**Failure and edge cases:** the lock token is re-checked before `reserve_stock` and `createPending`; in `suggest` and `playground` modes these tools are blocked, so test conversations never reserve real stock.

---

## F10. Takeover and resume

**Purpose:** a human can stop the AI and later give the thread back.
**Actors:** Staff, API, Conversation service.

```mermaid
sequenceDiagram
    actor S as Staff
    participant API as Conversations API
    participant CS as Conversation service
    participant DB as PostgreSQL
    participant RT as Realtime gateway

    S->>API: POST take over
    API->>CS: takeOver(conversationId, userId)
    CS->>DB: ai_enabled false, assign to user
    alt status is HUMAN_REQUIRED
        CS->>DB: Status HUMAN_HANDLING
    else status AI_ACTIVE or ORDER_INTENT_DETECTED
        CS->>DB: Status unchanged
    end
    CS->>DB: Append status event
    CS-->>RT: conversation.updated
    API-->>S: 200 within 500 ms
    S->>API: POST send human message
    API->>DB: Insert message queued, sender human
    API-->>S: 201
    Note over S,RT: Later, after the issue is handled
    S->>API: POST resume AI
    API->>CS: resume
    CS->>DB: Check for orders in PENDING_CONFIRMATION
    alt pending order exists
        CS-->>API: 409 pending_order_blocks_resume
        API-->>S: Explain: confirm or cancel the order first
    else none
        CS->>DB: ai_enabled true, status AI_ACTIVE
        API-->>S: 200
    end
```

**Explanation:** taking over only flips `ai_enabled`; inbound messages are still stored while a human is handling. **Resume is always an explicit click** and is blocked while an order awaits confirmation, because the AI could otherwise chat about an order a human has not decided on. Assigning a conversation to a person does not pause or resume the AI by itself.

---

## F11. Confirm or cancel an order

**Purpose:** one human action settles a pending order and updates everything that depends on it.
**Actors:** Staff, Order service, Inventory service, Conversation service, Customer service, Analytics, Notifications.

```mermaid
sequenceDiagram
    actor S as Staff
    participant API as Orders API
    participant ORD as Order service
    participant INV as Inventory service
    participant DB as PostgreSQL
    participant EV as Domain events
    participant CS as Conversation service
    participant AN as Analytics
    participant CU as Customer service

    S->>API: POST confirm order
    API->>ORD: confirm(orderId, actor)
    ORD->>DB: Begin transaction, lock order row
    alt status not PENDING_CONFIRMATION
        ORD-->>API: 409 invalid_state
    else pending
        ORD->>INV: commit reservation
        INV->>DB: Decrement stock, write ledger entry, reservation committed
        ORD->>DB: Status CONFIRMED, set confirmed time
        ORD->>DB: Commit
        ORD-->>EV: order.confirmed after commit
        EV->>CS: Move conversation to ORDER_CONFIRMED
        EV->>AN: Count toward conversion
        EV->>CU: Advance lifecycle and order count
        API-->>S: 200
    end
    Note over S,CU: Cancel path
    S->>API: POST cancel order
    API->>ORD: cancel(orderId, actor)
    ORD->>INV: release reservation
    ORD->>DB: Status CANCELLED
    ORD-->>EV: order.cancelled
    EV->>CS: Update only, no auto resume of AI
```

**Explanation:** confirmation is one transaction covering the order status, the stock decrement and the ledger entry, so stock and orders can never disagree. Side effects happen **after commit** through events, which keeps the money-like path small and lets handlers be retried safely. Cancelling releases the reservation and deliberately does **not** hand the conversation back to the AI.

---

## F12. Outbound delivery with retry

**Purpose:** send a stored message to the channel reliably, without blocking the user.
**Actors:** Sender (AI worker or staff), API, Queue, Delivery worker, Channel adapter, Meta.

```mermaid
sequenceDiagram
    participant S as Sender
    participant API as API or AI worker
    participant DB as PostgreSQL
    participant Q as Job queue
    participant DW as deliver_outbound worker
    participant AD as Channel adapter
    participant M as Meta Graph API
    participant RT as Realtime gateway

    S->>API: Create outbound message
    API->>DB: Insert message queued
    API->>Q: Enqueue deliver_outbound with job id = message id
    API-->>S: 201 immediately
    Q->>DW: deliver_outbound
    DW->>DB: Load message and channel account
    DW->>AD: send canonical outbound
    AD->>M: Graph API call using token from secret store
    alt accepted
        M-->>AD: Message id
        DW->>DB: Status sent, store external id
        DW-->>RT: message.sent
    else provider error
        AD-->>DW: Error
        DW->>Q: Retry 5 s, then 10 s
        alt retries exhausted
            DW->>DB: Status failed
            DW-->>RT: message.failed
            Note over DW: Dead-letter queue alert raised
        end
    end
    M-->>DW: Later delivery receipt webhook
    DW->>DB: Status delivered
```

**Explanation:** the HTTP request never waits for Meta; it returns once the message is stored and queued. The job id equals the message id, so the same message is never sent twice. After three attempts the message is `failed`, an alert fires, and the inbox shows a **retry** button for staff.

---

## F13. Reply modes and draft approval

**Purpose:** let owners build trust gradually by controlling whether AI replies send themselves.

```mermaid
sequenceDiagram
    participant O as AI worker
    participant RMP as Reply mode policy
    participant DB as PostgreSQL
    participant Q as Job queue
    participant W as Inbox UI
    actor S as Staff

    O->>RMP: Decide delivery for this reply
    RMP->>DB: Read reply mode and shadow flag
    alt auto_send and not shadow
        RMP-->>O: Queue for sending
        O->>DB: Insert message queued
        O->>Q: Enqueue send_ai_reply then deliver_outbound
    else approval_required
        RMP-->>O: Store as draft
        O->>DB: Insert message draft
        DB-->>W: Draft appears with Approve and Edit
        S->>W: Approve, optionally after editing
        W->>DB: Status queued
        W->>Q: Enqueue deliver_outbound
    else draft_only
        RMP-->>O: Store as draft, never sendable by approval
        O->>DB: Insert message draft
        S->>W: Try Approve
        W-->>S: 409, copy text and send as a normal human message
    end
```

**Explanation:** a **new business starts in `approval_required`**, so the AI proposes and a human sends. The owner moves to `auto_send` when satisfied. An approved or edited AI suggestion still counts as AI-handled in the KPIs. A shadow-mode feature flag forces drafts even for `auto_send`, which is useful when testing a new prompt in production.

---

## F14. AI suggestion for a human reply

**Purpose:** help a human who is already replying, without letting the AI send anything.
**Actors:** Staff, API, Queue, AI orchestrator, Realtime.

```mermaid
sequenceDiagram
    actor S as Staff
    participant API as Conversations API
    participant Q as Job queue
    participant WK as generate_suggestion worker
    participant O as AI orchestrator
    participant RT as Realtime gateway

    S->>API: POST suggest with idempotency key
    API->>Q: Enqueue job id = conversation:suggest:key
    API-->>S: 202 pending state shown
    Q->>WK: generate_suggestion
    WK->>WK: Take the conversation lock
    WK->>O: processTurn in suggest mode
    O->>O: Mutating tools blocked, no reserve, no order, no handoff
    O-->>WK: Suggested text
    WK-->>RT: suggestion.ready
    RT-->>S: Suggestion appears in the composer
    S->>S: Edit and send as a normal human message
```

**Explanation:** it works even when the AI is switched off for the thread (`ai_enabled` false), because the person is the sender. It is suppressed on complaints and refunds, where a generated reply would be inappropriate. Target: the suggestion arrives in under 5 seconds with a visible waiting state.

---

## F15. LLM failure and fallback

**Purpose:** a provider outage must not stop the business.

```mermaid
sequenceDiagram
    participant O as AI orchestrator
    participant MF as Model fallback
    participant P1 as Primary model (Groq)
    participant P2 as Fallback model (Orca)
    participant P3 as Last resort (Vercel gateway)
    participant Q as Job queue
    participant N as Notification service
    actor Own as Owner

    O->>MF: completeWithFallback
    MF->>P1: Request, 15 s timeout
    alt success
        P1-->>MF: Completion
        MF-->>O: Result
    else timeout or error
        MF->>P2: Retry on next provider
        alt success
            P2-->>MF: Completion
            MF-->>O: Result, usage logged with model used
        else failure
            MF->>P3: Retry on next provider
            alt all failed
                P3-->>MF: Error
                MF-->>O: Failure
                O->>O: Escalate integration_failure, no reply invented
                O->>Q: Job retried with backoff
                O-->>N: ai.provider_down
                N-->>Own: Alert, humans can still reply from the inbox
            end
        end
    end
```

**Explanation:** each attempt has its own timeout, so total latency stays bounded. When every provider fails, the AI **does not guess**: the thread is escalated to a human, staff can reply manually, and the owner is notified. The inbox, catalog and orders keep working because they do not depend on the LLM.

---

## F16. AI activation gates

**Purpose:** prevent the AI going live before the shop is ready.
**Actors:** Owner, Web app, Business service.

```mermaid
sequenceDiagram
    actor O as Owner
    participant W as Web app
    participant API as Business service
    participant DB as PostgreSQL

    O->>W: Open onboarding checklist
    W->>API: GET activation status
    API->>DB: Evaluate G1 to G5
    API-->>W: Each gate with met or unmet and link to fix it
    W-->>O: Activate button disabled while any gate is unmet
    O->>W: Complete the missing steps
    O->>W: Click Activate AI
    W->>API: POST activate
    API->>DB: Re-evaluate all gates server-side
    alt any gate unmet
        API-->>W: 422 listing every unmet gate
    else all met
        API->>DB: Mark AI agent enabled
        API-->>W: 200 AI is live
    end
```

| Gate | Condition |
|---|---|
| **G1 Catalog** | At least one active product with a variant that has a price and a stock value |
| **G2 Rules** | Delivery, payment and return rules present and acknowledged (accepting seeded defaults counts) |
| **G3 Channel** | At least one channel account in `active` status |
| **G4 AI test** | A playground simulation completed, or an approved reply in approval mode |
| **G5 Handoff** | Owner acknowledged that buying intent creates a pending order that a human must confirm |

**Explanation:** the check runs again on the server at activation time; a disabled button is a convenience, not the control. The error lists **every** unmet gate so the merchant fixes them in one pass.

---

## F17. Playground (safe simulation)

**Purpose:** let the owner see the AI's voice and satisfy gate G4 with no real-world effects.

```mermaid
sequenceDiagram
    actor O as Owner
    participant API as Playground API
    participant Q as Job queue
    participant WK as AI worker
    participant O2 as AI orchestrator
    participant DB as PostgreSQL

    O->>API: POST simulate with message
    API->>DB: Find or create conversation source playground, is_test true
    API->>Q: Enqueue process_inbound_message with test flag
    API-->>O: 202
    Q->>WK: process_inbound_message
    WK->>O2: processTurn in playground mode
    O2->>O2: Read tools allowed, reserve and create order blocked
    O2-->>WK: Reply
    WK->>DB: Store reply with sent status, no channel call
    WK-->>O: Reply appears in playground
    Note over WK,DB: No Meta call, no KPI count, no usage event. Usage and traces still recorded for cost visibility.
```

**Explanation:** test rows carry `is_test = true`, which excludes them from KPIs, billing and Meta delivery. The same orchestrator runs, so what the owner sees is what customers will get.

---

## F18. KPI rollup

**Purpose:** four numbers, computed once a day, read instantly.

```mermaid
sequenceDiagram
    participant CR as Scheduler (01:10 business time)
    participant Q as Analytics queue
    participant W as rollup_daily worker
    participant DB as PostgreSQL
    actor O as Owner
    participant API as Analytics API

    CR->>Q: Enqueue rollup_daily per business and day
    Q->>W: rollup_daily with job id = business:day
    W->>DB: Count customer messages that reached a terminal outcome
    W->>DB: Split by sender type of the reply (AI or human)
    W->>DB: Count orders created that day
    W->>DB: Count entries into HUMAN_REQUIRED by reason
    W->>DB: Count AI-created orders that reached CONFIRMED
    W->>DB: Upsert analytics_daily row
    O->>API: GET kpis for date range
    API->>DB: Sum rows in range using business timezone
    API-->>O: Four KPIs
```

| KPI | Definition |
|---|---|
| Messages handled | Inbound customer messages that reached a terminal outcome (AI replied, escalated, or answered by a human); split AI vs human by who produced the reply |
| Orders created | Orders created in the period in pending or confirmed state, counted even if cancelled later |
| Human handoffs | Entries into `HUMAN_REQUIRED`, grouped by reason; escalating twice counts twice |
| Conversion | AI-created orders that reached `CONFIRMED` divided by AI-created pending orders |

Test rows are excluded. Periods start at the beginning of the first day and end before the day after the last, in the **business timezone**. Re-running the job for a day produces the same row (idempotent upsert).

---

## F19. Realtime updates

**Purpose:** staff see new messages and status changes without refreshing.

```mermaid
sequenceDiagram
    participant S1 as Staff browser
    participant RT as Realtime gateway
    participant EV as Domain events
    participant R as Redis

    S1->>RT: Connect with session
    RT->>RT: Authenticate and resolve business
    RT->>S1: Join business room
    S1->>RT: Open conversation, join conversation room
    EV->>RT: message.received, state_changed, handoff, score changed
    RT->>R: Publish for other API instances
    RT-->>S1: conversation.message / conversation.status / conversation.handoff
    Note over S1,RT: Connection drops
    S1->>RT: Reconnect
    RT->>S1: Rejoin rooms
    S1->>S1: Refetch list and open thread to repair any gap
```

**Explanation:** realtime is an **accelerator, not a source of truth**. If a socket event is missed, the next fetch from the API gives the correct state; the client refetches after every reconnect. Rooms are keyed by business, so a user can never subscribe to another tenant's events. Target: a new message visible within 2 s of being stored.

---

## F20. Reservation expiry

**Purpose:** abandoned purchases must give stock back.

```mermaid
sequenceDiagram
    participant CR as Scheduler (every minute)
    participant W as expire_reservations worker
    participant DB as PostgreSQL

    CR->>W: Run singleton job
    W->>DB: Select active reservations with expires_at in the past
    loop each reservation
        W->>DB: Status expired, availability restored
    end
    Note over W,DB: Stock balance was never decremented for a reservation, so nothing else needs correcting.
```

**Explanation:** a reservation only reduces *available* stock; the real `stock` number changes only when an order is confirmed (F11). Expiry therefore needs no compensating ledger entry. The job is a singleton so two instances never race.
