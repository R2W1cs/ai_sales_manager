# Component, endpoint, and whole-app testing

**Owner:** Asma (testing of the whole application)  
**Accounts used:** seeded `asma@example.com` / `Password123!` (Admin), plus `demo@example.com` (Owner) for comparison  
**Companion:** [`../AI-Sales-Manager-Testing-Report.pdf`](../AI-Sales-Manager-Testing-Report.pdf), Playwright `apps/web/e2e/whole-app-asma.spec.ts`

This plan closes the course gaps called out as BL-X1 (unit / component), BL-X2 (endpoints), and BL-X3 (end-to-end / whole app). Wave plans W0–W10 remain the detailed checklists; this page is the cross-cutting matrix.

---

## 1. Component testing (BL-X1)

Components are tested next to the code. “Component” here means a Nest module / controller / service boundary or a web hook / UI unit — not a separate browser micro-suite.

| Area                         | Primary specs                                                              | What we assert                                      |
| ---------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| Auth / session / tenancy     | `tenant.guard.spec.ts`, `permissions.guard.spec.ts`, `w1-security.spec.ts` | Wrong tenant → deny; RBAC matrix holds              |
| Catalog / CSV / categories   | `products.controller.spec.ts`, `csv-import.controller.spec.ts`             | CRUD, import preview, tenant scope                  |
| Knowledge / rules / search   | `documents.controller.spec.ts`, `business-rules.controller.spec.ts`        | Indexing hooks, rule writes                         |
| Conversations / messages     | `conversations.controller.spec.ts`, `messages.controller.spec.ts`          | Thread list, send, read, notes                      |
| AI / guardrails / playground | `guardrails.spec.ts`, playground + orchestrator specs, golden eval         | No discount / refund / fake payment; grounded facts |
| Orders / customers           | `orders.controller.spec.ts`, merge / lifecycle specs                       | Draft → confirm, merge guardrails, erasure          |
| Channels / webhooks / media  | adapter specs, `webhooks.controller.spec.ts`, `media.service.spec.ts`      | Signature, dedupe, SSRF table                       |
| Notifications / analytics    | notifications + platform-series specs                                      | Dedupe keys, series shape                           |
| Shared contracts             | `packages/shared/src/**/*.spec.ts`                                         | Zod envelopes, phone, env, money                    |
| Web hooks / i18n             | `apps/web/src/**/*.spec.ts`                                                | Auth hook, realtime inbox, locale request           |

**Last recorded:** 1,452 API + 39 shared Jest tests passed (offline keys).

---

## 2. Endpoint testing (BL-X2)

Every route class is covered by controller specs and/or HTTP / W1 suites for success, validation, auth, and tenancy. Representative surface:

| Group             | Example endpoints                                                           | Auth / tenancy check                      |
| ----------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Health            | `GET /health`, `GET /health/live`, `GET /ready`                             | Public                                    |
| Auth              | `POST /api/v1/auth/login`, register, session, password reset                | Rate limit + credential paths             |
| Workspace         | businesses, onboarding, members, invitations, activation                    | Owner / admin permissions                 |
| Catalog           | products, categories, CSV import                                            | `catalog.write` / read scopes             |
| Knowledge         | documents, business-rules, search                                           | `knowledge.write` / `rules.write`         |
| Inbox             | conversations, messages, timeline, pipeline, notes, takeover, assign, close | `inbox.read` / `inbox.write`              |
| Orders            | draft, confirm, list, status patch                                          | `orders.write`; fiscal snapshot preserved |
| Customers         | get / patch, merge, erase / export                                          | merge & erase permissions                 |
| AI                | playground, agents, settings, prompts, feedback, traces                     | `ai.playground` / `ai.configure`          |
| Integrations      | Meta OAuth, channel accounts, webhooks                                      | Signature + business binding              |
| Analytics / notif | overview series, notification list / read                                   | `analytics.read`                          |
| Platform ops      | operator console routes                                                     | `platform_admin` only                     |

Negative / fuzz coverage: `w1-negative-fuzz.spec.ts`, `w1-throttling.spec.ts`, `w1-concurrency.spec.ts`, Fastify body-limit / adapter parity.

---

## 3. Whole-app testing with Asma’s account (BL-X3)

### 3.1 Seeded tester

| Field    | Value                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Name     | Asma Testing                                                                  |
| Email    | `asma@example.com`                                                            |
| Password | `Password123!`                                                                |
| Role     | Admin (business)                                                              |
| Purpose  | Whole-app defense walk and Playwright smoke under the testing owner’s account |

Created by `apps/api/prisma/seed.ts` with the Maison Alyssa demo workspace.

### 3.2 Manual defense walk (Asma)

Run after `docker compose up`, `pnpm db:seed`, `pnpm dev`:

1. Sign in at `/login` as `asma@example.com`.
2. Confirm shell loads: inbox, pipeline, catalog, orders, analytics, playground, settings.
3. Open a seeded handoff conversation; verify briefing and that AI is not speaking over the agent.
4. Open playground; ask a price question; confirm a grounded catalog answer (or approval queue).
5. Open orders pipeline; confirm a pending order is visible.
6. Sign out; confirm guest routes (`/login`) and that session cookies clear.
7. Optional: sign in as `demo@example.com` and confirm owner-only controls (billing / delete) stay hidden from Asma’s admin role.

### 3.3 Automated whole-app suite

```bash
pnpm test:e2e -- apps/web/e2e/whole-app-asma.spec.ts
```

The spec logs in as Asma (seed must be applied) and asserts the main merchant surfaces render. If the seed user is absent, the suite skips rather than failing CI on an empty database.

### 3.4 Related Playwright files

| Spec                     | Focus                                    |
| ------------------------ | ---------------------------------------- |
| `whole-app-asma.spec.ts` | Seeded Asma account, cross-surface smoke |
| `auth.spec.ts`           | Register / login / validation            |
| `core-journey.spec.ts`   | Onboarding → inbox journey               |
| `inbox.spec.ts`          | Three-pane command center                |
| `admin-flows.spec.ts`    | Admin settings / AI / channels           |

---

## 4. Ethics cross-check

Whole-app and endpoint runs are how we verify the claims in [`../../06-ethics/ethics-reflection.md`](../../06-ethics/ethics-reflection.md): no silent commercial promises, human handoff path reachable, and admin (Asma) cannot bypass owner-only destruction without permission checks.

---

## 5. Sign-off

| Role          | Name   | Decision                 |
| ------------- | ------ | ------------------------ |
| Testing owner | Asma   | Matrix maintained here   |
| Ethics owner  | Aymen  | Cross-check acknowledged |
| Backend       | Moataz | Endpoint list reviewed   |
| Frontend      | Aymen  | E2E selectors reviewed   |
