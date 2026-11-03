| Manual payment status | FR-ORD-006 | Staff-set; no gateway |
| Stock reservations with expiry and sweep | FR-ORD-010 → 012 | Prevents double-selling the last unit |
| Customers, identities, lifecycle stages | FR-CUST-001 → 011 | Platform-id match, verified-phone auto-link, Owner/Admin manual merge |
| Notifications with anti-spam discipline | FR-NOTIF-001 → 006, 010 → 015 | Four trigger situations, deduped and collapsed |

### 5.7 Platform and observability

| Capability                                                       | Requirements                     | Notes on depth                                                                         |
| ---------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| Four KPIs with handoff-reason breakdown                          | FR-ANL-001 → 004                 | Definitions: `01_PRODUCT_REQUIREMENTS.md` §15                                          |
| AI/human split of messages handled                               | Same                             | A breakdown, not a fifth KPI                                                           |
| Plans, subscriptions, usage events, aggregates                   | FR-BILL-001 → 008, FR-BILL-010   | Message caps, AI replies, conversations, monthly AI budget; AI pauses, humans continue |
| AI action logs                                                   | FR-OBS-001, 008, 009             | Every tool call recorded                                                               |
| Decision traces                                                  | FR-OBS-002, 003                  | Per turn; raw trace Owner/Admin                                                        |
| Token and cost tracking                                          | FR-OBS-004, 005, FR-BILL-010     | Owner-only visibility                                                                  |
| Conversation evaluations                                         | FR-AI-032, FR-OBS-011            | Distinct from message thumbs                                                           |
| Staff AI feedback                                                | FR-OBS-006, 007                  | Thumbs plus reason enum                                                                |
| Feature flags, per tenant and platform                           | FR-FLAG-001 → 004                | Needed to keep advanced analytics dark and to kill-switch a channel per tenant         |
| Audit logs                                                       | FR-AUD-001 → 004                 | Human actions separate from AI actions                                                 |
| Rate limiting: per customer, per business, per conversation lock | Per Brain Dump `# Rate Limiting` | Protects margin and prevents interleaved replies                                       |

### 5.8 MVP deployment

| Capability | Notes                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local      | Docker Compose (API, worker, web, Postgres, Redis, MinIO)                                                                                                         |
| Production | Canonical: `docs/10_engineering/18_DEPLOYMENT.md`. ECS Fargate ×3, RDS + pgvector, ElastiCache, S3, Secrets Manager, CloudWatch, Cloudflare → ALB; no NAT Gateway |

---

## 6. Out of scope

Every exclusion names **why** and **where it goes**. An exclusion without a home is how features come back through the side door.

### 6.1 Excluded by the Brain Dump

| Excluded                                                                                                         | Why                                                                                                                                                                           | Home                                               |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Payment gateways** (D17, Flouci, Konnect, Stripe, in-chat checkout)                                            | The entire MVP thesis (H2) is that humans can close. Payments add checkout security, refund flows, PCI questions, and provider selection — all before we know the model works | Roadmap **Phase 4** (not Phase 2)                  |
| **Automated checkout completion by AI**                                                                          | Same as above; also the highest-consequence failure mode in the product                                                                                                       | Phase 4                                            |
| **ERP integration**                                                                                              | No target customer has an ERP                                                                                                                                                 | Phase 5, if ever                                   |
| **Voice AI**                                                                                                     | Different modality, different latency profile, different evaluation problem                                                                                                   | Phase 5                                            |
| **Mobile app**                                                                                                   | Mobile _web_ is required (NFR-UX-02); a native app is distribution work, not product validation                                                                               | Phase 5                                            |
| **Advanced CRM**                                                                                                 | We store selling context, not relationship management                                                                                                                         | Not planned                                        |
| **Marketing automation** (campaigns, broadcasts)                                                                 | Meta policy risk plus a different product                                                                                                                                     | Phase 5                                            |
| **Advanced analytics** (custom reports, segmentation, exports, revenue charts, CSAT, cost-per-order, prompt A/B) | Four counters answer "did it work". Everything else is analysis we cannot yet interpret with no data                                                                          | Phase 4, behind `feature_flags.advanced_analytics` |

### 6.2 Excluded by phase sequencing

| Excluded                                                                             | Why                                                                                                                                                                      | Home                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **WhatsApp channel (Cloud API)**                                                     | Prove sales loop on IG + Messenger first; adds verification friction, 24h window, templates, per-conversation cost before thesis is proven                               | **Phase 2** (with catalog sync) |
| **Rich WhatsApp message types** (interactive lists, reply buttons, catalog messages) | Basic messaging proves the channel; interactive types are a conversion optimisation on top of a working loop                                                             | Phase 3                         |
| **In-app WhatsApp template authoring and submission**                                | Templates are created and approved in Meta; we sync them read-only. Building an authoring and submission UI before we know which templates merchants need is speculative | Phase 3                         |
| **Shopify / WooCommerce catalog sync**                                               | The dominant onboarding failure is "how do I load products", and CSV answers it for launch. Sync is the Phase 2 headline                                                 | Phase 2                         |
| **Google Sheets import**                                                             | Same reasoning, lower value than Shopify                                                                                                                                 | Phase 2                         |
| **Two-way inventory sync**                                                           | Requires a source of truth we do not yet integrate with                                                                                                                  | Phase 3                         |
| **Payment links**                                                                    | Depends on payments                                                                                                                                                      | Phase 4                         |
| **Email / SMS / WhatsApp / push staff alerts**                                       | In-app notification proves the loop; multi-channel alerting is delivery infrastructure                                                                                   | Phase 4                         |
| **Lifecycle marketing automation**                                                   | Needs confirmed-order volume to be meaningful                                                                                                                            | Phase 4                         |
| **Multi-location, teams and shifts, partner API, marketplace templates**             | Platform features for a scale we do not have                                                                                                                             | Phase 5                         |

### 6.3 Excluded AI sophistication

| Excluded                                                                           | Why                                                                                                                         | Home                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Knowledge graph and hybrid graph retrieval**                                     | Explicitly a post-MVP architectural direction. Edges like `complements` require purchase history a new tenant does not have | Brain Dump `# Knowledge Graph & Context Optimization Strategy`, retrieval Phase 3 |
| **Context compression, entity/relationship extraction, dynamic context templates** | Retrieval Phase 2. MVP uses a fixed context template and measures the baseline first                                        | Same section, retrieval Phase 2                                                   |
| **Multiple agents per business, per-channel agents**                               | One agent covers the ICP; multi-agent multiplies configuration and evaluation surface                                       | Phase 5                                                                           |
| **Fine-tuning from feedback**                                                      | Feedback is collected and exported in MVP; training on it is a separate discipline                                          | Post-MVP                                                                          |
| **ML-based recommendation or lead scoring**                                        | Rule-based plus embeddings is sufficient and, critically, explainable                                                       | Phase 3+                                                                          |
| **Vision / image understanding**                                                   | Images are stored and displayed; interpreting them is a model capability and cost question                                  | Post-MVP                                                                          |
| **Shadow mode as a standing programme**                                            | `ai_shadow_mode` flag exists; running it as an ongoing evaluation practice is not MVP work                                  | Phase 2                                                                           |

### 6.4 Excluded product surface

| Excluded                                  | Why                                                                                                         | Home              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------- |
| **Drag-to-advance on the pipeline**       | Read-only proves the view's value; drag must execute state-machine transitions properly, which is real work | Post-MVP          |
| **Typing indicators, read receipts**      | Chat-app parity features that do not serve triage                                                           | Not planned       |
| **Conversation snooze**                   | `C` priority; nice, not load-bearing                                                                        | Phase 2           |
| **Unsupervised / fuzzy customer merge**   | Name-similarity auto-merge is unsafe; confident auto-link + manual merge ship in MVP                        | Phase 2+ if ever  |
| **Custom roles and granular permissions** | Three roles cover a 1–20 person business                                                                    | Phase 5           |
| **Business ownership transfer**           | Rare, manual-supportable                                                                                    | Phase 2           |
| **Multi-factor authentication**           | Not expected by this market at this stage; revisit for enterprise                                           | Phase 3           |
| **Merchant-facing prompt editing UI**     | Prompts are versioned and overridable via API; a safe editing UI needs guardrails and preview               | Phase 2           |
| **Field-level PII encryption**            | At-rest volume encryption plus encrypted credentials ship; field-level is recorded as debt                  | `42_TECH_DEBT.md` |

---

## 7. Deliberate hooks

Cheap now, expensive to retrofit. These are **in scope** specifically because leaving them out would force rework, even though the feature they serve is deferred.

| Hook                                                              | Serves                                                               | Cost of omitting                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Emit all documented domain events faithfully                      | Knowledge graph ingestion, analytics, future automation              | Backfilling event history is impossible                   |
| Single context-builder component with one assembly point          | Retrieval Phase 2 and 3                                              | Retrieval changes would touch the orchestrator everywhere |
| `ai_usage` token recording from day one                           | Cost optimization, unit economics                                    | No baseline means no way to prove an optimization worked  |
| Prompt versioning and decision traces                             | Evaluation, regression attribution                                   | Quality changes become unattributable                     |
| Feature-flag checks in integrations UI, orchestrator, and billing | Advanced analytics, VIP auto-handoff, per-tenant channel kill switch | Dark launches would need code changes                     |
| Channel adapter interface + WhatsApp stub                         | Phase 2 WhatsApp                                                     | Third adapter plugs in without orchestrator changes       |
| `feature_flags.whatsapp_enabled`                                  | Phase 2 rollout                                                      | Per-tenant enable without redeploy                        |
| `GraphRetrievalProvider` as a no-op                               | Retrieval Phase 3                                                    | Retrieval layer would need restructuring                  |
| Reservation and idempotency infrastructure                        | Payments in Phase 4                                                  | Double-charging is the failure mode                       |
| `currency`, `default_language`, `timezone` per business           | MENA expansion                                                       | Tenant-wide migration later                               |
| Externalised UI strings                                           | Localisation                                                         | Every screen touched again                                |

**Rule:** a hook is an interface or a recorded fact. It is **not** a partial implementation. Do not build half of a deferred feature and call it a hook.

---

## 8. Boundary clarifications

Cases where reasonable people have already disagreed, settled here so they are not re-argued in a task ticket.

| Question                                                  | Answer                                                 | Reason                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Is WhatsApp in the MVP?                                   | **No — Phase 2** (Cloud API, official only).           | Prove handoff → confirmed on IG + Messenger first; adapter stub ships in MVP                    |
| Can a merchant launch without WhatsApp?                   | **Yes — expected.**                                    | One active IG or Messenger account satisfies G3                                                 |
| Would we use Evolution Go for speed?                      | **Never.**                                             | Ban risk on merchant's business number                                                          |
| Is the pipeline page in the MVP?                          | **Yes, read-only.**                                    | Query over existing data; owners see stuck revenue                                              |
| Is lead scoring in the MVP?                               | **Yes.**                                               | Without it the list is recency-ordered and the whole triage thesis (H4) is untested             |
| Are AI suggestions in the MVP?                            | **Yes.**                                               | Same machinery as `approval_required` drafts, surfaced differently. High value per unit of work |
| Is realtime in the MVP?                                   | **Yes.**                                               | An inbox that needs manual refresh fails H4 on the first busy day                               |
| Is `draft_only` mode in the MVP?                          | **Should-have.**                                       | `approval_required` covers the trust-building need; `draft_only` may slip                       |
| Is Google OAuth in the MVP?                               | **Should-have.**                                       | Email/password satisfies the requirement; OAuth is convenience                                  |
| Is a native mobile app in the MVP?                        | **No — but mobile web is mandatory.**                  | Merchants operate from phones; the browser is sufficient                                        |
| Do we build image understanding?                          | **No — but we store and display images.**              | Storage is cheap and expected; interpretation is a model decision                               |
| Do we ship self-service billing checkout?                 | **Should-have.** Enforcement of limits is a **Must**.  | Ten design-partner tenants can be invoiced manually; ungoverned usage cannot be fixed manually  |
| Is the AI Playground in the MVP?                          | **Yes.**                                               | It gates activation (G4) and is the cheapest possible trust-building surface                    |
| Is confident identity matching + manual merge in the MVP? | **Yes.**                                               | Same platform id and verified phone auto-link; fuzzy merge is not                               |
| Do we deploy to ECS on day one?                           | **Yes — small Fargate.**                               | Credits / free ECS access. Three services only. No K8s, no VPS, no later migration.             |
| Do we support more than one business per user?            | **Yes, minimally.**                                    | Tenant scoping already requires it; the switcher is trivial once scoping is right               |
| Do we implement Postgres RLS?                             | **No in MVP.** Application-layer scoping is mandatory. | Defence in depth after a Sev-1; never the only control (`17` OQ-70)                             |

---

## 9. Scope change control

Scope will be challenged. The process is deliberately slightly annoying.

**To add something to the MVP, a proposal must state:**

1. Which hypothesis in §2 it tests, or which launch-gate item in §10 it unblocks
2. What is being **removed or downgraded** to make room — scope is a fixed volume, not a queue
3. The requirement IDs it introduces in `01_PRODUCT_REQUIREMENTS.md`
4. Its effect on the launch gate

**Automatically out of scope, no discussion needed:**

- Anything listed in §6
- Anything that requires a payment provider
- Anything that needs a new datastore
- Anything whose value cannot be observed with the four MVP KPIs
- Anything that only helps tenants at a scale we do not have (multi-location, shifts, custom roles)

**Approved changes must update, in this order:** `01_PRODUCT_REQUIREMENTS.md` → this document → `30_TASKS.md` → `43_CHANGELOG.md`, with an ADR in `40_DECISIONS.md` if it changes an architectural commitment.

---

## 10. Launch gate

Phase 1 is complete when every line is true. This is the definition of done for the MVP, distinct from the _activation gates_ that govern an individual tenant (`01_PRODUCT_REQUIREMENTS.md` §14).

### 10.1 Functional

- [ ] Every `M`-priority requirement in `01_PRODUCT_REQUIREMENTS.md` is implemented and its user stories pass
- [ ] All fifteen `HUMAN_REQUIRED` triggers fire correctly and produce a briefing
- [ ] The full purchase handoff chain works end to end on a live Instagram thread: intent → collection → reservation → pending order → handoff → notification → confirmation
- [ ] A merchant can go from signup to activated AI without engineering assistance
- [ ] Both MVP channels (Instagram, Messenger) deliver and receive in production

### 10.2 Quality

- [ ] Golden set of 50–100 Tunisian Arabic and French prompts runs in CI and passes
- [ ] Answer accuracy above 90% on FAQ, price, and stock questions in staff review
- [ ] Hallucination rate below 2% on the sampled set
- [ ] Zero instances of an invented price, stock figure, discount, or policy in the evaluation set
- [ ] Tool success rate above 99% in staging load tests

### 10.3 Operational

- [ ] p95 inbound-to-first-reply under 30 seconds under expected load
- [ ] Webhook acknowledgement p95 under 500 ms
- [ ] Duplicate webhook delivery produces no duplicate message, AI run, or order
- [ ] Dead-letter queue, retries, and alerting verified by fault injection
- [ ] Model provider outage degrades gracefully: fallback, then escalation, never a degraded reply
- [ ] Two application instances run concurrently with correct realtime fan-out and conversation locking

### 10.4 Security and tenancy

- [ ] Cross-tenant access attempts fail on every endpoint, verified by automated test
- [ ] Role permissions enforced server-side and verified per endpoint
- [ ] Provider credentials encrypted; no token or PII in logs
- [ ] Webhook signature verification enforced

### 10.5 Commercial

- [ ] Plan limits enforced, with AI pausing and humans still able to reply
- [ ] Four KPIs computed from rollups and consistent across reloads
- [ ] Usage warnings at 80% and 95%
- [ ] Three design-partner merchants onboarded and processing live conversations

### 10.6 Documentation

- [ ] All 26 documents populated and mutually consistent
- [ ] Local environment runs from a single command with seeded demo data
- [ ] Runbook exists for channel disconnection, model outage, and stuck queues

---

## 11. Explicit non-goals for Phase 1

Stated so nobody optimises for them prematurely:

| Non-goal                           | What we accept instead                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Scale beyond 100 tenants           | Correctness at small scale; the architecture allows growth (`NFR-SCAL-*`)                      |
| Minimal AI cost per conversation   | A measured baseline. Optimization needs data first                                             |
| Feature parity with any competitor | Depth on one workflow: DM to confirmed order                                                   |
| Complex multi-page marketing CMS   | A focused single-page commercial landing page (`/`) with Derja demo and Meta review legal      |
| Broad vertical coverage            | Fashion only; the catalog model is variant-first for a reason                                  |
| Perfect Arabic across all dialects | Tunisian Arabic and French, well                                                               |
| Self-service growth                | Hand-held onboarding of the first ten merchants, with the friction documented as Phase 2 input |

---

## 12. Risks to scope

| Risk                                                   | Impact                                   | Mitigation                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Meta app review delays channel access                  | Blocks H1, H2, H3 entirely               | Start review early; sandbox conversation lets onboarding proceed in parallel                                          |
| Design partners require WhatsApp before paying         | MVP positioning fails for part of market | Phase 2 WhatsApp is the planned response; validate with 5 merchant interviews first                                   |
| "Just add payments" pressure from a design partner     | Destroys the MVP thesis and adds months  | H2 exists precisely to test whether payments are needed. Point at the conversion metric                               |
| Command-center scope creep into a full CRM             | Slips launch on non-differentiating work | §8 boundary table; the three-question UX test in `00_PROJECT_OVERVIEW.md` §5.8                                        |
| Lead scoring tuning becomes a research project         | Endless iteration on weights             | Ship documented defaults, make thresholds configurable, tune after 1,000 conversations (OQ-15)                        |
| AI quality below the launch gate at code-complete      | Cannot launch                            | Golden set runs in CI from the first orchestrator commit, not at the end                                              |
| Merchant catalogs are messier than the CSV assumes     | Activation gate G1 unreachable           | Row-level error reporting is `M`; manual entry always available as fallback                                           |
| Realtime complexity on ECS (sticky sessions, upgrades) | Inbox feels broken                       | Polling fallback is a requirement (FR-RT-005), not an afterthought; ALB idle timeout + WebSocket upgrade are required |

---

## 13. Open questions

| #     | Question                                                                                                                                        | Working answer                                                                                                                                    | Owner       | Revisit                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| OQ-18 | Do design partners get free access during Phase 1, and does that bypass billing enforcement?                                                    | Free plan with real limits applied, so enforcement is genuinely tested. No bypass path in code.                                                   | Founder     | Before first onboarding                  |
| OQ-19 | Is three design partners enough to declare the launch gate met, given the Phase 1 target of ten paying businesses?                              | Three for the **launch gate**, ten for **Phase 1 exit** (`04_ROADMAP.md`). Different bars.                                                        | Product     | Launch                                   |
| OQ-20 | If H2 shows strong conversion but merchants demand payments anyway, does Phase 4 move earlier?                                                  | Yes — conversion evidence is exactly the signal that justifies reordering. Re-plan rather than squeeze it into Phase 1.                           | Founder     | Phase 1 review                           |
| OQ-21 | Does the pipeline view need to include manually created orders?                                                                                 | Yes; it is a revenue view, not an AI-attribution view. Attribution stays in analytics.                                                            | Product     | Milestone 6                              |
| OQ-22 | Should WhatsApp conversations count against the same plan message allowance as Instagram and Messenger, given Meta charges us per conversation? | Same allowance in MVP for pricing simplicity, metered separately internally. Revisit before public pricing once real per-channel margin is known. | Founder     | Phase 1 review                           |
| OQ-23 | Which WhatsApp templates should ship as recommended defaults for merchants to submit?                                                           | Order confirmation follow-up and a re-engagement message. Draft them for design partners rather than building authoring.                          | Product     | Milestone 3                              |
| OQ-24 | If a customer reaches the same merchant on WhatsApp and Instagram, do we auto-merge the customer records?                                       | Auto-match platform id; auto-link **verified** phone; Owner/Admin manual merge in MVP. Fuzzy / name merge stays out.                              | Engineering | After first cross-channel design partner |

---

## 14. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# MVP`, `# Roadmap` — authoritative scope statements
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` — requirement IDs, priorities, activation gates, KPI definitions
- `docs/00_product/02_USER_STORIES.md` — acceptance criteria for everything in §5
- `docs/00_product/04_ROADMAP.md` — where every §6 exclusion lands
- `docs/30_execution/31_IMPLEMENTATION_PLAN.md` — build order and milestones for §5
- `docs/40_project_management/42_TECH_DEBT.md` — accepted shortcuts inside the MVP
