# 02 — User Stories

| Field           | Value                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Document ID     | `02_USER_STORIES`                                                                                         |
| Status          | Approved (MVP baseline)                                                                                   |
| Owner           | Product                                                                                                   |
| Audience        | Engineering, QA, design, AI coding agents                                                                 |
| Depends on      | `00_PROJECT_OVERVIEW.md`, `01_PRODUCT_REQUIREMENTS.md`                                                    |
| Consumed by     | `03_MVP_SCOPE.md`, `30_execution/30_TASKS.md`, `30_execution/32_FEATURE_SPECIFICATIONS.md`, QA test plans |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` (authoritative)                                                       |

---

## 1. Purpose

This document translates the requirements register into **user-observable behaviour with executable acceptance criteria**. Requirements say _what the system must do_; stories say _what someone experiences and how we prove it works_.

Every story here is a QA test case and a definition of done. If a story's acceptance criteria pass, that slice is complete.

---

## 2. How to read

### 2.1 Story ID scheme

```
US-<EPIC>-<NN>
```

Epic letters are permanent. Story numbers are never reused.

### 2.2 Epics

| Epic  | Theme                                          | Primary actors                  |
| ----- | ---------------------------------------------- | ------------------------------- |
| **A** | Account, workspace, team, onboarding           | Owner, Admin                    |
| **B** | Catalog and business knowledge                 | Owner, Admin                    |
| **C** | Channel connection                             | Owner, Admin                    |
| **D** | Inbox, conversations, AI autonomy              | Employee, Admin, AI             |
| **E** | Purchase handoff and orders                    | AI, Employee, Owner             |
| **F** | Customers and notifications                    | Employee, Admin                 |
| **G** | Analytics, billing, AI observability, platform | Owner, Admin, Platform operator |
| **H** | End-customer experience (no login)             | End customer                    |

### 2.3 Fields on each story

| Field            | Meaning                                                   |
| ---------------- | --------------------------------------------------------- |
| **Priority**     | MoSCoW for Phase 1, matching `01_PRODUCT_REQUIREMENTS.md` |
| **Requirements** | The FR IDs this story satisfies                           |
| **AC**           | Acceptance criteria in Given/When/Then. All must pass.    |

### 2.4 Conventions in acceptance criteria

- "Staff" means any authenticated member (Owner, Admin, or Employee) unless a role is named.
- "The AI replies" implies the business is in `auto_send` mode unless stated.
- Every criterion is written so it can be automated; vague terms like "quickly" are replaced with the targets in `01_PRODUCT_REQUIREMENTS.md` §16.
- Cross-tenant isolation is not restated per story; it is a blanket criterion (see §11).

---

## 3. Epic A — Account, workspace, team, onboarding

### US-A-01 — Register an account

**As a** prospective merchant, **I want** to create an account with my email and password, **so that** I can start setting up my AI sales agent.

**Priority:** M · **Requirements:** FR-AUTH-001, FR-AUTH-002, FR-AUTH-010

**AC:**

- Given I am on the registration page, when I submit a valid email, a password meeting the policy, and my name, then an account is created and I am signed in.
- Given an account already exists with that email in any letter case, when I submit, then I see "an account with this email already exists" and no second account is created.
- Given I submit a password below the minimum policy, when I submit, then I see the specific unmet rule and no account is created.
- Given any registration, when I inspect the stored record, then the password appears only as a hash, and the plaintext appears in no log or response body.

---

### US-A-02 — Sign in and stay signed in

**As a** returning user, **I want** to sign in and remain signed in across page reloads, **so that** I do not re-authenticate constantly while working the inbox.

**Priority:** M · **Requirements:** FR-AUTH-003, FR-AUTH-004, FR-AUTH-009

**AC:**

- Given valid credentials, when I sign in, then I receive an access token and a refresh token and land on the dashboard.
- Given my access token has expired but my refresh token is valid, when I make an API call, then the client silently refreshes and the call succeeds without a visible interruption.
- Given invalid credentials, when I attempt sign-in, then I see a generic failure message that does not reveal whether the email exists.
- Given repeated failed attempts beyond the threshold for one email or IP, when I try again, then I am rate-limited with a retry-after indication.

---

### US-A-03 — Sign out

**As a** user on a shared device, **I want** to sign out, **so that** nobody else can use my session.

**Priority:** M · **Requirements:** FR-AUTH-005

**AC:**

- Given I am signed in, when I sign out, then my refresh token is revoked server-side and reusing it returns unauthorised.
- Given I signed out, when I press the browser back button, then protected pages do not render cached tenant data.

---

### US-A-04 — Create my business workspace

**As a** new user, **I want** to create my business, **so that** all my products, conversations, and settings live in one workspace.

**Priority:** M · **Requirements:** FR-BIZ-001, FR-BIZ-002, FR-BIZ-003

**AC:**

- Given I have no business, when I sign in, then I am routed to business creation rather than an empty dashboard.
- Given I submit business name, industry, country, default language, and timezone, then a business is created with me as Owner and currency defaulting to TND for Tunisia.
- Given the business is created, then the system has seeded one default AI agent, default AI settings, references to platform default prompts, and starter delivery/payment/returns rules flagged as unconfirmed defaults.
- Given the business is created, when I open the dashboard, then the onboarding checklist is visible with "business created" complete and the remaining steps listed.

---

### US-A-05 — Invite a teammate

**As an** owner, **I want** to invite staff with a role, **so that** they can work the inbox without gaining control of billing or settings they should not touch.

**Priority:** M · **Requirements:** FR-BIZ-010, FR-BIZ-014, FR-AUTH-011

**AC:**

- Given I am Owner or Admin, when I invite an email with role Admin or Employee, then an invitation is created and the invitee receives a link.
- Given I hold an invitation link, when I accept it (registering if needed), then I join that business with exactly the role specified.
- Given my plan seat limit is reached, when I try to invite, then I see a quota message with an upgrade action and no invitation is created.
- Given I am an Employee, when I open the team page, then I cannot invite or remove members and the controls are absent, not merely disabled.

---

### US-A-06 — Remove a teammate

**As an** owner, **I want** to remove a member immediately, **so that** a departing employee loses access to customer data at once.

**Priority:** M · **Requirements:** FR-BIZ-011

**AC:**

- Given a member exists, when I remove them, then their next API request for that business is rejected.
- Given the removed member had active conversation assignments, then those assignments are released and the conversations return to the unassigned queue.
- Given the removal, then an audit log entry records actor, target, and timestamp.

---

### US-A-07 — Resume onboarding where I left off

**As a** busy merchant, **I want** onboarding to remember my progress, **so that** interruptions do not force me to start over.

**Priority:** M · **Requirements:** FR-BIZ-020, FR-BIZ-021, FR-BIZ-022, FR-BIZ-023

**AC:**

- Given I completed two steps and closed the browser, when I sign in on a different device, then the same two steps show as complete.
- Given a step is optional, when I skip it, then I can still proceed and can return to it from Settings.
- Given blocking steps remain, when I view the checklist, then each unmet item is listed with a direct link to the screen that resolves it.

---

### US-A-08 — Test the AI before customers see it

**As an** owner, **I want** to chat with my AI in a playground, **so that** I can hear its voice and check its facts before it talks to real customers.

**Priority:** M · **Requirements:** FR-BIZ-026, FR-AI-030, FR-AI-031

**AC:**

- Given no channel is connected, when I open the playground, then I can send a message and receive an AI reply using my real catalog and rules.
- Given the playground, when I run a canned scenario (price, angry customer, buying intent, or recommendation), then I see the AI response and the tools called.
- Given I am Owner or Admin, then I can see the decision / reasoning trace.
- Given I am an Employee, then I cannot open the playground (`ai.playground` is 403); I never see traces.
- Given the playground conversation, then its messages and any orders are marked as test data and are excluded from analytics KPIs.
- Given I complete at least one playground exchange, then the "AI test" onboarding gate is satisfied.

---

### US-A-09 — Activate the AI, but only when it is safe

**As an** owner, **I want** the system to stop me activating a half-configured AI, **so that** my customers never receive a broken first impression.

**Priority:** M · **Requirements:** FR-BIZ-024, FR-BIZ-025 · **Canonical gates:** `01_PRODUCT_REQUIREMENTS.md` §14

**AC:**

- Given one or more activation gates are unmet, when I view the activation screen, then the activation control is disabled and every unmet gate is listed with a link.
- Given gates are unmet, when I call the activation API directly, then it returns a validation error enumerating the specific unmet gates, not a generic rejection.
- Given all five gates are met, when I activate, then AI processing begins on connected channels and I am redirected to the Inbox.
- Given I activate, then the business records who activated and when in the audit log.

---

### US-A-10 — Acknowledge how handoff works

**As an** owner, **I want** to be told explicitly that the AI creates pending orders for humans to confirm, **so that** I do not leave paying customers waiting because I did not know.

**Priority:** M · **Requirements:** FR-HAND-001, FR-BIZ-020

**AC:**

- Given I reach the activation step, when I have not acknowledged the handoff workflow, then I am shown a concise explanation of purchase intent → pending order → human confirmation and must confirm understanding.
- Given I acknowledge, then the gate is satisfied and the acknowledgement is recorded with timestamp and user.

---

## 4. Epic B — Catalog and business knowledge

### US-B-01 — Add a product with variants

**As an** admin, **I want** to add a product with size and colour variants that each carry their own price and stock, **so that** the AI answers availability questions accurately.

**Priority:** M · **Requirements:** FR-CAT-001, FR-CAT-004, FR-CAT-005, FR-CAT-006, FR-CAT-007, FR-CAT-013

**AC:**

- Given I create a product with name, description, and category, when I add variants with attributes, price, and stock, then each variant is stored as an independently sellable unit.
- Given I create a product with no variants, then the system creates one default variant carrying the price and stock.
- Given I enter a negative price or negative stock, then the save is rejected with a field-level error.
- Given I set a discount price greater than or equal to the price, then the save is rejected.
- Given I reuse an existing SKU within the same business, then the save is rejected as duplicate.
- Given the AI searches the catalog, then it matches **variants** (size, color, SKU, price, stock), not an unpriced parent product.

---

### US-B-02 — Upload product images

**As an** admin, **I want** to attach images to a product or to a specific variant, **so that** the inbox and future customer-facing surfaces show the right picture.

**Priority:** M · **Requirements:** FR-CAT-008, FR-CAT-009

**AC:**

- Given I upload an image without selecting a variant, then it is stored as a product-level image.
- Given I upload an image and select the Black variant, then it is associated with that variant only.
- Given multiple images exist in one scope, then exactly one can be primary and setting a new primary clears the previous.
- Given any upload, then the binary is stored in object storage and the database holds only the URL and metadata.

---

### US-B-03 — Import a catalog by CSV

**As an** admin with 200 products, **I want** to upload a spreadsheet, **so that** I do not enter products one by one.

**Priority:** M · **Requirements:** FR-CAT-020 → FR-CAT-027

**AC:**

- Given I download the template, then it contains the required headers (name, price, stock) plus optional columns and one example row.
- Given I upload a file with errors in rows 5 and 12, then I see a row-level report naming the column and reason for each, and nothing has been written to the catalog.
- Given a valid file, when I review the preview, then I see counts of products, variants, and categories to be created or updated, and import runs only after I confirm.
- Given I confirm, then the import runs asynchronously, I can navigate away, and the run's status is visible with row counts and a downloadable error file.
- Given the import completes, then embeddings are enqueued for the affected records and the catalog onboarding step is marked complete.
- Given I upload the identical file a second time, then existing variants are updated by SKU and no duplicates are created.

---

### US-B-04 — Keep the AI's knowledge fresh after edits

**As an** admin, **I want** the AI to use my new price the moment I change it, **so that** I never sell at last week's price.

**Priority:** M · **Requirements:** FR-CAT-011, FR-KNOW-012, FR-KNOW-014

**AC:**

- Given I change a variant price, when a customer asks the price on the next turn, then the reply uses the new price sourced from the database, not from a cached embedding.
- Given I edit a product description, then a re-embedding job is enqueued and the indexing state is visible in the UI.
- Given I trigger a full reindex, then all knowledge documents and product records for the business are re-embedded and progress is reported.

---

### US-B-05 — Define delivery zones and fees

**As an** owner, **I want** to state my delivery fees per region, **so that** the AI quotes shipping correctly instead of guessing.

**Priority:** M · **Requirements:** FR-KNOW-001, FR-KNOW-009

**AC:**

- Given I define Tunis at 5 TND and other regions at 8 TND, when a customer says they are in Sfax, then the AI quotes 8 TND.
- Given a customer names a region I have not defined, then the AI states it must confirm and offers handoff rather than inventing a fee.
- Given any delivery answer, then the quoted figure traces to a business rule record in the decision trace.

---

### US-B-06 — Define payment methods and return policy

**As an** owner, **I want** to record which payments I accept and my return window, **so that** the AI answers consistently and never over-promises.

**Priority:** M · **Requirements:** FR-KNOW-002, FR-KNOW-003, FR-KNOW-004

**AC:**

- Given I accept cash on delivery only, when a customer asks about card payment, then the AI states the accepted methods without offering card.
- Given I set a 7-day return window, when a customer asks about returns, then the AI states 7 days with my conditions.
- Given a customer asks a refund question, then the AI does not decide the refund and escalates per the handoff rules.

---

### US-B-07 — Prevent the AI from discounting

**As an** owner, **I want** the AI to have no discount authority by default, **so that** my margins are not negotiated away automatically.

**Priority:** M · **Requirements:** FR-KNOW-005, FR-AI-021

**AC:**

- Given no discount rule exists, when a customer asks for a lower price, then the AI declines politely and escalates with the negotiation reason.
- Given I define an explicit promotion rule with a valid date range, then the AI may state exactly that promotion and nothing beyond it.
- Given an expired promotion, then the AI does not mention it.

---

### US-B-08 — Handle contradictory rules safely

**As an** owner who has set conflicting policies, **I want** the AI to stop rather than pick one, **so that** it does not commit me to terms I did not intend.

**Priority:** M · **Requirements:** FR-KNOW-010

**AC:**

- Given one enabled rule says free delivery above 100 TND and another says delivery is always 5 TND, when a customer with a 120 TND cart asks about delivery, then the AI does not answer the fee and escalates with reason `policy_conflict` at normal priority.
- Given the escalation, then the staff briefing names both conflicting rules.

---

### US-B-09 — Add FAQs and policy documents

**As an** admin, **I want** to paste my FAQs, **so that** the AI answers common questions in my own words.

**Priority:** M · **Requirements:** FR-KNOW-011, FR-KNOW-012, FR-KNOW-013

**AC:**

- Given I save a document with a title and body, then it is chunked and embedded asynchronously and its status becomes indexed.
- Given a question semantically matching that document, when a customer asks it, then the reply draws on the document and the retrieval is recorded in the AI action log.
- Given I re-save an unchanged document, then no new embedding work is performed.

---

## 5. Epic C — Channel connection

### US-C-01 — Connect Instagram and Messenger

**As an** owner, **I want** to connect my Facebook Page and Instagram account in a guided flow, **so that** the AI can start receiving my DMs.

**Priority:** M · **Requirements:** FR-INT-001, FR-INT-002, FR-INT-003, FR-INT-004

**AC:**

- Given I start the Meta connection, then I complete OAuth and am shown the Pages I administer.
- Given I select a Page with a linked Instagram professional account, then both surfaces are created as channel accounts in active status.
- Given the connection succeeds, then credentials are stored encrypted and no endpoint returns the raw token.
- Given I lack the required Meta permissions, then I see which permission is missing and how to grant it, not a raw provider error.
- Given the WhatsApp card on the integrations page, then it shows "Coming in Phase 2" and is not connectable in MVP.

---

### US-C-02 — See channel health at a glance

**As an** admin, **I want** to see whether each channel is working, **so that** I notice a broken connection before customers do.

**Priority:** M · **Requirements:** FR-INT-005, FR-INT-012

**AC:**

- Given a connected account, then the integrations page shows status, last inbound message time, and last error if any.
- Given the provider token expires or permissions are revoked, then the account moves to an error state and Owner and Admin receive a notification.
- Given an account is in error, then the AI does not attempt outbound sends on it and the failure reason is visible.

---

### US-C-03 — Disconnect a channel without losing history

**As an** owner, **I want** to disconnect a channel, **so that** I can stop automation while keeping my conversation and order records.

**Priority:** M · **Requirements:** FR-INT-006

**AC:**

- Given I disconnect a channel account, then inbound processing and outbound sending stop for it immediately.
- Given the disconnection, then existing conversations, messages, customers, and orders remain readable.
- Given I reconnect the same account later, then it links to the existing records rather than creating duplicates.

---

### US-C-04 — Never lose or duplicate an inbound message

**As an** owner, **I want** every customer message to appear exactly once, **so that** I can trust the inbox as a record.

**Priority:** M · **Requirements:** FR-INT-007, FR-INT-008, FR-INT-009, FR-CONV-021

**AC:**

- Given the provider delivers a webhook, then it is signature-verified, persisted raw, and acknowledged within the latency target before any AI work.
- Given the provider re-delivers the same event, then no second message row, no second AI run, and no second order are created.
- Given a webhook with an invalid signature, then it is rejected and logged as a security event.
- Given two messages from the same customer arrive within one second, then replies are not interleaved and only coherent output is sent.

---

### US-C-05 — Receive image messages

**As an** employee, **I want** to see photos a customer sends, **so that** I can understand requests the AI cannot interpret.

**Priority:** M · **Requirements:** FR-INT-013

**AC:**

- Given a customer sends an image with no text, then the image is stored and rendered in the inbox.
- Given an image-only message, then the AI asks the customer to describe or name the product rather than guessing its content.

---

### US-C-06 — WhatsApp service window and templates (Phase 2)

**Deferred.** See FR-INT-023 → FR-INT-029 and Brain Dump `# Integration Architecture → Phase 2`. Not tested in MVP.

---

### US-C-07 — One conversation view regardless of channel

**As an** employee, **I want** Instagram and Messenger threads to behave identically, **so that** I do not learn different tools per channel.

**Priority:** M · **Requirements:** FR-INT-010, FR-CONV-035, FR-CONV-036

**AC:**

- Given conversations from connected channels, then each is rendered with the same layout, actions, and AI controls, differing only by a channel badge.
- Given a message from any channel, then it is stored in the canonical shape and no provider-specific field reaches the inbox or AI.
- Given the AI replies, then the reply is delivered back through the channel the customer used.
