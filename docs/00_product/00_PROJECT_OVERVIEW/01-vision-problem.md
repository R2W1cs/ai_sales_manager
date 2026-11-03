# 00 — Project Overview

| Field           | Value                                                                     |
| --------------- | ------------------------------------------------------------------------- |
| Document ID     | `00_PROJECT_OVERVIEW`                                                     |
| Status          | Approved (MVP baseline)                                                   |
| Owner           | Product / Founding team                                                   |
| Audience        | Every contributor: product, engineering, design, AI, and AI coding agents |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` (authoritative)                       |
| Last reviewed   | Phase 1 (MVP) planning                                                    |

---

## 1. Purpose of this document

This is the **entry point** of the documentation system. It answers, in one place:

- What the product is and is not
- Who it is for and which market it starts in
- Which problem it solves and how it makes money
- Which non-negotiable decisions constrain every downstream document
- Where every other decision lives (canonical location map)

It deliberately contains **no** deep specification. Anything detailed — schemas, endpoints, AI rules, UI — lives in the documents referenced in §10. If this document and a downstream document disagree, the downstream document wins for detail, and this document wins for intent. If either contradicts the Founder Brain Dump, the **Brain Dump wins** and the conflict is recorded in `docs/40_project_management/41_ASSUMPTIONS.md`.

---

## 2. Product identity

### 2.1 Name

**AI Sales Agent**

### 2.2 One-sentence description

An AI-powered sales employee plus a human sales desk for social commerce — it connects to messaging channels, understands products and business rules, answers customers, recommends products, and generates qualified orders, while humans close payment when needed.

### 2.3 Positioning statement

This is **not** a generic AI chatbot. The chatbot market is crowded, undifferentiated, and priced as a commodity. The product is:

> **An AI sales employee + a human sales desk, built for how merchants actually sell on Instagram and Facebook.**

The distinction is operational, not cosmetic. A chatbot answers questions. This product runs a **sales workflow**: it holds a grounded view of catalog, stock, and business policy; it moves a conversation toward an order; it creates that order as a real database record; and it hands the conversation to a human at the exact moment human judgement or payment is required.

The operator-facing half of that positioning matters just as much. We are not building another chat client — merchants already have WhatsApp, Instagram, and Messenger on their phones. We are building a **sales command center**: closer to Intercom + WhatsApp + CRM than to a messaging app. Full specification: `docs/20_design/22_UX_FLOWS.md`.

### 2.4 What we explicitly are not

| Not this                    | Why it matters                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A generic FAQ chatbot       | No commerce workflow, no order records, no ROI story                                                        |
| A full ecommerce platform   | We do not own storefront, checkout, or fulfilment in MVP                                                    |
| An autonomous payment agent | MVP has **no payment gateway**; humans close the transaction (see §5.3)                                     |
| A CRM                       | We store commercial context for selling, not a full relationship system                                     |
| A helpdesk / ticketing tool | The unit of work is a _sales conversation_, not a ticket                                                    |
| Another chat client         | The merchant already has the native apps. We win on triage, context, and action — not on rendering messages |

### 2.5 Long-term vision

Become the **AI sales operating system for SMBs in emerging markets** — the layer where a small merchant's catalog, policies, conversations, and orders live and are operated by AI with human oversight.

---

## 3. The problem

### 3.1 Who has it

Small social-commerce merchants, typically:

- 1–20 employees
- Sell primarily through Instagram and Facebook DMs (not a website checkout)
- Receive high volumes of repetitive inbound messages
- Have no dedicated, trained sales team
- Operate cash-on-delivery or informal payment flows

### 3.2 What it costs them

| Pain                                                                    | Business consequence                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Slow replies (nights, weekends, peak hours)                             | Customer buys from a competitor who replied first      |
| Repetitive questions ("price?", "available in M?", "delivery to Sfax?") | Owner time consumed by low-value work                  |
| Inconsistent answers between staff                                      | Wrong prices promised, margin loss, disputes           |
| No record of what was discussed                                         | Lost follow-ups; no pipeline visibility                |
| No measurement                                                          | Owner cannot tell which conversations produced revenue |

### 3.3 Why existing options fail

- **Generic chatbots** cannot see stock, price, or policy, so they either stay vague or hallucinate. Merchants disable them after the first wrong price.
- **Hiring staff** is linear cost and does not solve night/weekend coverage.
- **Ecommerce platforms** assume the customer goes to a website; these customers buy inside a DM thread.
- **Foreign-language assistants** cannot hold a natural Tunisian Arabic / French code-switching conversation, which is how the market actually talks.

---

## 4. The solution

### 4.1 Solution in one paragraph

The merchant connects their Instagram account and Facebook Page (Messenger), imports products, and states their business rules (delivery zones and fees, payment methods, return window). The AI then handles inbound conversations end to end: it classifies intent, retrieves grounded facts from the catalog and knowledge base via tools, answers in the customer's language, recommends products, and — when it detects real buying intent — collects the order details, reserves stock, creates a **pending order**, pauses itself, and notifies staff. A human confirms payment and delivery, and the system records the conversion.

### 4.2 The four differentiators (moat)

| Pillar                | Why it is defensible                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local language**    | Tunisian Arabic, French, and Arabic with natural code-switching in a single thread. Hard to fake with a generic English-first product.                |
| **Commerce workflow** | Products, variants, inventory, stock reservations, orders, and handoff are first-class domain objects — not prompt text.                              |
| **Business memory**   | Rules, policies, promotions, and customer history are stored, versioned, and injected as authoritative context. The AI is _grounded_, never guessing. |
| **Sales analytics**   | AI-attributed revenue and the handoff → confirmed conversion rate, which is the number a merchant actually cares about.                               |

### 4.3 Core operating principle

> **The AI handles 80–90% of the conversation. The human closes the final transaction.**

This principle is the reason the product can ship without payment integrations, checkout security, or refund automation, while still proving ROI. Automated payment is a **later upgrade, not an MVP blocker**. See `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md`.

---

## 5. Non-negotiable product decisions

These constrain every downstream document. Changing one of these is a re-architecture, not a tweak.

### 5.1 Grounding over generation

The model may **never** produce a price, stock level, policy, discount, or delivery fee from its own parametric knowledge. Every commerce fact in an outbound message must originate from a tool result or a stored business rule **within the same turn**. Canonical rules: `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md`.
