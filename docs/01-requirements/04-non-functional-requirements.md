# 04. Non-Functional Requirements

Every NFR has a measurable target and a verification method, so each one can be tested. **Verification:** `AT` automated test, `OB` observed in production-like monitoring, `MT` manual test, `RV` review or inspection.

## Performance

| ID | Requirement | Target | Verify |
|---|---|---|---|
| NFR-PERF-01 | Webhook acknowledgement latency | p95 < 500 ms, p99 < 1 s | AT (k6) |
| NFR-PERF-02 | Inbound message to first AI reply delivered | p95 < 30 s | OB |
| NFR-PERF-03 | Read API responses (lists, detail) | p95 < 300 ms at 100 concurrent users | AT (k6) |
| NFR-PERF-04 | Inbox first render with 50 conversations | < 2 s on a 3G-class connection | MT |
| NFR-PERF-05 | New inbound message visible in an open inbox | < 2 s after persist | AT |
| NFR-PERF-06 | Take-over confirmed server-side | < 500 ms | AT |
| NFR-PERF-07 | AI suggestion returned | < 5 s, with a visible pending state | OB |
| NFR-PERF-08 | Product search tool | p95 < 400 ms | AT |
| NFR-PERF-09 | CSV import of 1,000 rows | < 60 s | AT |

## Scalability

| ID | Requirement | Target | Verify |
|---|---|---|---|
| NFR-SCAL-01 | Concurrent tenants on the Phase 1 deployment | 100 businesses | AT (load) |
| NFR-SCAL-02 | Sustained inbound throughput | 20 messages/s aggregate | AT (load) |
| NFR-SCAL-03 | Catalog size per business | 10,000 variants with no query degradation | AT |
| NFR-SCAL-04 | Application tier is stateless; shared state lives in PostgreSQL, Redis or object storage | Scale by task count | RV |
| NFR-SCAL-05 | Job workers scale independently of the API process | Separate service, same image | RV |

## Reliability and availability

| ID | Requirement | Target | Verify |
|---|---|---|---|
| NFR-REL-01 | API and webhook availability | 99.5% monthly | OB |
| NFR-REL-02 | No acknowledged inbound message is lost | Zero tolerance; acknowledge only after durable persist | AT |
| NFR-REL-03 | Job retry policy | 3 attempts, exponential backoff, then dead-letter and alert | AT |
| NFR-REL-04 | Duplicate side effects from retries | Zero, enforced by idempotency keys on messages, orders and jobs | AT |
| NFR-REL-05 | Data loss window (RPO) | 5 minutes or less | RV |
| NFR-REL-06 | Recovery time (RTO) | 4 hours or less | RV |
| NFR-REL-07 | LLM provider outage | Fallback model, then queue; inbox keeps working; owner notified | AT |
| NFR-REL-08 | Meta API outage | Outbound queued; inbound acknowledged only after persist | AT |
| NFR-REL-09 | Tool execution failure | Customer told of uncertainty; escalate to human; failure logged | AT |

## Security and privacy

| ID | Requirement | Verify |
|---|---|---|
| NFR-SEC-01 | All traffic over TLS 1.2 or higher | RV |
| NFR-SEC-02 | Data encrypted at rest (database, object storage, backups) | RV |
| NFR-SEC-03 | Provider tokens and API keys in a managed secret store; never in source, committed env files or logs | RV |
| NFR-SEC-04 | Every tenant-scoped query is filtered by `business_id`; a cross-tenant access is a Sev-1 defect | AT |
| NFR-SEC-05 | Authorisation enforced server-side on every endpoint; hiding a button is not a control | AT |
| NFR-SEC-06 | Customer PII (phone, address) is redacted from logs and from model prompts when not needed | AT |
| NFR-SEC-07 | Webhook endpoints verify provider signatures before any processing | AT |
| NFR-SEC-08 | Dependency and container scanning in CI; critical findings block release | AT |
| NFR-SEC-09 | Rate limiting on authentication, public webhooks and per-tenant AI use | AT |
| NFR-SEC-10 | A business can request erasure of an end customer's personal data | AT |

## Internationalisation

| ID | Requirement | Verify |
|---|---|---|
| NFR-I18N-01 | The AI handles Tunisian Arabic, Modern Standard Arabic, Arabizi and French, including code-switching in one message | AT (golden set) |
| NFR-I18N-02 | Arabic renders right-to-left, including mixed-direction text and embedded Latin product names | MT |
| NFR-I18N-03 | All merchant-facing UI strings are externalised | RV |
| NFR-I18N-04 | Currency (DT), number and date formats follow business locale and timezone | AT |
| NFR-I18N-05 | Phone validation accepts Tunisian formats and is extensible to other MENA codes | AT |

## Usability and accessibility

| ID | Requirement | Verify |
|---|---|---|
| NFR-UX-01 | A non-technical merchant completes onboarding to AI activation in under 20 minutes with a ready CSV | MT (user test) |
| NFR-UX-02 | Inbox usable on mobile web at 375 px | MT |
| NFR-UX-03 | Destructive actions need confirmation and are reversible or audited | AT |
| NFR-UX-04 | Every error says what happened and what to do next | RV |
| NFR-UX-05 | WCAG 2.1 AA for contrast, focus and keyboard navigation on core flows | AT (axe), MT |
| NFR-UX-06 | Every list and empty state offers a next action | RV |
| NFR-UX-07 | The dashboard shows exactly four canonical KPIs | RV |

## Observability and operability

| ID | Requirement | Verify |
|---|---|---|
| NFR-OPS-01 | Structured JSON logs with a correlation id from webhook to job to outbound send | AT |
| NFR-OPS-02 | Metrics for queue depth, job failure rate, AI latency, tool success and provider errors | OB |
| NFR-OPS-03 | Alerts on dead-letter growth, signature failures, LLM error rate, database saturation | OB |
| NFR-OPS-04 | Health and readiness endpoints | AT |
| NFR-OPS-05 | Versioned, forward-only database migrations | RV |
| NFR-OPS-06 | The full stack starts locally with one Docker Compose command and seeded demo data | MT |

## Maintainability and cost

| ID | Requirement | Verify |
|---|---|---|
| NFR-MNT-01 | Module boundaries are enforced; cross-module database access fails review and an architecture test | AT |
| NFR-MNT-02 | Shared domain types are defined once and reused by API and frontend | RV |
| NFR-MNT-03 | Every state transition, guardrail and idempotency path has an automated test regardless of overall coverage | AT |
| NFR-MNT-04 | The AI golden set runs in CI on every prompt or model change and blocks merge on regression | AT |
| NFR-MNT-05 | Overall automated test coverage is 60% or more (course policy) | AT |
| NFR-COST-01 | Average AI cost per handled conversation is tracked per business | OB |
| NFR-COST-02 | Retrieval context size is bounded so one conversation cannot use unbounded tokens | AT |

## Quality attributes that drive the architecture

| Rank | Attribute | Because |
|---|---|---|
| 1 | **Correctness of AI output** (grounding) | One invented price breaks merchant trust |
| 2 | **Tenant isolation** | A data leak between shops ends the business |
| 3 | **Reliability / no lost messages** | A lost message is a lost sale |
| 4 | **Latency of the hot path** | Webhook must acknowledge in under a second even though AI takes seconds |
| 5 | **Modifiability** | Channels (WhatsApp) and payments arrive in later phases |
| 6 | **Cost control** | LLM calls are the main variable cost |
