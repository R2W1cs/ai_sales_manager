## 13. FR-ANL, FR-BILL, FR-OBS, FR-FLAG, FR-AUD — Platform surfaces

### 13.1 Analytics

| ID         | Requirement                                                                                                               | Priority | Verify                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| FR-ANL-001 | The dashboard shows exactly the four KPIs defined in §15 for a selectable period.                                         | M        | AT                                            |
| FR-ANL-002 | Handoffs are broken down by escalation reason.                                                                            | M        | AT                                            |
| FR-ANL-003 | KPI values are computed from daily rollups, not live table scans, and are consistent for the same period across requests. | M        | AT                                            |
| FR-ANL-004 | Employees see analytics read-only; Owner/Admin see the same figures.                                                      | M        | AT                                            |
| FR-ANL-005 | Custom reports, segmentation, exports, revenue charts, CSAT, cost per order, prompt A/B analysis.                         | W        | — (behind `feature_flags.advanced_analytics`) |

### 13.2 Billing and usage

| ID          | Requirement                                                                                                                                                                                                                                | Priority | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| FR-BILL-001 | Plans define limits for channel accounts, AI-handled messages per month, max conversations, max AI replies, seats, and an optional monthly AI budget.                                                                                      | M        | AT     |
| FR-BILL-002 | Each business has a subscription with plan, status, and period end.                                                                                                                                                                        | M        | AT     |
| FR-BILL-003 | Usage events are recorded append-only for inbound messages, AI outbound messages, and orders created.                                                                                                                                      | M        | AT     |
| FR-BILL-004 | Usage is aggregated per business per period on a schedule and used for limit enforcement.                                                                                                                                                  | M        | AT     |
| FR-BILL-005 | The owner sees current usage against plan limits.                                                                                                                                                                                          | M        | MT     |
| FR-BILL-006 | Soft warnings are surfaced at 80% and 95% of the message limit.                                                                                                                                                                            | M        | AT     |
| FR-BILL-007 | On reaching any hard usage limit (messages, AI replies, conversations, or monthly AI budget), AI auto-reply stops, inbound messages still arrive in the inbox, humans can still reply, the owner is notified, and an upgrade CTA is shown. | M        | AT     |
| FR-BILL-008 | Exceeding the channel limit blocks connecting a further channel account.                                                                                                                                                                   | M        | AT     |
| FR-BILL-009 | Self-service plan upgrade and payment collection.                                                                                                                                                                                          | S        | AT     |
| FR-BILL-010 | The system records `ai_tokens`, `ai_cost`, and `messages_processed` and uses them for limit enforcement and Owner cost visibility.                                                                                                         | M        | AT     |

### 13.3 AI observability

| ID         | Requirement                                                                                                                                                                                 | Priority | Verify |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-OBS-001 | Every tool call is logged with tool name, input, output, success flag, error, and duration.                                                                                                 | M        | AT     |
| FR-OBS-002 | Every AI turn stores a decision trace containing intent, confidence, rules checked, policy outcomes, decision, escalation reason, priority, and prompt version.                             | M        | AT     |
| FR-OBS-003 | Owner and Admin can view the raw decision trace for a conversation (including playground). Employees see the handoff briefing (reason, priority, required action), not the reasoning trace. | M        | MT     |
| FR-OBS-004 | Token counts and estimated cost are recorded per AI turn with model and prompt version.                                                                                                     | M        | AT     |
| FR-OBS-005 | Owner can view an AI usage and cost summary.                                                                                                                                                | S        | MT     |
| FR-OBS-006 | Staff can rate any AI message positive or negative, with a reason from a fixed enum and an optional comment.                                                                                | M        | AT     |
| FR-OBS-007 | Feedback is filterable by date, reason, and prompt version for quality review.                                                                                                              | M        | AT     |
| FR-OBS-008 | Rate-limit events are logged as AI actions.                                                                                                                                                 | M        | AT     |
| FR-OBS-009 | AI action logs are retained 90 days in the primary database with an archival path defined.                                                                                                  | S        | IN     |
| FR-OBS-010 | Automated fine-tuning from feedback.                                                                                                                                                        | W        | —      |
| FR-OBS-011 | Conversation-level `ai_evaluations` are persisted as specified in FR-AI-032.                                                                                                                | M        | AT     |

### 13.4 Feature flags and audit

| ID          | Requirement                                                                                                         | Priority | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-FLAG-001 | Feature flags are stored per business with a unique feature key and enabled state.                                  | M        | AT     |
| FR-FLAG-002 | Platform-level flags (no business scope) provide defaults and beta cohort overrides.                                | M        | AT     |
| FR-FLAG-003 | Flags are checked by the integrations UI, the AI orchestrator, and billing limit logic.                             | M        | IN     |
| FR-FLAG-004 | Flag changes take effect without redeploy.                                                                          | M        | AT     |
| FR-AUD-001  | Security- and money-relevant actions by users are recorded in an audit log with actor, action, entity, and payload. | M        | AT     |
| FR-AUD-002  | Owner and Admin can view the audit log for their business.                                                          | S        | MT     |
| FR-AUD-003  | AI actions are logged separately from human audit logs and are never conflated.                                     | M        | IN     |
| FR-AUD-004  | Raw provider webhook payloads are retained for replay and debugging.                                                | M        | AT     |

---

## 14. AI activation gates (canonical)

The AI cannot go live on a connected channel until **every** gate is true. `businesses.ai_activation_ready` is computed from these; the API rejects activation when false (FR-BIZ-024, FR-BIZ-025).

| Gate                             | Condition                                                                                                                     | Why it exists                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **G1 — Catalog**                 | At least one `active` product with at least one variant having a price and a non-null stock value                             | Without priced stock the AI cannot answer the two most common questions and will look broken                             |
| **G2 — Business rules**          | Minimum set present and acknowledged: delivery, payment method, returns (accepting seeded defaults counts as acknowledgement) | Delivery and payment are the top escalation causes when unset                                                            |
| **G3 — Channel**                 | At least one `channel_account` in `active` status                                                                             | Nothing to be live on otherwise                                                                                          |
| **G4 — AI test**                 | A playground simulation completed, or an `approval_required` trial with at least one approved reply                           | Forces the owner to see the AI's voice before customers do. Unblocks live AI; does **not** flip `reply_mode` (FR-AI-011) |
| **G5 — Handoff acknowledgement** | Owner has explicitly acknowledged that purchase intent produces a pending order requiring human confirmation                  | Prevents the single worst support outcome: an owner who does not know orders are waiting                                 |

**Failure behaviour:** the activation control is disabled with each unmet gate listed and linked. The API returns a validation error enumerating unmet gates — never a generic rejection.

---

## 15. MVP analytics KPI definitions (canonical)

Exactly four counters ship. These definitions are binding for the rollup job, the API, and the UI; no component may compute them differently.

| KPI                                    | Definition                                                                                         | Counting rule                                                                                                                                       | Excludes                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Messages handled**                   | Inbound customer messages processed by the system in the period                                    | One per inbound `messages` row with `sender_type = customer` that reached a terminal processing outcome (AI replied, draft created, or escalated)   | Duplicate webhook deliveries; system messages; outbound messages |
| **↳ AI-handled / human-handled split** | Breakdown of _messages handled_ by who produced the reply                                          | Attributed by the `sender_type` of the reply; an approved or edited AI suggestion counts as AI-handled                                              | Not a fifth KPI — a breakdown of the counter above               |
| **Orders created**                     | Orders originating in the period, in any of `PENDING_CONFIRMATION` or `CONFIRMED` at creation time | One per `orders` row by `created_at`; counted regardless of later cancellation                                                                      | `CANCELLED`-at-creation records; test/sandbox orders             |
| **Human handoffs**                     | Count of entries into `HUMAN_REQUIRED`, grouped by `escalation_reason`                             | One per state transition into `HUMAN_REQUIRED`; a conversation escalating twice counts twice                                                        | Manual takeovers that did not pass through `HUMAN_REQUIRED`      |
| **Conversion**                         | Confirmed orders ÷ AI-created pending orders, expressed as a percentage                            | Numerator: orders reaching `CONFIRMED` whose creator was the AI. Denominator: orders created by the AI in `PENDING_CONFIRMATION` in the same period | Manually created orders on both sides                            |

**Attribution rule:** an order is _AI-attributed_ when it was created by the AI tool chain, regardless of which human later confirmed it. This is the basis of the north-star metric (AI-generated revenue per business).

**Period semantics:** all periods are evaluated in the business timezone, inclusive of the start day and exclusive of the day after the end day.

Founder/ops validation metrics (activation, takeover rate, MRR, retention) are defined in `00_PROJECT_OVERVIEW.md` §11.5. They are **not** additional dashboard tiles.

**Edge case — cancelled after confirmation:** the order remains counted in _orders created_ and in the conversion numerator for the original period; cancellations are not retro-deducted in MVP. Recorded as accepted imprecision in `42_TECH_DEBT.md`.

---

## 16. Non-functional requirements

### 16.1 Performance

| ID           | Requirement                                       | Target                               | Verify |
| ------------ | ------------------------------------------------- | ------------------------------------ | ------ |
| NFR-PERF-01  | Webhook acknowledgement latency                   | p95 < 500 ms, p99 < 1 s              | OB     |
| NFR-PERF-02  | Inbound message → first AI reply delivered        | p95 < 30 s                           | OB     |
| NFR-PERF-03  | Read API responses (lists, detail)                | p95 < 300 ms at 100 concurrent users | AT, OB |
| NFR-PERF-04  | Inbox initial render with 50 conversations        | < 2 s on a 3G-class connection       | MT     |
| NFR-PERF-04a | New inbound message visible in an open inbox      | < 2 s after persist                  | OB     |
| NFR-PERF-04b | Switching between cached conversations            | < 200 ms                             | MT     |
| NFR-PERF-04c | Take-over action confirmed server-side            | < 500 ms                             | AT     |
| NFR-PERF-04d | AI suggestion returned after request              | < 5 s, with a visible pending state  | OB     |
| NFR-PERF-05  | Product search tool execution                     | p95 < 400 ms                         | OB     |
| NFR-PERF-06  | Vector retrieval for a business with 5,000 chunks | p95 < 250 ms                         | AT     |
| NFR-PERF-07  | CSV import of 1,000 rows                          | completes < 60 s                     | AT     |

### 16.2 Scalability

| ID          | Requirement                                                                | Target                                                                                     |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| NFR-SCAL-01 | Concurrent tenants supported on the Phase 1 ECS deployment                 | 100 businesses                                                                             |
| NFR-SCAL-02 | Sustained inbound message throughput                                       | 20 messages/second aggregate                                                               |
| NFR-SCAL-03 | Catalog size per business                                                  | 10,000 variants without query degradation                                                  |
| NFR-SCAL-04 | Conversation history retained and queryable                                | 1,000,000 messages per business                                                            |
| NFR-SCAL-05 | Application tier is stateless; shared state is in PostgreSQL, Redis, or S3 | Three Fargate services from day one (`frontend`, `backend`, `worker`); scale by task count |
| NFR-SCAL-06 | Job workers scale independently of the API process                         | Separate ECS service, same NestJS image                                                    |

### 16.3 Availability and reliability

| ID         | Requirement                                               | Target                                                                        |
| ---------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| NFR-REL-01 | API and webhook availability                              | 99.5% monthly (Phase 1)                                                       |
| NFR-REL-02 | No inbound customer message is lost once acknowledged     | Zero tolerance; webhook acks only after durable persist                       |
| NFR-REL-03 | Job retry policy                                          | 3 attempts with exponential backoff, then dead-letter with alert              |
| NFR-REL-04 | Duplicate side effects from retries                       | Zero; enforced by idempotency keys on messages, orders, and jobs              |
| NFR-REL-05 | Recovery point objective (data loss)                      | ≤ 5 minutes                                                                   |
| NFR-REL-06 | Recovery time objective                                   | ≤ 4 hours                                                                     |
| NFR-REL-07 | Graceful degradation when the LLM provider is unavailable | Fallback model, then queue; inbox continues; humans can reply; owner notified |
| NFR-REL-08 | Meta Graph / webhook unavailable                          | Outbound queued; inbound ack `200` only after durable persist                 |
| NFR-REL-09 | Tool execution failure                                    | Customer is told of uncertainty; human escalation; failure logged             |

### 16.4 Security and privacy

Detailed controls: `17_SECURITY_DESIGN.md`.

| ID         | Requirement                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEC-01 | All traffic over TLS 1.2+; no plaintext transport of credentials or tokens.                                                               |
| NFR-SEC-02 | Data encrypted at rest (database, object storage, backups).                                                                               |
| NFR-SEC-03 | Provider tokens and API keys held in a managed secret store, never in source, environment files committed to VCS, or logs.                |
| NFR-SEC-04 | Every tenant-scoped query is filtered by `business_id`; cross-tenant access is treated as a Sev-1 defect.                                 |
| NFR-SEC-05 | Authorisation is enforced server-side on every endpoint against the permission matrix; UI hiding is not a control.                        |
| NFR-SEC-06 | Customer PII (phone, address) is redacted from application logs and from prompts sent to model providers where not required for the task. |
| NFR-SEC-07 | Webhook endpoints verify provider signatures before processing.                                                                           |
| NFR-SEC-08 | Dependency and container vulnerability scanning runs in CI; critical findings block release.                                              |
| NFR-SEC-09 | Rate limiting protects authentication, public webhooks, and per-tenant AI consumption.                                                    |
| NFR-SEC-10 | A business can request deletion of an end customer's personal data; the system supports targeted erasure.                                 |

### 16.5 Internationalisation and localisation

| ID          | Requirement                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| NFR-I18N-01 | The AI must handle Tunisian Arabic, Modern Standard Arabic, Tunisian Arabizi and French, including code-switching within a single message. |
| NFR-I18N-02 | Arabic content renders right-to-left correctly in the inbox, including mixed-direction text and embedded Latin product names.              |
| NFR-I18N-03 | All merchant-facing UI strings are externalised for translation; no hard-coded display text.                                               |
| NFR-I18N-04 | Currency, number, and date formatting follow the business locale and timezone.                                                             |
| NFR-I18N-05 | Phone number validation accepts Tunisian formats and is extensible to other MENA country codes.                                            |

### 16.6 Usability and accessibility

| ID        | Requirement                                                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-UX-01 | A non-technical merchant can complete onboarding to AI activation unaided in under 20 minutes with a ready CSV.                                                                                                                               |
| NFR-UX-02 | The inbox is usable on mobile web at 375 px width; the merchant's primary device is a phone.                                                                                                                                                  |
| NFR-UX-03 | Every destructive action requires confirmation and is reversible or auditable.                                                                                                                                                                |
| NFR-UX-04 | Every error message states what happened and what the user should do next.                                                                                                                                                                    |
| NFR-UX-05 | Interface meets WCAG 2.1 AA for contrast, focus visibility, and keyboard navigation on core flows.                                                                                                                                            |
| NFR-UX-06 | Every list and empty state provides a next action rather than a blank panel.                                                                                                                                                                  |
| NFR-UX-07 | Operator UI follows **Context-Rich, Not Clutter-Rich** (Brain Dump `# UX/UI Design Direction`): strong hierarchy, progressive disclosure, ~20% less visual clutter than typical dense dashboards; information density without visual density. |
| NFR-UX-08 | Primary merchant UI language is French for the Tunisian market; currency displayed in DT with locale formatting; AI conversation language is separate from UI language.                                                                       |
| NFR-UX-09 | AI activity, consequential actions, and plan usage limits are visible in business language—not raw model metrics—for ordinary users.                                                                                                          |
| NFR-UX-10 | Dashboard and overview screens show 4–6 relevant metrics per view, not every possible KPI; MVP analytics remain exactly four canonical KPIs (§15).                                                                                            |
| NFR-UX-11 | Visual design follows `20_DESIGN_SYSTEM.md` (OnchainStack lime as restrained accent, dark header, calm B2B aesthetic; latest generated dashboard is the visual benchmark).                                                                    |

### 16.7 Observability and operability

| ID          | Requirement                                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-OPS-01  | Structured JSON logging with correlation identifiers spanning webhook → job → outbound send.                                                                                            |
| NFR-OPS-02  | Metrics exported for queue depth, job failure rate, AI latency, tool success rate, provider error rate, and per-tenant message volume.                                                  |
| NFR-OPS-02a | CloudWatch tracks API errors, worker failures, AI latency, and Meta API failures.                                                                                                       |
| NFR-OPS-03  | Alerting on dead-letter queue growth, webhook signature failures, LLM error rate, and database saturation.                                                                              |
| NFR-OPS-04  | Health and readiness endpoints suitable for ECS.                                                                                                                                        |
| NFR-OPS-05  | Database migrations are versioned, forward-only, and run automatically on deploy (after ECS rollout in CI).                                                                             |
| NFR-OPS-06  | The full stack runs locally via a single Docker Compose command with seeded demo data.                                                                                                  |
| NFR-OPS-07  | Production uses ECS Fargate, RDS, ElastiCache, S3, Secrets Manager, CloudWatch, and an ALB. No Kubernetes, no NAT Gateway in MVP, no extra AWS accounts. Canonical: `18_DEPLOYMENT.md`. |

### 16.8 Maintainability and cost

| ID          | Requirement                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-MNT-01  | Module boundaries defined in `10_ARCHITECTURE.md` are enforced; cross-module database access fails review.                                                        |
| NFR-MNT-02  | Shared domain types are defined once and reused by API and frontend.                                                                                              |
| NFR-MNT-03  | Automated tests cover every state transition, guardrail, and idempotency path; these are non-negotiable test targets regardless of aggregate coverage percentage. |
| NFR-MNT-04  | The AI golden set runs in CI on every prompt or model change and blocks merge on regression.                                                                      |
| NFR-COST-01 | Average AI cost per handled conversation is tracked per business and must remain within the modelled margin for the plan.                                         |
| NFR-COST-02 | Retrieval context size is bounded by configuration so a single conversation cannot consume unbounded tokens.                                                      |

---

## 17. Constraints and external dependencies

| Constraint                                                   | Impact on requirements                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Meta messaging policy windows                                | Outbound outside permitted window must surface failure to staff (FR-INT-011)                                                     |
| Meta app review                                              | Instagram and Messenger permissions require app review; onboarding tolerates pending-review state                                |
| WhatsApp 24-hour window, templates, per-conversation billing | Phase 2 only — see FR-INT-023 → 030                                                                                              |
| No payment provider in MVP                                   | Every purchase path terminates in human confirmation (FR-HAND-008); no requirement may assume automated payment.                 |
| LLM provider variability                                     | Latency and availability are outside our control, forcing fallback, timeout, and escalation requirements (FR-AI-028, FR-AI-029). |
| Cash-on-delivery market norms                                | Payment status is a manual staff-set field, not a gateway callback (FR-ORD-006).                                                 |
| Merchant technical skill                                     | Rules out any requirement that assumes API keys, webhooks, or spreadsheets beyond a guided CSV.                                  |

---

## 18. Traceability

| Requirement area                         | User stories                  | Feature spec                   | Primary engineering doc                           |
| ---------------------------------------- | ----------------------------- | ------------------------------ | ------------------------------------------------- |
| FR-AUTH, FR-BIZ                          | `02_USER_STORIES.md` — Epic A | `32_FEATURE_SPECIFICATIONS.md` | `17_SECURITY_DESIGN.md`                           |
| FR-CAT, FR-KNOW                          | Epic B                        | `32_FEATURE_SPECIFICATIONS.md` | `12_DATABASE_DESIGN.md`                           |
| FR-INT                                   | Epic C                        | `32_FEATURE_SPECIFICATIONS.md` | `16_INTEGRATION_DESIGN.md`                        |
| FR-CONV, FR-AI                           | Epic D                        | `32_FEATURE_SPECIFICATIONS.md` | `14_SYSTEM_DESIGN.md`, `15_AI_ARCHITECTURE.md`    |
| FR-LEAD, FR-RT, FR-CONV-030+             | Epic D                        | `32_FEATURE_SPECIFICATIONS.md` | `14_SYSTEM_DESIGN.md`, `20_design/22_UX_FLOWS.md` |
| FR-HAND, FR-ORD                          | Epic E                        | `32_FEATURE_SPECIFICATIONS.md` | `06_AI_HUMAN_HANDOFF_RULES.md`                    |
| FR-CUST, FR-NOTIF                        | Epic F                        | `32_FEATURE_SPECIFICATIONS.md` | `12_DATABASE_DESIGN.md`                           |
| FR-ANL, FR-BILL, FR-OBS, FR-FLAG, FR-AUD | Epic G                        | `32_FEATURE_SPECIFICATIONS.md` | `14_SYSTEM_DESIGN.md`                             |

Every `M`-priority requirement must map to at least one task in `30_execution/30_TASKS.md` before Phase 1 development starts. A `M` requirement with no task is a planning defect.

---

## 19. Open questions

| #     | Question                                                                                                                        | Working answer                                                                                                                                                 | Owner       | Revisit                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| OQ-06 | Does the Brain Dump's "Encryption" requirement imply field-level encryption of customer PII, or only at-rest volume encryption? | Volume encryption at rest plus application-level encryption for provider credentials only. Field-level PII encryption deferred; logged in `42_TECH_DEBT.md`.   | Engineering | Before first enterprise prospect         |
| OQ-07 | Is `draft_only` reply mode required at launch, or is `approval_required` sufficient for beta trust-building?                    | Ship both; `draft_only` is `S` priority (FR-AI-013) and may slip.                                                                                              | Product     | Milestone 4                              |
| OQ-08 | Should employees be able to view AI cost figures?                                                                               | No — cost visibility is Owner-only (FR-OBS-005); employees see no monetary AI data.                                                                            | Product     | Phase 2                                  |
| OQ-09 | Does the 30-day auto-close rule apply to conversations in `HUMAN_REQUIRED` with no pending order?                               | **Yes** at 30 days if no pending order. **7-day stale warning is Phase 2** (`06`, `14`, `41` C-1).                                                             | Product     | Phase 2                                  |
| OQ-10 | Should soft-deleted businesses continue consuming plan seats during the 30-day recovery window?                                 | No; seats are released immediately on soft delete.                                                                                                             | Product     | Phase 2                                  |
| OQ-15 | Are the default lead-score weights correct for fashion?                                                                         | Ship the documented defaults, keep thresholds configurable per business, and tune once 1,000 conversations allow correlation against confirmed orders.         | Product     | Phase 2                                  |
| OQ-16 | Should suggestions generate automatically when a staff member opens a hot-lead thread?                                          | On demand only in MVP (FR-AI-020a), to control cost. Revisit once cost per suggestion is measured.                                                             | AI lead     | Phase 2                                  |
| OQ-17 | Does the pipeline page need to ship at launch?                                                                                  | Yes, read-only (FR-CONV-050); drag-to-advance deferred.                                                                                                        | Product     | Milestone 6                              |
| OQ-24 | If a customer reaches the same merchant on a second channel, do we auto-merge?                                                  | Auto-match `(platform, platform_user_id)`; auto-link **verified** phone; never auto-merge on name. Owner/Admin manual merge in MVP (FR-CUST-010, FR-CUST-011). | Engineering | After first cross-channel design partner |

---

## 20. References

- `docs/00_product/00_PROJECT_OVERVIEW.md` — vision, canonical location map, glossary
- `docs/00_product/03_MVP_SCOPE.md` — the in/out boundary derived from priorities here
- `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md` — AI behaviour rules
- `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md` — escalation triggers and briefing
- `docs/10_engineering/14_SYSTEM_DESIGN.md` — state machine, jobs, rate limits
- `docs/10_engineering/17_SECURITY_DESIGN.md` — permission matrix and security controls
