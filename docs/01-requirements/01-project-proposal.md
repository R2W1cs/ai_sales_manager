# 01. Project Proposal

| | |
|---|---|
| **Project** | AI Sales Manager |
| **Author** | Rayen (requirements, methodology, design) |
| **Status** | Draft for team review |
| **Methodology** | Scrum, 2-week sprints (see [methodology](../02-methodology/01-methodology.md)) |

## 1. Problem

Small Tunisian online shops sell mostly through Instagram and Messenger direct messages. The owner or one employee answers every message by hand, in a mix of French, Arabic and Derja, often late at night. Three things go wrong:

1. **Slow replies lose sales.** A customer who asks "chhal el prix?" and waits three hours buys elsewhere.
2. **Answers are inconsistent.** Prices, stock, delivery fees and return rules live in the owner's head or in scattered chats.
3. **Nothing is measured.** The owner cannot tell how many conversations became orders, or which ones were missed.

Generic chatbots do not fit: they do not speak Derja or Arabizi, they invent prices and stock, and they try to close payments that Tunisian shops usually take as cash on delivery.

## 2. Vision

> A merchant connects Instagram and Messenger, loads a catalog and the shop's rules, and activates an AI that answers customers in their own language **using only real data**. When a customer is ready to buy, the AI collects the order details and hands the customer to a human as a *pending order*. Staff confirm it in one action. Four numbers show whether it worked.

The deliberate design choice is **a human closes the sale**. The AI never takes payment, never discounts, and never invents a fact. This keeps the highest-risk failure modes out of the first release.

## 3. Stakeholders and users

| Stakeholder | Goal | Main interactions |
|---|---|---|
| **Merchant owner** | More sales for less manual chat work, without losing control | Sets up the workspace, catalog and rules, activates the AI, reads KPIs |
| **Admin / manager** | Run daily operations | Manages catalog, rules, team, channels |
| **Employee / sales agent** | Work the conversations that need a human | Triage inbox, take over, confirm orders |
| **End customer** | Fast, correct answers in their own language | Chats on Instagram, Messenger or a website widget |
| **Course instructor / graders** | Evidence of sound engineering practice | Reads docs, code, tests, metrics |
| **Platform operator** (the team) | A system that is safe, observable and cheap to run | Deploys, monitors, reviews AI quality |

## 4. Product hypotheses

The first release is an experiment. Every in-scope feature must serve one of these hypotheses.

| # | Hypothesis | Falsified if | Measured by |
|---|---|---|---|
| H1 | An AI can hold a grounded sales conversation in Tunisian languages well enough that merchants let it talk to real customers | Merchants keep the AI on "approval required" forever, or switch it off | Share of businesses on auto-send, hallucination rate |
| H2 | Handing a qualified buyer to a human converts, even without online payment | Pending orders pile up unconfirmed | Handoff-to-confirmed conversion |
| H3 | Merchants will do the setup work (channel, catalog, rules) | Sign-ups stall before AI activation | Activation funnel |
| H4 | A triage-first inbox makes the AI's output usable | Merchants ignore the dashboard | Daily active operators, time from handoff to human reply |

## 5. Scope

### In scope (Phase 1)

- Accounts, workspaces, team invitations, role-based access (Owner, Admin, Employee)
- Product catalog with variants, images, stock, CSV import
- Business rules (delivery zones and fees, payment methods, returns) and FAQ/policy documents
- Channels: **Instagram and Messenger** (plus a website chat widget)
- AI that answers using catalog search, stock check and policy lookup tools
- Reply modes: auto-send, approval required, draft only
- 15 defined situations in which the AI hands over to a human
- Triage inbox with priority, takeover, resume, notes, assignment, realtime updates
- Pending orders and one-click confirmation or cancellation
- Customer profiles, lead scoring, notifications
- Four KPIs (messages handled, orders created, human handoffs, conversion)
- A playground to test the AI before customers see it

### Out of scope (with a planned home)

| Excluded | Why | Later phase |
|---|---|---|
| Online payment gateways, AI checkout | The thesis is that humans can close. Payments add security and refund complexity before the model is proven | Phase 4 |
| WhatsApp channel | Prove the loop on Instagram and Messenger first | Phase 2 |
| Shopify / WooCommerce / Google Sheets sync | CSV import is enough to launch | Phase 2 |
| Advanced analytics, marketing automation | Four counters answer "did it work" | Phase 4 to 5 |
| Voice AI, native mobile app, ERP | Different products | Phase 5 |

Anything not listed as in scope is out of scope by default. Adding it needs the change-control step in the methodology.

## 6. Success criteria

| Area | Target |
|---|---|
| Activation | A non-technical merchant reaches AI activation in under 20 minutes with a ready CSV |
| Reply speed | First AI reply delivered in under 30 s (p95) |
| Safety | Zero invented prices or stock in the golden evaluation set; zero cross-tenant data leaks |
| Reliability | No acknowledged customer message is ever lost |
| Business | Handoff-to-confirmed conversion is tracked from day one |

## 7. Constraints and assumptions

| Type | Item |
|---|---|
| Constraint | Meta app review and permissions gate the real Instagram/Messenger channels; demos may use the website widget or test accounts |
| Constraint | Fixed academic deadline and a team of four |
| Constraint | LLM calls cost money; usage is capped per plan |
| Assumption | Merchants take payment on delivery or by bank transfer outside the system |
| Assumption | The merchant's primary device is a phone, so the UI must work at 375 px |
| Assumption | Primary UI language is French; AI conversation language follows the customer |

## 8. Risks (summary; full register in methodology)

| Risk | Mitigation |
|---|---|
| The AI invents a fact | Tool-grounded prompts, guardrail check before send, golden set in CI, approval mode by default |
| Cross-tenant data exposure | Every query scoped by `business_id`, tenancy tests, treated as Sev-1 |
| Meta approval delays | Website widget and playground as demo paths |
| LLM provider outage | Fallback models, then queue; humans can still reply |
| Scope creep | MoSCoW plus explicit out-of-scope list |
