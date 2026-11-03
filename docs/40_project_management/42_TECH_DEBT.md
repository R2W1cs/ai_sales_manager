# 42 — Tech Debt

| Field           | Value                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Document ID     | `42_TECH_DEBT`                                                                                         |
| Status          | Approved — canonical for **accepted** MVP shortcuts, their cost, trigger, and repayment                |
| Owner           | Engineering                                                                                            |
| Audience        | Engineers, founder, AI coding agents                                                                   |
| Depends on      | `00_PROJECT_OVERVIEW.md` §15.3, owning specs, `40_DECISIONS.md`, `41_ASSUMPTIONS.md`                   |
| Consumed by     | `43_CHANGELOG.md`, `T-OPS-07` launch review, Phase 2 planning                                          |
| Upstream source | Shortcuts already named in `01` §15, `12` §2.12, `14` §8, `17`, `18` §18, `13` search, `32` FS-KNOW-02 |

---

## 1. Purpose and scope

This document is **canonical for what we knowingly shipped weaker than we will want**. Every row has a **cost**, a **trigger** that forces repayment, and a **repayment** that does not invent a new product.

It is **not** the roadmap. WhatsApp, Shopify, payments, snooze, and a fifth KPI are `04_ROADMAP.md` / `03` §6 — they are exclusions, not debt.

**In scope:** `TD-*` id, shortcut, cost, trigger, repayment, home spec.

**Out of scope, and where it lives instead:**

| Topic                                 | Canonical location                               |
| ------------------------------------- | ------------------------------------------------ |
| Locked architecture (we _chose_ this) | `40_DECISIONS.md`                                |
| Working answers / Brain Dump gaps     | `41_ASSUMPTIONS.md`                              |
| Phase 2–5 features                    | `04_ROADMAP.md`                                  |
| Should FRs that may slip              | `30` §8, `03` §10.1                              |
| Empty `07` / `24`                     | Glossary `00` §14; screenshots when assets exist |

**Do not repay a `TD-*` by adding an endpoint, table, or `C-*` that is not already in `12`/`13`/`23`.** Repayment updates those files first (`00` §15.3).

---

## 2. How to add

1. Name the shortcut in the owning spec (as `01` did for KPI cancellation).
2. Add a `TD-*` row here (never reuse an id).
3. Changelog `43`.

Agents must not “just fix” a TD in a feature PR unless the trigger has fired or the founder asks. Quietly adding RLS, an outbox, or field encryption is a scope change.

---

## 3. Index

| ID       | Shortcut                                                                                                | Severity | Trigger                                                 |
| -------- | ------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| `TD-001` | Confirmed-then-cancelled orders stay in KPI numerator                                                   | Low      | Merchant disputes conversion                            |
| `TD-002` | Customer PII columns plaintext in Postgres                                                              | Med      | Compliance / enterprise demand (OQ-71)                  |
| `TD-003` | No automatic 24-month PII purge                                                                         | Med      | Legal before first paying customer (OQ-72)              |
| `TD-004` | Domain events best-effort; no `outbox_events`                                                           | Med      | Lost-enqueue incident sweep cannot cover (OQ-42)        |
| `TD-005` | Postgres RLS off                                                                                        | Med      | Sev-1 cross-tenant (ADR-005)                            |
| `TD-006` | No access-token denylist                                                                                | Low      | Stolen access JWT window (OQ-58)                        |
| `TD-007` | Inbox `q=` returns 501                                                                                  | Low      | FR-CONV-006 scheduled to ship                           |
| `TD-008` | Knowledge documents API-only (no settings `C-*`)                                                        | Med      | Owner cannot paste FAQs without API (FR-KNOW-011)       |
| `TD-009` | No audit-log page                                                                                       | Low      | FR-AUD-002 scheduled                                    |
| `TD-010` | `messages` unbounded hot storage                                                                        | Low      | Inbox query misses NFR latency (`12` §2.12)             |
| `TD-011` | Public task IPs, no NAT, single-AZ RDS, no proxy                                                        | Low      | Enterprise / security review (`18` §18)                 |
| `TD-012` | No Sentry / OpenTelemetry                                                                               | Low      | CloudWatch grouping too slow (OQ-53)                    |
| `TD-013` | `ai_actions` archive is “S3 or delete”                                                                  | Low      | 90-day disk / FR-OBS-009 if promoted to M               |
| `TD-014` | Recency inbox index not in day-one migration                                                            | Low      | A list query needs it (`12`)                            |
| `TD-015` | Two parallel tenancy models: Better Auth `organization` and `business_members`                          | **High** | Any new tenant-scoped surface, or an org-plugin upgrade |
| `TD-016` | `@nestjs/swagger`, `@nestjs/config`, `@nestjs/throttler`, `nestjs-zod` pinned in `11` but not installed | Medium   | Public API consumers needing OpenAPI                    |
| `TD-017` | Guards take `@Optional() prismaClient?: PrismaClient` behind an `import type`, so DI never injects it   | Low      | Any test or module that needs to substitute the client  |

---

## 4. Records

### TD-001 — KPI: cancel after confirm

|              |                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | `01` §15                                                                                                                                                   |
| **Shortcut** | An order cancelled **after** `CONFIRMED` stays in _orders created_ and in the conversion **numerator** for the original period. No retro-deduction in MVP. |
| **Cost**     | Conversion can look high if staff confirm then cancel.                                                                                                     |
| **Trigger**  | A design partner or founder treats the tile as financial truth.                                                                                            |
| **Repay**    | Define a cancellation adjustment in `01` §15, then `T-ANL-01` rollup. Do **not** add a fifth tile.                                                         |

### TD-002 — No field-level PII encryption

|              |                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Home**     | `17` OQ-71, `01` OQ-06                                                                                                |
| **Shortcut** | Messages, phones, addresses are plaintext in RDS. At-rest volume encryption + TLS + SM for **provider tokens** only.  |
| **Cost**     | A DB dump or compromised replica is full customer PII. Inbox search would break if we ciphered columns in MVP.        |
| **Trigger**  | Enterprise questionnaire or Tunisian/EU processing opinion that requires column cipher.                               |
| **Repay**    | App-level field encryption design in `17` + `12`, then migrate. Do not encrypt tokens twice (they are already in SM). |

### TD-003 — No timed PII purge

|              |                                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| **Home**     | `17` OQ-72, `00` OQ-04                                                          |
| **Shortcut** | Targeted erasure on request only. No 24-month sweeper.                          |
| **Cost**     | Retention is “until they ask.” Legal risk before paying customers.              |
| **Trigger**  | Founder/legal lock before first paying tenant (`41`).                           |
| **Repay**    | Timed purge job in `14` + policy in `17`. Do not invent a GDPR product surface. |

### TD-004 — No transactional outbox

|              |                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | `14` §8, `10` OQ-42                                                                                                                                              |
| **Shortcut** | Meta webhooks are durable (`integration_events`). Other domain events are in-process + BullMQ after commit. A crash can drop notify/realtime/score enqueue once. |
| **Cost**     | Rare missed notification or stale score until nightly sweep / refetch-on-open.                                                                                   |
| **Trigger**  | Observed lost-enqueue on a path the sweep cannot cover.                                                                                                          |
| **Repay**    | `outbox_events` in `12` + `14`. **Not** Kafka.                                                                                                                   |

### TD-005 — RLS off

|              |                                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| **Home**     | `17` OQ-70, `ADR-005`                                                               |
| **Shortcut** | Tenancy is application `WHERE business_id`. RLS is off.                             |
| **Cost**     | One missed filter is Sev-1 with no DB safety net.                                   |
| **Trigger**  | First cross-tenant Sev-1.                                                           |
| **Repay**    | RLS as **defence in depth**, never as the only control. App filter stays mandatory. |

### TD-006 — No access-token denylist

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Home**     | `17` OQ-58                                                                 |
| **Shortcut** | Membership + session revoke. Nuclear: rotate `BETTER_AUTH_SECRET`.         |
| **Cost**     | Stolen access token works until expiry.                                    |
| **Trigger**  | Incident requiring immediate access kill without rotating the secret.      |
| **Repay**    | `security_version` or denylist in `17`. Do not add a second auth provider. |

### TD-007 — Conversation search 501

|              |                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | `13` §6, FR-CONV-006 Should, `30` §8                                                                                                           |
| **Shortcut** | `q` on `GET /conversations` is **501** until `pg_trgm` on name/phone/content ships. Extension is in the first migration; the **query** is not. |
| **Cost**     | Operators cannot search threads.                                                                                                               |
| **Trigger**  | Scheduling FR-CONV-006.                                                                                                                        |
| **Repay**    | Implement the `13` `q` contract. Do not fake search in the client.                                                                             |

### TD-008 — Knowledge docs have no page

|              |                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| **Home**     | `32` FS-KNOW-02, FR-KNOW-011–014                                                                           |
| **Shortcut** | API + worker exist (`T-KNOW-02/03`). `22` settings tabs have no documents surface; `23` has no `C-*`.      |
| **Cost**     | Owners cannot paste FAQs in the product UI. G2 still uses **rules**, not docs.                             |
| **Trigger**  | First design partner needs FAQ paste, or launch-gate FR-KNOW-011 UI.                                       |
| **Repay**    | Add a `C-*` in `23` and a tab/flow in `22` **first**, then `T-WEB-*`. Do not invent a page in a random PR. |

### TD-009 — No audit-log UI

|              |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Home**     | FR-AUD-002 Should, `30` §8                                                                    |
| **Shortcut** | Writer ships (`T-BIZ-07`). No `/settings` audit tab in `22`.                                  |
| **Cost**     | Owner cannot browse the log in-app.                                                           |
| **Trigger**  | Scheduling FR-AUD-002.                                                                        |
| **Repay**    | `22` + `23` + `13` list route if missing. Do not mix `ai_actions` into the table (`ADR-007`). |

### TD-010 — Messages stay hot

|              |                                                                             |
| ------------ | --------------------------------------------------------------------------- |
| **Home**     | `12` §2.12                                                                  |
| **Shortcut** | `messages` are not partitioned or cold-stored in MVP. Inbox is the product. |
| **Cost**     | Large tenants may miss inbox NFRs.                                          |
| **Trigger**  | Message list/query p95 misses NFR at a real tenant size.                    |
| **Repay**    | Partition / cold store per `12` §2.12. Do not drop history.                 |

### TD-011 — MVP AWS posture

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Home**     | `18` §18, `ADR-024`                                                      |
| **Shortcut** | Public task IPs (egress), no NAT, single-AZ RDS, no RDS Proxy.           |
| **Cost**     | AZ failure takes RDS down; tasks have public IPs (still ALB-SG inbound). |
| **Trigger**  | Enterprise security review or AZ outage that matters.                    |
| **Repay**    | Follow `18` “not now” list. Still not Kubernetes.                        |

### TD-012 — No second APM

|              |                                                                             |
| ------------ | --------------------------------------------------------------------------- |
| **Home**     | `11` OQ-53                                                                  |
| **Shortcut** | CloudWatch + `prom-client` + Terminus only.                                 |
| **Cost**     | Error grouping is slow.                                                     |
| **Trigger**  | First production error-triage pain.                                         |
| **Repay**    | **One of** Sentry **or** OpenTelemetry — not both, not at bootstrap (`11`). |

### TD-013 — Action-log archive underspecified

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Home**     | `12` §2.12, FR-OBS-009 Should                                                                            |
| **Shortcut** | After 90 days: “archive to S3 **or** delete.” `sweep_retention` exists (`14`); S3 layout is not a table. |
| **Cost**     | Ops may delete traces of tool calls that compliance wanted kept.                                         |
| **Trigger**  | FR-OBS-009 promoted, or disk pressure.                                                                   |
| **Repay**    | Pick S3 prefix + job in `14`/`18`. Do not keep raw `ai_actions` forever in RDS.                          |

### TD-015 — Two tenancy models

|              |                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | `17` §4                                                                                                                                                                                                                                                                                                                                                                             |
| **Shortcut** | Better Auth's Organization plugin owns `organization` / `member` / `invitation` and `session.activeOrganizationId`, while `TenantGuard` and `PermissionsGuard` authorise against the separate `business_members` / `role` / `role_permissions` tables. `TenantGuard` bridges them by reading the session's active organisation and then verifying membership in `business_members`. |
| **Cost**     | Two sources of truth for "who belongs to what". A membership written through only one path is invisible to the other. Reviewers must know which one enforces access.                                                                                                                                                                                                                |
| **Trigger**  | Any new tenant-scoped surface, or a Better Auth organization-plugin upgrade.                                                                                                                                                                                                                                                                                                        |
| **Repay**    | Pick one model in `17` first. Isolation itself is intact — every tenant-owned query is scoped by a server-verified `business_id`; this is a maintainability and correctness-of-writes risk, not a live IDOR.                                                                                                                                                                        |

### TD-016 — Documented Nest packages not installed

|              |                                                                                                                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | `11` §5.1                                                                                                                                                                                                                                                                                                      |
| **Shortcut** | `11` §5.1 pins `@nestjs/swagger`, `@nestjs/config`, `@nestjs/terminus`, `@nestjs/throttler` and `nestjs-zod`. None are installed. Config is `@t3-oss/env-core` + Zod, validation is Zod inside services, rate limiting is the Redis `AuthThrottlerGuard`, and there is no OpenAPI document or `/health` route. |
| **Cost**     | `13` §1 promises generated OpenAPI; `18` expects `/health/live` and `/health/ready` for ALB checks. Both are unmet.                                                                                                                                                                                            |
| **Trigger**  | A public API consumer, or wiring real ALB health checks.                                                                                                                                                                                                                                                       |
| **Repay**    | Add per surface, smallest first: Terminus for health, then Swagger. Not adopted during the Fastify migration to keep the adapter swap reviewable.                                                                                                                                                              |

### TD-017 — Dead `PrismaClient` injection in guards

|              |                                                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | `10` §4                                                                                                                                                                                                                                                                                       |
| **Shortcut** | `TenantGuard` / `PermissionsGuard` declare `constructor(@Optional() prismaClient?: PrismaClient)` while importing the type with `import type`. The decorator metadata is erased, so Nest cannot resolve the token and the guards always fall back to the module singleton in `lib/prisma.ts`. |
| **Cost**     | `PlatformModule`'s `PrismaClient` provider is inert for guards. Tests must `jest.mock` the module instead of substituting a provider, which is less obvious.                                                                                                                                  |
| **Trigger**  | Any test or module that needs to substitute the client.                                                                                                                                                                                                                                       |
| **Repay**    | Use a value token (`@Inject(PRISMA)`) or a normal import, then delete the singleton fallback.                                                                                                                                                                                                 |

### TD-014 — Recency list index

|              |                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Home**     | `12` (changelog: recency inbox index deferred)                                                                    |
| **Shortcut** | Day-one indexes follow `12` as written (sales-priority paths). A recency-only index waits until a query needs it. |
| **Cost**     | A future recency filter might seq-scan.                                                                           |
| **Trigger**  | `EXPLAIN` on a shipped list query.                                                                                |
| **Repay**    | Add the index in `12` first, then migrate. Inbox sort remains sales-priority (`ADR-008`).                         |

---

## 5. Explicitly **not** debt

| Temptation                               | Home                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| WhatsApp connect, templates, 24h window  | `04` Phase 2, `ADR-009`                                 |
| Stripe / payment links                   | `04` Phase 4, `ADR-003`                                 |
| Shopify / Woo                            | `04` Phase 2                                            |
| Knowledge graph                          | `ADR-019`                                               |
| Fifth KPI, dark workspace, Employee cost | `01` §15, `20` OQ-74, `ADR-022`                         |
| MSW / Storybook / Radix                  | `ADR-017` — forbidden, not postponed                    |
| Untuned lead-score weights               | `41` OQ-15 — assumption, tune after 1,000 conversations |
| Unset `wk 1` date                        | `41` OQ-78                                              |

---

## 6. Launch-gate note

`03` §10.6 wants all 26 docs populated. Filling this file does **not** require repaying `TD-*` before launch. `T-OPS-07` reviews that each TD still has a trigger; it does not treat TD-001–014 as launch blockers unless the trigger has already fired.

---

## 7. References

- `docs/00_product/00_PROJECT_OVERVIEW.md` §15.3
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` §15 (TD-001)
- `docs/10_engineering/12_DATABASE_DESIGN.md` §2.12
- `docs/10_engineering/14_SYSTEM_DESIGN.md` §8
- `docs/10_engineering/17_SECURITY_DESIGN.md`
- `docs/10_engineering/18_DEPLOYMENT.md` §18
- `docs/40_project_management/40_DECISIONS.md`
- `docs/40_project_management/41_ASSUMPTIONS.md`
