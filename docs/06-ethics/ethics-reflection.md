# Ethics reflection — AI Sales Manager

**Owner:** Aymen (frontend and ethics)  
**Backlog item:** BL-X6 — AI usage log and ethics reflection  
**Course frames:** Chapter 5 Kantian ethics · Chapter 6 Virtue ethics (Ahmed Rebai, MUST)  
**Companion evidence:** [`../ai-usage-log.md`](../ai-usage-log.md), [`../04-testing/`](../04-testing/), guardrails in `apps/api/src/ai/guardrails/`

---

## 1. Why ethics is part of this product

AI Sales Manager speaks to real Tunisian shoppers on Instagram, Messenger, and a website widget. It can state a price, claim stock, suggest a delivery fee, or stay silent when a human should take over. Those acts are not neutral engineering choices. They shape trust between merchant and customer, and they expose the team to the same failure modes the course asked us to name: invented facts, treating people as instruments, and unexamined AI assistance.

This reflection does not invent a new moral theory. It applies the two frameworks taught in the course to the decisions already frozen in the MVP.

---

## 2. Kantian reading

### 2.1 Categorical vs hypothetical “oughts”

Kant distinguishes _hypothetical_ imperatives (“if you want more sales, then reply faster”) from _categorical_ ones (“you ought not to lie”). A sales bot is under constant pressure to optimise the hypothetical: convert, reduce staff time, keep the chat warm. The product’s design choice is to treat several duties as categorical inside the MVP:

| Maxim we refuse to universalise                         | Product rule                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| “State any plausible price if the catalog tool is slow” | Facts only via tools; ungrounded prices are blocked before send             |
| “Promise a discount to close the chat”                  | No discount / refund / payment promise without an approved business rule    |
| “Keep chatting when the buyer is angry or ready to pay” | Fifteen handoff triggers escalate to a human; AI does not close the payment |
| “Hide that a reply was machine-generated from staff”    | Staff inbox shows AI state, traces, and approval / auto-send modes          |

Kant’s first formula: act only on maxims you could will as universal law. If every shop’s bot invented stock and prices, no customer could trust any chat price. The maxim destroys the practice it relies on — the same structure as Kant’s false-promise example.

Kant’s second formula: treat humanity always as an end, never merely as a means. The end customer is not a conversion funnel. Escalation to a human, data minimisation (no card numbers or IDs in memory), and right-to-erasure paths treat the person as someone who may refuse the bot and reclaim their data. The merchant owner is also an end: default **approval-required** mode keeps them responsible for what leaves the shop’s name.

### 2.2 Absolute rules, with engineering honesty

Kant argued that lying is wrong under any circumstances. We do not claim the model never lies. We claim:

1. The **system** is forbidden to _send_ a reply that violates commercial and grounding rules.
2. When the model is uncertain or the topic is blocked, the **duty** is to escalate, not to improvise.
3. Tests treat commercial-safety violations as a hard gate (0% allowed on the golden set).

That is a categorical design for _dispatch_, not a metaphysical claim about the LLM’s inner states. Reason here is institutional: policy engine after generation, tenant isolation before data access, human confirmation before an order becomes real.

---

## 3. Virtue-ethics reading

Virtue ethics asks a different question: what traits of character make someone good? Socrates linked virtue to knowledge and the examined life; Aristotle emphasised practical wisdom (_phronesis_) and habits formed by practice.

### 3.1 Virtues we design for

| Actor            | Virtue we try to cultivate                         | How the product supports it                                      |
| ---------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Merchant owner   | Responsibility, temperance                         | Approval mode default; usage caps; playground before go-live     |
| Sales agent      | Courage to take over, honesty with the customer    | Handoff briefing, takeover / resume, no AI speaking over them    |
| End customer     | (Respect for their autonomy)                       | Human path, grounded answers, privacy of phone and address       |
| Development team | Intellectual honesty, justice between contributors | AI usage log, PR review, measured refactor report, test evidence |

Socrates: _virtue is knowledge_ — ignorance, not malice, is the usual root of harm. The golden set, guardrail unit tests, and Asma’s whole-app runs are how we refuse “we thought it was fine” ignorance. Aristotle: knowing the rule is not enough; practical wisdom is shown in _when_ to escalate. The handoff triggers encode that judgment so a tired model cannot “prefer the greater evil” of inventing a COD promise.

### 3.2 Vices we refuse to reward

- **Cleverness without honesty:** a witty Derja reply that invents a delivery fee.
- **Efficiency without respect:** auto-send everywhere to save staff minutes while customers cannot reach a human.
- **Unexamined AI labour:** accepting Cursor or LLM drafts into the repo without review or a log entry.

The ethics of the _build process_ matters as much as the ethics of the _bot_. Entry 001 in the AI usage log records drafts that still need human confirmation. That is the “examined life” applied to a Scrum team.

---

## 4. Tension and residual risk

| Tension                                     | Our stance in MVP                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Conversion vs truth                         | Truth wins; humans close the sale                                          |
| Universal rules vs cultural Derja tone      | Dialect is flexible; prices, stock, and discounts are not                  |
| Model fallibility vs categorical duty       | Duty attaches to the send path and to escalation, not to perfect cognition |
| Team speed vs honest attribution of AI help | Log + review required; unverifiable claims are a stakeholder risk (S12)    |

Open residual risks (tracked with methodology R1–R8): provider outage, Meta review delays, and soft golden-set misses on stock / intent. Ethics does not remove them; it forbids shipping a story that pretends they do not exist.

---

## 5. Link to testing (Asma)

Ethical claims that cannot be checked are rhetoric. Asma’s dossier verifies:

- **Component / unit:** guardrails, tenancy, RBAC, media SSRF.
- **Endpoints:** auth, tenancy, and validation behaviour on routes that touch PII or money-adjacent order state.
- **Whole application:** Playwright journeys and the seeded **Asma** account walk of inbox, catalog, orders, and playground.

See [`../04-testing/plans/COMPONENT_ENDPOINT_WHOLE_APP.md`](../04-testing/plans/COMPONENT_ENDPOINT_WHOLE_APP.md) and the testing PDF.

---

## 6. Sign-off

| Role              | Name   | Note                                         |
| ----------------- | ------ | -------------------------------------------- |
| Ethics owner      | Aymen  | Reflection authored for BL-X6                |
| Testing owner     | Asma   | Empirical checks of the claims above         |
| Product / docs    | Rayen  | Alignment with requirements and stakeholders |
| Backend / AI path | Moataz | Guardrails and orchestrator enforcement      |

This document should be updated when a new commercial capability (payments, automatic discounts, WhatsApp) would change the maxims we are willing to universalise.
