# 07. Architecture Decision Records

Each record states the context, the options considered, the decision, and the consequences, including the downsides. Status `Accepted` means the design assumes it; changing it requires a new record.

---

## ADR-001. Modular monolith, not microservices

**Context.** Four developers, a fixed deadline, about a dozen business domains, and one deployable product.

| Option | For | Against |
|---|---|---|
| Microservices | Independent scaling and deploys | Network failures between every call, distributed transactions for orders and stock, heavy DevOps for four people |
| Single unstructured app | Fastest to start | Domains tangle; impossible to test or split later |
| **Modular monolith** | One deploy, in-process calls, real transactions; clear module boundaries | Discipline needed to keep boundaries |

**Decision.** One NestJS application organised into modules that own their tables and expose services. An architecture test fails the build if a module imports another's internals or queries its tables.

**Consequences.** Order confirmation and stock decrement can share one database transaction. A module can be extracted into a service later because its boundary already exists. The cost is that boundary violations are caught by tests and review, not by the network.

---

## ADR-002. Webhook: persist, acknowledge, then enqueue

**Context.** Meta retries webhooks that do not return quickly. AI replies take seconds. A lost message is a lost sale.

**Decision.** The webhook handler verifies the signature, stores the raw event, enqueues a job and returns `200`. It never waits for the LLM. A sweep job re-processes events with `processed_at` empty.

**Consequences.** Acknowledgement stays under 500 ms; crashes cannot lose acknowledged messages. The price is that every downstream step must be idempotent.

**Rejected.** Processing inline (timeouts, duplicate retries); an outbox table (extra moving part; the raw event row already plays that role for the webhook path).

---

## ADR-003. Humans close the sale: no payments in Phase 1

**Context.** The riskiest failures are wrong prices, unauthorised discounts and mishandled payments. Many Tunisian shops take cash on delivery.

**Decision.** The AI collects order details and creates a `PENDING_CONFIRMATION` order. A person confirms. No payment gateway, no AI checkout.

**Consequences.** The product can ship before payment integrations and tests the real hypothesis (does handoff convert). The cost is one human step per order, which is the point of H2.

---

## ADR-004. Facts only through tools, verified by guardrails

**Context.** A language model asked about prices will produce plausible, wrong numbers.

**Decision.** The prompt contains **no** product facts. The model must call `search_products`, `check_inventory`, `get_policy`. A separate `Guardrails` step checks the final text against those tool results and the business rules before sending.

**Consequences.** Answers are grounded and auditable (every tool call is logged). Cost: extra model rounds, bounded by caps. A golden evaluation set runs in CI to catch regressions.

---

## ADR-005. Policy check before generation; handoff is code, not a prompt

**Context.** Refunds, complaints, legal topics and payment disputes must not be improvised.

**Decision.** A deterministic policy engine tests the 15 trigger conditions **before** the model generates. The purchase close (search, check, reserve, collect, re-check, create order, hand off) is orchestrated in code with the model only phrasing the questions.

**Consequences.** Behaviour on sensitive topics is predictable and testable without a model. Less flexibility in conversation flow, accepted for safety.

---

## ADR-006. One writer per state; transitions are tested tables

**Context.** Conversation status drives the inbox, the AI and the KPIs. Scattered `UPDATE status` statements would corrupt all three.

**Decision.** `ConversationService.transition` is the only code that writes `status`; `OrderService` for orders; `InventoryService` for stock. Allowed transitions are a table (see S1 to S3); unknown pairs return 409.

**Consequences.** The allowed table is directly the unit-test list. Every change is auditable through status events.

---

## ADR-007. Pooled multi-tenancy with defence in depth

**Context.** Roughly 100 small tenants; separate databases per tenant would be costly to run and migrate.

**Decision.** Shared database and deployment. Isolation by `business_id` on every table, composite foreign keys, a tenant-scoped database client, tenant-keyed realtime rooms, tenant-filtered vector queries, and an automated cross-tenant test suite.

**Consequences.** Cheap and simple operationally. Isolation depends on code correctness, so it is classed Sev-1 and gets its own tests. A tenant requiring physical isolation would need a later change.

---

## ADR-008. PostgreSQL with pgvector, Redis with BullMQ

**Context.** Need relational integrity, vector search, durable jobs and short-lived locks.

**Decision.** PostgreSQL stores relational data **and** embeddings (pgvector). Redis hosts BullMQ queues, conversation locks and realtime pub/sub.

**Consequences.** One fewer database to run than adding a dedicated vector store; adequate for 5,000 chunks per business under the 250 ms target. Redis data is treated as recoverable: webhooks persist to PostgreSQL first, so a Redis loss does not lose messages.

---

## ADR-009. Conversation lock for AI turns, database for stock correctness

**Context.** Two inbound messages arriving together could trigger two AI turns on one thread. Separately, two buyers must not take the last item.

**Decision.** A Redis lock (token, expiry, heartbeat, compare-and-delete release) serialises **AI turns per conversation**. It is **not** used for stock. Stock reservation is one atomic conditional database write.

**Consequences.** The lock can be lost without corrupting inventory. The worker re-checks the lock token before any side effect and aborts sends when stale.

---

## ADR-010. Provider-agnostic LLM layer with fallback

**Context.** Free tiers have quotas; providers fail; prices change.

**Decision.** Application code depends on an `LlmProvider` interface. Providers (Groq, OrcaRouter, Vercel AI Gateway) are tried in order with per-attempt timeouts. If all fail the thread escalates to a human.

**Consequences.** Switching or adding a vendor is configuration. Behaviour can differ slightly between models, so the golden set runs against the configured models.

---

## ADR-011. Reply modes default to approval

**Context.** Merchants will not let an unproven AI speak to customers unsupervised.

**Decision.** New businesses start in `approval_required`. Moving to `auto_send` is an explicit owner choice, and activation requires a successful test (gate G4).

**Consequences.** Slower first value, much higher trust. The share of businesses that graduate to `auto_send` becomes a direct measure of hypothesis H1.

---

## ADR-012. Realtime is an accelerator, REST is the truth

**Decision.** Socket events only tell the client something changed. After any reconnect the client refetches from the API.

**Consequences.** Missed events are self-healing; realtime code stays simple and can fail without data loss.

---

## ADR-013. Snapshots in orders

**Decision.** Order items copy name, SKU, attributes and price; the order copies customer details.

**Consequences.** Historical orders never change when the catalog does. Costs a little duplication.

---

## ADR-014. Four KPIs only

**Decision.** Ship exactly: messages handled (AI/human split), orders created, human handoffs by reason, conversion. Computed by a daily idempotent rollup.

**Consequences.** The dashboard is fast and unambiguous. Richer analytics are deliberately deferred; known imprecision (post-confirmation cancellations) is recorded rather than hidden.

---

## Decision summary

| ADR | Decision | Quality attribute served |
|---|---|---|
| 001 | Modular monolith | Modifiability, simplicity |
| 002 | Persist, ack, enqueue | Reliability, latency |
| 003 | Human closes sale | Safety |
| 004 | Tools plus guardrails | Correctness |
| 005 | Deterministic policy and purchase code | Safety, testability |
| 006 | One writer per state | Integrity |
| 007 | Pooled tenancy with layers | Security, cost |
| 008 | Postgres + pgvector, Redis | Simplicity |
| 009 | Lock for turns, DB for stock | Correctness |
| 010 | Provider-agnostic LLM | Availability, cost |
| 011 | Approval by default | Trust |
| 012 | Realtime as accelerator | Resilience |
| 013 | Order snapshots | Auditability |
| 014 | Four KPIs | Focus |
