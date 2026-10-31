# 06. Functional Requirements

The functional requirements (FRs) state what the system must do. They are the detailed layer under the [user stories](02-user-stories.md): each story cites the FRs it needs, and each FR can be traced to a design element and a test.

**Source:** extracted from the team's product requirements document in `aymnart/ai-sales-manager` (`docs/00_product/01_PRODUCT_REQUIREMENTS`), authored by Aymen. Wording is kept as written there; IDs are stable. A priority such as "S (Phase 2)" means the requirement is deferred to that phase.

## Legend

| Priority | Meaning |
|---|---|
| **M** | Must have in Phase 1 |
| **S** | Should have |
| **C** | Could have |
| **W** | Won't in this phase (recorded so it is not rebuilt by accident) |

| Verify | Meaning |
|---|---|
| AT | Automated test |
| IN | Inspection or review |
| OB | Observed in monitoring |
| MT | Manual test |

## Summary

| Area | Prefix | Requirements |
|---|---|---|
| Authentication and access | `FR-AUTH` | 13 |
| Business workspace, team and onboarding | `FR-BIZ` | 20 |
| Product catalog and inventory | `FR-CAT` | 24 |
| Knowledge and retrieval | `FR-KNOW` | 16 |
| Channel integrations | `FR-INT` | 28 |
| Conversations and inbox | `FR-CONV` | 41 |
| Lead scoring | `FR-LEAD` | 10 |
| Realtime | `FR-RT` | 6 |
| Customers | `FR-CUST` | 11 |
| AI behaviour | `FR-AI` | 33 |
| Human handoff | `FR-HAND` | 11 |
| Orders | `FR-ORD` | 14 |
| Notifications | `FR-NOTIF` | 13 |
| Analytics | `FR-ANL` | 5 |
| Billing and usage | `FR-BILL` | 10 |
| AI observability | `FR-OBS` | 11 |
| Feature flags | `FR-FLAG` | 4 |
| Audit | `FR-AUD` | 4 |
| **Total** | | **274** (Must 222, Should 32, Could 3, Won't 17) |

## Authentication and access (`FR-AUTH`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-AUTH-001 | A visitor can register with email and password, creating a `users` row. | M | AT |
| FR-AUTH-002 | Passwords are stored only as a salted hash; plaintext is never logged, returned, or persisted. | M | AT, IN |
| FR-AUTH-003 | A registered user can log in and receive a short-lived access token plus a refresh token. | M | AT |
| FR-AUTH-004 | A user can refresh an expired access token without re-entering credentials, until the refresh token expires or is revoked. | M | AT |
| FR-AUTH-005 | A user can log out, invalidating the refresh token for that session. | M | AT |
| FR-AUTH-006 | A user can sign in with an OAuth provider (Google) and be linked to an existing `users` row by verified email. | S | AT |
| FR-AUTH-007 | A user belonging to multiple businesses can select the active business; every API call resolves tenant scope from the token or an explicit business header. | M | AT |
| FR-AUTH-008 | A user can request a password reset by email and set a new password with a single-use, time-limited token. | S | AT |
| FR-AUTH-009 | Failed login attempts are rate-limited per email and per IP. | M | AT, OB |
| FR-AUTH-010 | Email addresses are unique and case-insensitive across the platform. | M | AT |
| FR-AUTH-011 | An invited user can accept an invitation and join an existing business with the role assigned by the inviter. | M | AT |
| FR-AUTH-012 | Multi-factor authentication. | W | — |
| FR-AUTH-013 | A public landing page at `/` presents the commercial value proposition, bilingual (Derja/French) sales agent preview, 4-KPI ROI, and navigation CTAs to `/login` and `/register`. | M | AT, MT |

## Business workspace, team and onboarding (`FR-BIZ`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-BIZ-001 | An authenticated user can create a business, becoming its Owner. | M | AT |
| FR-BIZ-002 | A business captures name, industry (default `fashion`), country (default `TN`), default language (`fr` or `ar`), timezone, and currency (default `TND`). | M | AT |
| FR-BIZ-003 | Creating a business seeds: one default `ai_agent`, default `ai_settings`, platform default `ai_prompts` references, and a starter `business_rules` set (delivery, payment, returns) marked as unconfirmed defaults. | M | AT |
| FR-BIZ-004 | Owner and Admin can update business profile fields. | M | AT |
| FR-BIZ-005 | Only the Owner can delete a business; deletion is soft (30-day recovery window) and immediately disables AI and channel processing. | S | AT |
| FR-BIZ-006 | All tenant data access is scoped by `business_id`; no endpoint may return data belonging to another business. | M | AT, IN |
| FR-BIZ-007 | Ownership transfer between users. | W | — |
| FR-BIZ-010 | Owner and Admin can invite a user by email with a role of Admin or Employee (merchant UI may label Employee as **Agent**). | M | AT |
| FR-BIZ-011 | Owner and Admin can remove a member; removal revokes access immediately and releases that user's active conversation assignments. | M | AT |
| FR-BIZ-012 | Owner and Admin can change a member's role, except that only the Owner may grant Owner-equivalent capability (Phase 1: no second Owner). | M | AT |
| FR-BIZ-013 | The member list shows name, email, role, invite status, and last active timestamp. | S | MT |
| FR-BIZ-014 | Seat count is enforced against the plan limit; inviting beyond the limit returns a quota error with an upgrade CTA. | M | AT |
| FR-BIZ-015 | Custom roles with granular permission selection. | W | — |
| FR-BIZ-020 | The system tracks per-step completion flags for: business created, channel connected, products imported, AI personality + minimum policies configured, AI playground test passed, handoff workflow acknowledged, AI activated. | M | AT |
| FR-BIZ-021 | The user can leave and resume onboarding at any point without data loss; the checklist state is server-side, not client-side. | M | AT |
| FR-BIZ-022 | The user can skip optional steps and return to them from Settings. | M | MT |
| FR-BIZ-023 | The checklist displays remaining blocking items and links directly to each. | M | MT |
| FR-BIZ-024 | The system computes `ai_activation_ready` from the gates in §14 and exposes it to the UI. | M | AT |
| FR-BIZ-025 | Attempting to set AI live while `ai_activation_ready` is false is rejected by the API, not only by the UI. | M | AT |
| FR-BIZ-026 | An AI Playground lets Owner/Admin simulate conversations (price question, angry customer, buying intent, product recommendation) without a connected channel; passing it satisfies the "AI test" gate. | M | AT, MT |

## Product catalog and inventory (`FR-CAT`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-CAT-001 | Owner/Admin can create, read, update, and archive products with name, description, category, status (`draft` / `active`), and currency override. | M | AT |
| FR-CAT-002 | Only `active` products with at least one in-stock variant are visible to AI product search. | M | AT, EV |
| FR-CAT-003 | Owner/Admin can manage a category tree (`parent_id`, `sort_order`) scoped to the business. | M | AT |
| FR-CAT-004 | Owner/Admin can create variants with SKU, barcode, attributes (JSONB, e.g. `{"color":"Black","size":"M"}`), price, optional discount price, and stock. | M | AT |
| FR-CAT-005 | SKU is unique per business when provided; blank SKUs are permitted and auto-generated. | M | AT |
| FR-CAT-006 | Price must be non-negative; discount price, when set, must be less than price. | M | AT |
| FR-CAT-007 | Stock is a non-negative integer; the system exposes `available_stock = stock − active reservations`. | M | AT |
| FR-CAT-008 | Owner/Admin can upload images to a product or to a specific variant, with alt text, sort order, and one primary flag per scope. | M | AT |
| FR-CAT-009 | Images are stored in object storage; the database stores URLs, never binary blobs. | M | IN |
| FR-CAT-010 | Optional AI merchandising fields (`benefits`, `selling_points`, `objections`, `faqs`) can be set per product and are included in retrieval context. | S | AT, EV |
| FR-CAT-011 | Editing price, stock, name, description, or merchandising fields enqueues a re-embedding job for the affected records. | M | AT |
| FR-CAT-012 | Deleting a product that appears on an order is blocked; the product must be archived instead. | M | AT |
| FR-CAT-013 | `search_products` (and equivalent retrieval) returns sellable **variants** (SKU, size, color, price, available stock), never an unpriced parent row. | M | AT, EV |
| FR-CAT-015 | Bulk edit of price or stock across selected variants. | C | AT |
| FR-CAT-014 | Inventory movement history (`inventory_movements`) recording every stock delta with a reason. | S | AT |
| FR-CAT-020 | Owner/Admin can upload a CSV of products; required columns are name, price, stock; SKU, category, attributes, and image URL are optional. | M | AT |
| FR-CAT-021 | The system validates the file and returns a **row-level error report** before any data is written. | M | AT |
| FR-CAT-022 | The user previews the parsed result and explicitly confirms before import executes. | M | MT |
| FR-CAT-023 | Confirmed import runs asynchronously and upserts categories, products, variants, and image rows. | M | AT |
| FR-CAT-024 | Import runs are recorded with status, row counts, and a downloadable error file. | M | AT |
| FR-CAT-025 | Successful import enqueues embedding reindex for affected records and marks the catalog onboarding step complete. | M | AT |
| FR-CAT-026 | Re-importing the same file is idempotent by SKU: existing variants update rather than duplicate. | M | AT |
| FR-CAT-027 | A downloadable CSV template with correct headers and one example row is provided. | M | MT |
| FR-CAT-028 | Google Sheets import; Shopify / WooCommerce sync. | W | — (Phase 2, see `04_ROADMAP.md`) |

## Knowledge and retrieval (`FR-KNOW`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-KNOW-001 | Owner/Admin can define delivery rules: zones with fee and estimated duration. | M | AT |
| FR-KNOW-002 | Owner/Admin can define accepted payment methods (e.g. cash on delivery, bank transfer). | M | AT |
| FR-KNOW-003 | Owner/Admin can define the return/exchange policy: window in days and conditions. | M | AT |
| FR-KNOW-004 | Owner/Admin can define working hours, used when the AI promises human follow-up timing. | M | AT |
| FR-KNOW-005 | Owner/Admin can define discount policy; the default is that the AI may offer **no** discounts. | M | AT, EV |
| FR-KNOW-006 | Owner/Admin can define minimum order value and free-shipping threshold. | S | AT |
| FR-KNOW-007 | Rules carry `priority`, `enabled`, `effective_from`, and `effective_to`; the AI resolves rules effective at the conversation timestamp. | M | AT |
| FR-KNOW-008 | Editing a rule creates a new effective version rather than destroying history. | M | AT |
| FR-KNOW-009 | Delivery fees and payment answers are computed from `business_rules`, never inferred by the model. | M | AT, EV |
| FR-KNOW-010 | When two enabled rules conflict for the same question, the system does not guess: it escalates with reason `policy_conflict`. | M | AT, EV |
| FR-KNOW-011 | Owner/Admin can create, edit, and delete knowledge documents (title, source type, raw text). | M | AT |
| FR-KNOW-012 | Saving a document chunks and embeds it asynchronously; the UI shows indexing status. | M | AT |
| FR-KNOW-013 | Re-saving unchanged content does not re-embed (content-hash check). | S | AT |
| FR-KNOW-014 | Owner/Admin can trigger a full reindex for the business. | M | AT |
| FR-KNOW-015 | File upload (PDF/DOCX) knowledge ingestion. | C | AT |
| FR-KNOW-016 | Website crawl ingestion. | W | — |

## Channel integrations (`FR-INT`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-INT-001 | Owner/Admin can start a Meta OAuth flow from the Integrations page. | M | MT |
| FR-INT-002 | After OAuth, the user selects which Facebook Page(s) to connect; a linked Instagram professional account is connected with the Page when available. | M | MT |
| FR-INT-003 | Each connected surface is stored as a `channel_account` with channel type, external account id, credentials reference, status, and webhook secret. | M | AT |
| FR-INT-004 | Provider credentials are stored encrypted; raw tokens are never returned by any API or written to logs. | M | AT, IN |
| FR-INT-005 | The integrations page shows per-account connection status, last inbound message time, and last error. | M | MT |
| FR-INT-006 | Owner/Admin can disconnect a channel account; disconnection stops inbound processing and outbound sends but preserves history. | M | AT |
| FR-INT-007 | Inbound webhooks are signature-verified; invalid signatures are rejected and logged. | M | AT |
| FR-INT-008 | The webhook endpoint persists the raw payload and returns `200` before any AI processing occurs. | M | AT, OB |
| FR-INT-009 | Duplicate webhook deliveries produce no duplicate message, no duplicate AI run, and no duplicate order. | M | AT |
| FR-INT-010 | Provider payloads are mapped to the canonical internal message shape; no provider-specific field reaches the AI or inbox modules. | M | IN |
| FR-INT-011 | Outbound sends respect provider rate limits with exponential backoff and a dead-letter queue after exhausting retries. | M | AT, OB |
| FR-INT-012 | Token expiry or permission revocation sets the channel account to an error state and notifies Owner/Admin. | M | AT |
| FR-INT-013 | Inbound attachments (images) are stored and shown in the inbox even though MVP AI does not interpret image content. | M | AT |
| FR-INT-014 | WhatsApp channel (Meta WhatsApp Cloud API). | W | — (Phase 2, behind `feature_flags.whatsapp_enabled`) |
| FR-INT-020 | Connect a WhatsApp Business number via Meta OAuth; store WABA id and phone number id. | S (Phase 2) | MT |
| FR-INT-021 | WhatsApp prerequisites stated before the merchant starts the flow. | S (Phase 2) | MT |
| FR-INT-022 | Pending WhatsApp verification never blocks MVP channels or AI activation. | S (Phase 2) | AT |
| FR-INT-023 | Each inbound WhatsApp message opens or refreshes a 24-hour service window. | S (Phase 2) | AT |
| FR-INT-024 | Inside the service window, AI and human replies send as normal free-form messages. | S (Phase 2) | AT |
| FR-INT-025 | Outside the service window, no autonomous AI reply and no free-form send attempt. | S (Phase 2) | AT |
| FR-INT-026 | Outside the window, thread marked closed; staff may send an approved template. | S (Phase 2) | MT |
| FR-INT-027 | Templates are pre-registered with Meta; never LLM-generated. | S (Phase 2) | AT, IN |
| FR-INT-028 | Approved templates synced from Meta with approval status. | S (Phase 2) | AT |
| FR-INT-029 | Provider-refused sends never reported as delivered. | S (Phase 2) | AT |
| FR-INT-030 | WhatsApp conversation starts metered separately (Meta per-conversation cost). | S (Phase 2) | AT |
| FR-INT-031 | Per-channel-account outbound throttling respects each provider's limits. | M | AT |
| FR-INT-032 | Unofficial WhatsApp automation prohibited in the codebase. | M | IN |
| FR-INT-033 | Interactive WhatsApp types and in-app template authoring. | W | — (Phase 3) |

## Conversations and inbox (`FR-CONV`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-CONV-001 | Staff see a unified inbox of all conversations for the active business across all connected channels. | M | MT |
| FR-CONV-002 | The inbox can be filtered by status, channel, and assignee. | M | AT |
| FR-CONV-003 | Conversations requiring human attention are sorted first by handoff priority (`critical` → `high` → `normal`), then by handoff time (oldest first). | M | AT |
| FR-CONV-004 | Each list row shows customer name/handle, channel, last message preview, unread state, status badge, priority badge, and assignee. | M | MT |
| FR-CONV-005 | New inbound messages and status changes appear in an open inbox without manual refresh. | M | MT |
| FR-CONV-006 | The inbox supports search by customer name, phone, or message text. | S | AT |
| FR-CONV-007 | Message history is paginated and loads older messages on demand. | M | AT |
| FR-CONV-008 | Every message displays its sender type (customer, AI, human, system) with visually distinct treatment. | M | MT |
| FR-CONV-010 | The detail view shows the full transcript, the customer profile, lifecycle stage, order timeline, AI status, and the handoff briefing when present. | M | MT |
| FR-CONV-011 | Staff can send a message to the customer; sending as a human sets `ai_enabled = false` for that conversation. | M | AT |
| FR-CONV-012 | Staff can explicitly **Take over**, which pauses the AI and transitions `HUMAN_REQUIRED` → `HUMAN_HANDLING`. | M | AT |
| FR-CONV-013 | Staff can **Resume AI**, permitted only when no order is awaiting confirmation on that conversation. | M | AT |
| FR-CONV-014 | Staff can assign a conversation to a member; assignment history is recorded with actor and timestamp. | M | AT |
| FR-CONV-015 | Staff can add internal notes visible only to team members, never sent to the customer. | M | AT |
| FR-CONV-016 | Staff can close a conversation, moving it to `RESOLVED`. | M | AT |
| FR-CONV-017 | A conversation with no activity for 30 days (configurable) and no pending order auto-closes to `RESOLVED`. | S | AT |
| FR-CONV-018 | Staff can snooze a conversation until a chosen time. | C | AT |
| FR-CONV-019 | A conversation summary is generated automatically on entry to `HUMAN_REQUIRED` and on takeover, and regenerated if more than 10 new messages arrive before a human opens it. | M | AT, EV |
| FR-CONV-020 | Staff can see **why** the AI escalated, rendered from the stored decision trace and handoff context. | M | MT |
| FR-CONV-021 | Concurrent processing of one conversation is prevented; two near-simultaneous inbound messages never produce interleaved or duplicated AI replies. | M | AT |
| FR-CONV-022 | Typing indicators and read receipts. | W | — |
| FR-CONV-030 | The inbox presents three panes: conversation list (triage), chat thread, and customer context with actions. | M | MT |
| FR-CONV-031 | The conversation list is ordered by **sales priority**, not by recency: conversations in `HUMAN_REQUIRED` first (by handoff priority, then oldest wait), then AI-handled conversations by lead temperature, then lead score, then recency. | M | AT |
| FR-CONV-032 | The default view is "Needs me" (escalations plus hot leads), not "All conversations". | M | MT |
| FR-CONV-033 | Conversations are grouped and badged by lead temperature (hot / warm / cold). | M | MT |
| FR-CONV-034 | Each list card shows customer, last message snippet, temperature badge, product of interest, value, channel icon, assignee, and relative time — enough to triage without opening it. | M | MT |
| FR-CONV-035 | There is a single unified inbox across channels with channel filters; there are no per-channel pages. | M | MT |
| FR-CONV-036 | A channel appears in the filter list only when the business has a connected account on it; each conversation row displays its channel. | M | AT |
| FR-CONV-037 | The chat pane shows a persistent indicator of who is currently responding (AI or a named human) and renders customer, AI, human, and system events distinguishably. | M | MT |
| FR-CONV-038 | Outbound message delivery state (sending, sent, delivered, failed) is visible in the thread, and a failed provider send exposes a retry action. | M | AT |
| FR-CONV-039 | The customer panel shows identity, contact, lead information with an explanation affordance for the score, plain-language status, and an event timeline. | M | MT |
| FR-CONV-040 | The conversation timeline is derived from existing messages, state transitions, AI actions, and orders; it introduces no new storage. | M | IN |
| FR-CONV-041 | Primary actions (take over, confirm order, call, assign) are reachable from the customer panel, limited to four primary buttons, and context-sensitive to the conversation state. | M | MT |
| FR-CONV-042 | The call action opens a telephone link to the stored customer phone number. | S | MT |
| FR-CONV-043 | AI control (AI mode, take over, pause, resume, send) reflects **server** state, so two staff members can never both believe they own a conversation. | M | AT |
| FR-CONV-044 | No payment-link or payment-collection affordance exists anywhere in the UI while payments are out of scope. | M | IN |
| FR-CONV-050 | A pipeline page presents leads and orders as Kanban columns: new leads, qualified, payment pending, sold. | M | MT |
| FR-CONV-051 | Columns are a **read-only projection** of existing conversation and order status and introduce no new state or status field. | M | IN |
| FR-CONV-052 | Each column shows a count and total value; each card shows customer, product, value, and temperature. | M | MT |
| FR-CONV-053 | Card copy for the payment-pending column says the order awaits **staff confirmation**, never that it awaits customer payment. | M | IN |
| FR-CONV-054 | Drag-to-advance between columns. | W | — (post-MVP; must execute state-machine transitions, never write status directly) |

## Lead scoring (`FR-LEAD`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-LEAD-001 | Every conversation carries a lead score in the range 0–100 and a derived temperature band. | M | AT |
| FR-LEAD-002 | The score is computed by deterministic rules over persisted signals; scoring must never invoke an LLM. | M | AT, IN |
| FR-LEAD-003 | The contributing signals and their point values are stored per conversation so the score can be explained in the UI. | M | AT |
| FR-LEAD-004 | The score is recomputed on inbound message, conversation state change, order creation and confirmation, and on a nightly decay pass. | M | AT |
| FR-LEAD-005 | Temperature thresholds are configurable per business rather than hard-coded. | M | AT |
| FR-LEAD-006 | The score resets when the conversation is resolved or its order is cancelled. | M | AT |
| FR-LEAD-007 | The score is never presented as a probability of purchase or any other statistical claim. | M | IN |
| FR-LEAD-008 | Lead score is visible to all staff roles, including Employees. | M | AT |
| FR-LEAD-009 | Lead scoring must never reorder a conversation ahead of one requiring human action; escalation ordering always wins. | M | AT |
| FR-LEAD-010 | Machine-learned or LLM-derived scoring. | W | — |

## Realtime (`FR-RT`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-RT-001 | New messages, status changes, handoffs, lead-score changes, and notifications reach an open UI without manual refresh. | M | MT |
| FR-RT-002 | Realtime connections authenticate with the same credentials as the REST API, and subscriptions are scoped server-side; a client may never subscribe to an arbitrary tenant or conversation. | M | AT |
| FR-RT-003 | The realtime channel is an accelerator, not a source of truth: no data may exist only in a pushed payload, and every view is refetchable over REST. | M | IN |
| FR-RT-004 | On reconnection the client reconciles by refetching the list and the open thread from its last cursor, so a missed frame never leaves the UI permanently wrong. | M | AT |
| FR-RT-005 | When the realtime connection cannot be established, the UI degrades to polling and indicates the degraded state. | M | MT |
| FR-RT-006 | Realtime fan-out works across multiple application instances. | M | AT |

## Customers (`FR-CUST`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-CUST-001 | A customer record is created or matched on first inbound message via `customer_identities` (`platform`, `platform_user_id`). Same platform id is always the same customer. | M | AT |
| FR-CUST-002 | A customer stores name, phone, email, address, language, preferences, tags, and notes. | M | AT |
| FR-CUST-003 | Information collected by the AI during a conversation updates the customer record. | M | AT |
| FR-CUST-004 | Staff can view and edit a customer profile and see full purchase and conversation history. | M | AT |
| FR-CUST-005 | Staff can add tags and internal notes to a customer. | M | AT |
| FR-CUST-006 | Each customer has a lifecycle stage derived automatically from order and conversation events. | M | AT |
| FR-CUST-007 | Lifecycle stage influences AI tone and recommendation behaviour as specified in `05_AI_BEHAVIOR_SPECIFICATION.md`. | M | EV |
| FR-CUST-008 | A customer can be manually tagged VIP; VIP handling is governed by the handoff rules. | M | AT |
| FR-CUST-009 | Owner/Admin can export customer data. | S | AT |
| FR-CUST-010 | Owner/Admin can manually merge two customer records; the merge is audited; Employee cannot merge. | M | AT |
| FR-CUST-011 | A new identity with a **verified** phone that already belongs to a customer on the same business is auto-linked. Unverified phone or name similarity never auto-merges. | M | AT |

## AI behaviour (`FR-AI`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-AI-001 | Each business has exactly one configurable primary sales agent in MVP. | M | AT |
| FR-AI-002 | Owner/Admin can configure agent name, personality description, default language (`ar` / `fr` / `en`), tone, and greeting and fallback templates. | M | AT |
| FR-AI-003 | Owner/Admin can configure sales strategy flags (upsell aggressiveness, cross-sell on/off). | M | AT |
| FR-AI-004 | Owner/Admin can set the escalation confidence threshold; default is 0.65. | M | AT |
| FR-AI-005 | Owner/Admin can configure model settings: primary model, fallback model, max tokens, temperature, retrieval top-k, blocked topics, and a custom system append. | S | AT |
| FR-AI-006 | Owner/Admin can enable or disable the agent globally for the business. | M | AT |
| FR-AI-007 | Configuration changes take effect on the next conversation turn without redeploy. | M | AT |
| FR-AI-008 | Multiple agents per business, per-channel agents. | W | — (Phase 5) |
| FR-AI-010 | The business can operate in one of three reply modes: `auto_send`, `approval_required`, or `draft_only`. | M | AT |
| FR-AI-011 | New businesses default to `approval_required`. Completing the AI test gate (G4) unblocks live AI; it does **not** change `reply_mode`. The owner must explicitly opt into `auto_send` (onboarding step 6 optional toggle, or Settings). | M | AT |
| FR-AI-012 | In `approval_required`, AI output is persisted as a draft and is not delivered until a staff member approves it. | M | AT |
| FR-AI-013 | In `draft_only`, AI output is persisted as a draft that staff may copy or edit and send manually; approval does not auto-send. | S | AT |
| FR-AI-014 | Staff can edit a draft before approving; the edited text is what is sent, and the edit is recorded for feedback analysis. | S | AT |
| FR-AI-015 | Pending drafts are surfaced in the inbox as an actionable queue. | M | MT |
| FR-AI-016 | While a human is handling a conversation, the AI can offer a suggested reply that the human may send, edit, or dismiss. | M | MT |
| FR-AI-017 | A suggestion is a draft only: displaying one during `HUMAN_REQUIRED` does not violate the paused-AI rule, because nothing is delivered without an explicit human action. | M | AT, IN |
| FR-AI-018 | Suggestions obey every guardrail that applies to sent messages, including grounding, no discounts, no refund approval, and no payment promises. | M | EV |
| FR-AI-019 | Suggestions are suppressed on complaint and refund conversations. | M | AT, EV |
| FR-AI-020a | Suggestions are generated on demand and debounced, never on every keystroke, and each generation is recorded in AI usage like any other model call. | M | AT |
| FR-AI-020b | Sending a suggestion records an AI message flagged as human-approved; editing before sending records the edit for feedback analysis. | M | AT |
| FR-AI-020 | The AI must never state a price, stock quantity, delivery fee, discount, or policy that did not come from a tool result or business rule in the same turn. | M | EV, AT |
| FR-AI-021 | The AI must never invent products, promise unavailable items, grant unauthorised discounts, or approve refunds. | M | EV |
| FR-AI-022 | The AI replies in the business default language unless the customer clearly uses another supported language, in which case it matches the customer. | M | EV |
| FR-AI-023 | When tools return empty or conflicting data, the AI states uncertainty and offers human handoff rather than guessing. | M | EV |
| FR-AI-024 | On low classifier confidence the AI asks one clarifying question; a second consecutive low-confidence turn escalates. | M | AT, EV |
| FR-AI-025 | Every outbound AI message records intent, confidence, tools called, model, latency, and prompt version. | M | AT |
| FR-AI-026 | Prompts are versioned; the active version per type is immutable and a change creates a new version. | M | AT |
| FR-AI-027 | Platform default prompts are seeded per business and can be overridden by the merchant. | M | AT |
| FR-AI-028 | If the primary model fails, the system retries with the fallback model before escalating. | M | AT, OB |
| FR-AI-029 | If all model attempts fail or exceed the latency ceiling, the conversation escalates to human with an integration/timeout reason rather than sending a degraded reply. | M | AT |
| FR-AI-030 | Owner/Admin can run a playground conversation against current configuration without touching a live channel. | M | MT |
| FR-AI-031 | The playground can run the four canned scenarios (price, angry customer, buying intent, recommendation) and free-form chat; it shows the AI response and tools called; the decision trace is visible to Owner/Admin only. | M | MT |
| FR-AI-032 | Sampled, golden-set, and staff-reviewed conversations persist an `ai_evaluations` row (`conversation_id`, `score`, `failure_reason`, `evaluator_type`, `created_at`) covering correctness, grounding, language, tools, escalation, and conversion. | M | AT |

## Human handoff (`FR-HAND`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-HAND-001 | All fifteen defined `HUMAN_REQUIRED` triggers are implemented in MVP. | M | AT, EV |
| FR-HAND-002 | Every handoff records an escalation reason and a priority. | M | AT |
| FR-HAND-003 | Every handoff persists a staff briefing containing customer identity, conversation summary, intent, products discussed, AI recommendation, reason, linked pending order and amount when applicable, and the required action. | M | AT |
| FR-HAND-004 | Entering `HUMAN_REQUIRED` sets `ai_enabled = false`; the AI produces no further autonomous replies on that conversation. | M | AT |
| FR-HAND-005 | Entering `HUMAN_REQUIRED` emits a notification to Owner and Admin (and assignee when set) with the correct priority. | M | AT |
| FR-HAND-006 | The time a human first opens or takes the conversation is recorded as `handoff_completed_at`. | M | AT |
| FR-HAND-007 | The AI never upsells on a complaint and never confirms a refund or payment. | M | EV |
| FR-HAND-008 | On detected purchase intent, the AI confirms product and variant, verifies stock, collects required fields one question per turn, creates a pending order, triggers handoff, and tells the customer a team member will confirm — with no payment promise. | M | AT, EV |
| FR-HAND-009 | Purchase handoff re-verifies stock immediately before order creation; insufficient stock produces an apology and alternatives instead of an order. | M | AT |
| FR-HAND-010 | Staff can confirm a pending order from the conversation view in one action. | M | AT |
| FR-HAND-011 | Email, SMS, WhatsApp, and push notification of handoffs. | W | — (Phase 4) |

## Orders (`FR-ORD`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-ORD-001 | The AI can create an order with status `PENDING_CONFIRMATION` and payment status `NOT_COMPLETED`. | M | AT |
| FR-ORD-002 | An order stores a customer snapshot (name, phone, address), line items with variant, quantity and unit price, totals, currency, source conversation, and creator (AI or user). | M | AT |
| FR-ORD-003 | Staff can create an order manually. | M | AT |
| FR-ORD-004 | Staff can transition an order to `CONFIRMED`, `CANCELLED`, or `COMPLETED`; invalid transitions are rejected. | M | AT |
| FR-ORD-005 | Confirming an order records `order_confirmed_at` and advances the conversation to `ORDER_CONFIRMED`. | M | AT |
| FR-ORD-006 | Staff can mark payment status as completed when payment is collected offline. | M | AT |
| FR-ORD-007 | Order creation is idempotent by idempotency key: a retried request returns the original order rather than creating a second one. | M | AT |
| FR-ORD-008 | Cancelling a pending order releases any associated stock reservation. | M | AT |
| FR-ORD-009 | The orders list is filterable by status and date and shows source (AI vs manual). | M | MT |
| FR-ORD-010 | Stock is reserved for a variant and quantity during order collection, with a default expiry of 30 minutes. | M | AT |
| FR-ORD-011 | Reservations move to committed on order creation, released on cancel or timeout, and expired reservations are swept by a scheduled job. | M | AT |
| FR-ORD-012 | Available stock exposed to the AI subtracts active reservations, preventing double-selling the last unit across concurrent conversations. | M | AT |
| FR-ORD-013 | Payment provider integration, in-chat checkout, payment links. | W | — (Phase 4) |
| FR-ORD-014 | Fulfilment statuses (`PROCESSING`, `SHIPPED`, `DELIVERED`) and logistics integration. | W | — |

## Notifications (`FR-NOTIF`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-NOTIF-001 | The system creates an in-app notification for new order requests and for handoffs, carrying type, priority, title, message, and linked entity. | M | AT |
| FR-NOTIF-002 | Notifications are targeted at Owner and Admin, plus the assignee when a conversation is assigned. | M | AT |
| FR-NOTIF-003 | The UI shows an unread count and a notification list sorted by priority then recency. | M | MT |
| FR-NOTIF-004 | A notification links directly to the relevant conversation or order. | M | MT |
| FR-NOTIF-005 | Users can mark one notification or all notifications as read. | M | AT |
| FR-NOTIF-006 | New notifications appear without page refresh. | S | MT |
| FR-NOTIF-007 | Email, SMS, WhatsApp, browser push channels. | W | — (Phase 4) |
| FR-NOTIF-010 | Notifications fire on exactly four situations: a new hot lead, an order request or payment confirmation, AI uncertainty (low confidence, policy conflict, integration failure), and an angry or complaining customer. | M | AT |
| FR-NOTIF-011 | Routine AI replies, routine inbound messages, and state changes with no human action attached never produce a notification. | M | AT |
| FR-NOTIF-012 | Notifications are deduplicated to at most one per conversation per trigger type per hour. | M | AT |
| FR-NOTIF-013 | Repeated hot-lead notifications within a short window are collapsed into a single grouped notification. | M | AT |
| FR-NOTIF-014 | Only `critical` notifications interrupt; lower priorities accumulate in the notification centre. | M | MT |
| FR-NOTIF-015 | Non-critical notifications respect the business's configured working hours. | S | AT |

## Analytics (`FR-ANL`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-ANL-001 | The dashboard shows exactly the four KPIs defined in §15 for a selectable period. | M | AT |
| FR-ANL-002 | Handoffs are broken down by escalation reason. | M | AT |
| FR-ANL-003 | KPI values are computed from daily rollups, not live table scans, and are consistent for the same period across requests. | M | AT |
| FR-ANL-004 | Employees see analytics read-only; Owner/Admin see the same figures. | M | AT |
| FR-ANL-005 | Custom reports, segmentation, exports, revenue charts, CSAT, cost per order, prompt A/B analysis. | W | — (behind `feature_flags.advanced_analytics`) |

## Billing and usage (`FR-BILL`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-BILL-001 | Plans define limits for channel accounts, AI-handled messages per month, max conversations, max AI replies, seats, and an optional monthly AI budget. | M | AT |
| FR-BILL-002 | Each business has a subscription with plan, status, and period end. | M | AT |
| FR-BILL-003 | Usage events are recorded append-only for inbound messages, AI outbound messages, and orders created. | M | AT |
| FR-BILL-004 | Usage is aggregated per business per period on a schedule and used for limit enforcement. | M | AT |
| FR-BILL-005 | The owner sees current usage against plan limits. | M | MT |
| FR-BILL-006 | Soft warnings are surfaced at 80% and 95% of the message limit. | M | AT |
| FR-BILL-007 | On reaching any hard usage limit (messages, AI replies, conversations, or monthly AI budget), AI auto-reply stops, inbound messages still arrive in the inbox, humans can still reply, the owner is notified, and an upgrade CTA is shown. | M | AT |
| FR-BILL-008 | Exceeding the channel limit blocks connecting a further channel account. | M | AT |
| FR-BILL-009 | Self-service plan upgrade and payment collection. | S | AT |
| FR-BILL-010 | The system records `ai_tokens`, `ai_cost`, and `messages_processed` and uses them for limit enforcement and Owner cost visibility. | M | AT |

## AI observability (`FR-OBS`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-OBS-001 | Every tool call is logged with tool name, input, output, success flag, error, and duration. | M | AT |
| FR-OBS-002 | Every AI turn stores a decision trace containing intent, confidence, rules checked, policy outcomes, decision, escalation reason, priority, and prompt version. | M | AT |
| FR-OBS-003 | Owner and Admin can view the raw decision trace for a conversation (including playground). Employees see the handoff briefing (reason, priority, required action), not the reasoning trace. | M | MT |
| FR-OBS-004 | Token counts and estimated cost are recorded per AI turn with model and prompt version. | M | AT |
| FR-OBS-005 | Owner can view an AI usage and cost summary. | S | MT |
| FR-OBS-006 | Staff can rate any AI message positive or negative, with a reason from a fixed enum and an optional comment. | M | AT |
| FR-OBS-007 | Feedback is filterable by date, reason, and prompt version for quality review. | M | AT |
| FR-OBS-008 | Rate-limit events are logged as AI actions. | M | AT |
| FR-OBS-009 | AI action logs are retained 90 days in the primary database with an archival path defined. | S | IN |
| FR-OBS-010 | Automated fine-tuning from feedback. | W | — |
| FR-OBS-011 | Conversation-level `ai_evaluations` are persisted as specified in FR-AI-032. | M | AT |

## Feature flags (`FR-FLAG`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-FLAG-001 | Feature flags are stored per business with a unique feature key and enabled state. | M | AT |
| FR-FLAG-002 | Platform-level flags (no business scope) provide defaults and beta cohort overrides. | M | AT |
| FR-FLAG-003 | Flags are checked by the integrations UI, the AI orchestrator, and billing limit logic. | M | IN |
| FR-FLAG-004 | Flag changes take effect without redeploy. | M | AT |

## Audit (`FR-AUD`)

| ID | Requirement | Pri | Verify |
|---|---|---|---|
| FR-AUD-001 | Security- and money-relevant actions by users are recorded in an audit log with actor, action, entity, and payload. | M | AT |
| FR-AUD-002 | Owner and Admin can view the audit log for their business. | S | MT |
| FR-AUD-003 | AI actions are logged separately from human audit logs and are never conflated. | M | IN |
| FR-AUD-004 | Raw provider webhook payloads are retained for replay and debugging. | M | AT |

