Increase inbound volume and make stock trustworthy enough that the AI can commit to availability without a human double-check.

### 6.2 Ships

| Capability                             | Detail                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Two-way inventory sync**             | Where platform APIs allow; reduces the inventory-conflict escalation reason                                 |
| **Richer WhatsApp message types**      | Interactive lists, reply buttons, catalog/product messages, in-app template library management (FR-INT-033) |
| **Improved recommendation rules**      | Secondary to catalog accuracy; still rule-based plus embeddings                                             |
| **Multi-factor authentication**        | Deferred from MVP; revisit for larger tenants                                                               |
| **ML-based recommendation or scoring** | Only if rule-based scoring is measurably limiting — see §2.3                                                |

### 6.3 Sequencing note

Inventory trust is placed **before** payments deliberately. Automating payment on top of unreliable stock produces the worst possible outcome: charged customers with unfulfillable orders.

### 6.4 Success metrics

| Metric                              | Target              |
| ----------------------------------- | ------------------- |
| Message volume                      | 3× Phase 2 baseline |
| Inventory conflict escalations      | Down materially     |
| WhatsApp template send success rate | > 95%               |

---

## 7. Phase 4 — Payments & sales automation

### 7.1 Goal

Reduce human workload per order while preserving the trust established by human confirmation.

### 7.2 Why payments wait until here

The MVP thesis (H2) is that humans can close. Payments are only justified once that loop is proven and the constraint has shifted from _"does this convert?"_ to _"staff cannot keep up with confirmations."_ Building payments earlier would add checkout security, refund flows, PSP selection, and reconciliation before knowing whether they are needed.

### 7.3 Ships

| Capability                                     | Detail                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Optional payment links**                     | D17, Flouci, Konnect, Stripe (international). Flow: AI creates order → payment link → webhook → order confirmed automatically                    |
| **In-chat checkout**                           | Only if payment links prove insufficient                                                                                                         |
| **`auto_send` as default**                     | For mature tenants with a demonstrated quality record                                                                                            |
| **Lifecycle automation**                       | Post-purchase follow-up, re-engagement, win-back                                                                                                 |
| **Email / SMS / WhatsApp / push staff alerts** | Multi-channel notification beyond in-app (FR-NOTIF-007, FR-HAND-011)                                                                             |
| **Advanced analytics**                         | Custom reports, segmentation, exports, revenue charts, CSAT, cost per order, prompt A/B — behind `feature_flags.advanced_analytics` (FR-ANL-005) |
| **Refund handling support**                    | Structured refund workflow for staff; the AI still never approves a refund                                                                       |

### 7.4 Constraints that survive this phase

Even with payments, these do not change:

- The AI never approves refunds
- Grounding rules remain absolute
- Escalation triggers remain enumerated and code-driven
- A merchant can always disable automated payment and revert to human confirmation

### 7.5 Success metrics

| Metric                                        | Target                                             |
| --------------------------------------------- | -------------------------------------------------- |
| Human messages per confirmed order            | Down materially                                    |
| CSAT                                          | Stable or improved                                 |
| Payment-link conversion vs human confirmation | Measured per tenant before defaulting anyone to it |

---

## 8. Phase 5 — AI commerce OS

### 8.1 Goal

Become the operating system for social commerce in MENA rather than a single-workspace tool.

### 8.2 Ships

Multi-location support, teams and shifts, partner/public API, marketplace templates, custom roles and granular permissions, multi-agent and per-channel agents, business ownership transfer, and vertical expansion beyond fashion.

### 8.3 Entry condition

Phase 5 is justified only when tenants outgrow the single-workspace model — multiple physical locations, staff rotas, or partners wanting programmatic access. Building team and shift management for a five-person merchant is premature.

---

## 9. Parallel track — retrieval maturity

Retrieval evolves on its own track, mapped onto but not identical to product phases. Canonical: Brain Dump `# Knowledge Graph & Context Optimization Strategy`.

| Retrieval stage                    | Product phase alignment | Content                                                                                                                                |
| ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Grounded simplicity**       | Phase 1                 | PostgreSQL + pgvector, standard RAG, business rules, fixed context template. Goal: correctness                                         |
| **R2 — Efficient context**         | Phases 2–3              | Context compression, intent-driven templates, rolling summaries, structured facts, entity extraction, hybrid ranking. Goal: efficiency |
| **R3 — Graph-augmented reasoning** | Phases 4–5              | Relationship extraction, knowledge graph, hybrid graph retrieval, AI memory optimization. Goal: reasoning depth                        |

**Entry signal for R2:** catalogs or conversations large enough that the fixed context template stops fitting comfortably.
**Entry signal for R3:** relationship questions (complements, substitutes, promotion eligibility) become a measurable share of turns and answer poorly from flat retrieval.

---

## 10. Reordering triggers

The plan is evidence-driven, so evidence may change it. These are the sanctioned reasons to reorder, each requiring a decision record in `40_DECISIONS.md`.

| Trigger                                                               | Effect                                                                   | Rationale                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 conversion is strong **and** merchants demand payments loudly | Pull Phase 4 payments forward                                            | Conversion evidence is exactly the signal that justifies it (OQ-20). Re-plan properly rather than squeezing it into an earlier phase |
| Design partners are overwhelmingly WhatsApp-first                     | Pull WhatsApp to the front of Phase 2, ahead of catalog sync             | Channel access is more fundamental than catalog convenience                                                                          |
| Merchants abandon at catalog import despite CSV                       | Expand Phase 2 catalog work; delay WhatsApp within the phase             | Activation blocker outranks channel breadth                                                                                          |
| Hallucination or accuracy metrics fail in production                  | Pause feature phases; prioritise retrieval stage R2 and evaluation       | Quality regressions invalidate every other metric                                                                                    |
| Meta platform policy change restricts a channel                       | Re-sequence channels; adapter pattern limits blast radius                | Provider risk is outside our control                                                                                                 |
| A competitor commoditises the handoff workflow                        | Accelerate the moat pillars (local language, business memory, analytics) | Positioning defence, not feature parity                                                                                              |

**Not valid reasons to reorder:** a single loud customer, a competitor's press release, or an interesting new model release.

---

## 11. Deferred item index

Every exclusion from `03_MVP_SCOPE.md` §6, with its phase. This table is the contract that nothing was dropped silently.

| Deferred item                                                             | Phase                               |
| ------------------------------------------------------------------------- | ----------------------------------- |
| WhatsApp Cloud API (basic messaging, window, templates)                   | 2                                   |
| Shopify / WooCommerce catalog sync                                        | 2                                   |
| Google Sheets import                                                      | 2                                   |
| CSV import hardening                                                      | 2                                   |
| Conversation snooze                                                       | 2                                   |
| Customer record merging across channels                                   | 2                                   |
| Merchant-facing prompt editing UI                                         | 2                                   |
| Business ownership transfer                                               | 2                                   |
| Shadow mode as a standing programme                                       | 2                                   |
| Context compression, entity/relationship extraction                       | 2–3 (R2)                            |
| Two-way inventory sync                                                    | 3                                   |
| Rich WhatsApp message types, in-app template authoring                    | 3                                   |
| Improved recommendation rules                                             | 3                                   |
| Multi-factor authentication                                               | 3                                   |
| ML-based recommendation or lead scoring                                   | 3+                                  |
| Payment gateways, payment links, in-chat checkout                         | 4                                   |
| Automated checkout completion by AI                                       | 4                                   |
| Email / SMS / WhatsApp / push staff alerts                                | 4                                   |
| Lifecycle marketing automation                                            | 4                                   |
| Advanced analytics (reports, segmentation, exports, CSAT, cost per order) | 4                                   |
| `auto_send` as default for mature tenants                                 | 4                                   |
| Drag-to-advance pipeline                                                  | 4 (post-MVP)                        |
| Knowledge graph, hybrid graph retrieval                                   | 4–5 (R3)                            |
| Multiple agents per business, per-channel agents                          | 5                                   |
| Custom roles and granular permissions                                     | 5                                   |
| Multi-location, teams and shifts                                          | 5                                   |
| Partner / public API, marketplace templates                               | 5                                   |
| Voice AI                                                                  | 5                                   |
| Native mobile app                                                         | 5                                   |
| ERP integration                                                           | 5, if ever                          |
| Marketing automation (campaigns, broadcasts)                              | 5                                   |
| Fine-tuning from feedback                                                 | Post-MVP, unscheduled               |
| Vision / image understanding                                              | Post-MVP, unscheduled               |
| Advanced CRM                                                              | Not planned                         |
| Typing indicators, read receipts                                          | Not planned                         |
| Field-level PII encryption                                                | Tracked as debt (`42_TECH_DEBT.md`) |

---

## 12. Anti-roadmap

Things we are choosing **not** to build at any phase, recorded so they stop being proposed.

| Not building                                   | Why                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Unofficial WhatsApp automation                 | Risks banning the merchant's business number. Prohibited at every phase    |
| A general-purpose chatbot builder              | Different product, commodity market, destroys the commerce moat            |
| Our own storefront / checkout platform         | Merchants sell in DMs; a storefront competes with Shopify for no advantage |
| A full CRM                                     | We store selling context, not relationship management                      |
| Helpdesk / ticketing                           | The unit of work is a sales conversation, not a ticket                     |
| Self-hosted model training                     | Cost and expertise far exceed the benefit at this scale                    |
| Broad vertical templates before fashion is won | Depth in one vertical beats shallow coverage of five                       |

---

## 13. Metric evolution by phase

The measurement surface grows deliberately, not all at once.

| Phase | Metrics added                                                                                | Rationale                                             |
| ----- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1     | Four KPIs: messages handled (AI/human split), orders created, handoffs by reason, conversion | Answer "did it work" with the minimum instrumentation |
| 2     | Time-to-activation, catalog connect rate, per-channel volume and cost                        | Measure the blockers this phase removes               |
| 3     | Inventory conflict rate, recommendation acceptance, template success rate                    | Measure trust and depth                               |
| 4     | Human messages per order, CSAT, cost per confirmed order, payment conversion                 | Measure automation's effect on load and satisfaction  |
| 5     | Per-location and per-team metrics, API partner usage                                         | Platform-level reporting                              |

---

## 14. Open questions

| #     | Question                                                                            | Working answer                                                                                                         | Owner       | Revisit         |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------- | --------------- |
| OQ-25 | Within Phase 2, does WhatsApp or catalog sync ship first?                           | Catalog first per the Brain Dump priority, unless merchant interviews show WhatsApp-first dominance (§10).             | Product     | Phase 2 kickoff |
| OQ-26 | Does Phase 3 inventory sync require write-back, or is read-only enough?             | Read-only first; write-back only where a platform API makes it safe.                                                   | Engineering | Phase 3         |
| OQ-27 | Which PSP for Phase 4 payment links in Tunisia?                                     | Undecided; local PSP landscape must be re-evaluated at phase start rather than assumed now.                            | Founder     | Phase 4         |
| OQ-28 | Should vertical expansion beyond fashion happen in Phase 3 or Phase 5?              | Phase 5. The catalog model is variant-first for fashion; other verticals need attribute work that competes with depth. | Product     | Phase 4 review  |
| OQ-29 | Do we ever revisit aggregator BSPs for WhatsApp if Meta onboarding proves too hard? | Only if verification friction demonstrably blocks a majority of merchants; recorded as rejected for now.               | Engineering | Phase 2         |

---

## 15. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Roadmap`, `# Integration Architecture` — authoritative
- `docs/00_product/03_MVP_SCOPE.md` — the exclusions this document sequences
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` — requirement IDs referenced per phase
- `docs/30_execution/31_IMPLEMENTATION_PLAN.md` — dates, milestones, and delivery sequencing
- `docs/40_project_management/40_DECISIONS.md` — decision records for any reordering
