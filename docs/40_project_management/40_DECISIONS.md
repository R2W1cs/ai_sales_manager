# 40 — Decisions

| Field           | Value                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `40_DECISIONS`                                                                                                                                        |
| Status          | Approved — canonical for architecture decision records (ADRs)                                                                                         |
| Owner           | Engineering / Founder                                                                                                                                 |
| Audience        | Engineers, product, AI coding agents                                                                                                                  |
| Depends on      | `00_PROJECT_OVERVIEW.md` §5, `docs/AI_Sales_Agent_Brain_Dump.md` → `# Final Decisions`                                                                |
| Consumed by     | `11_TECH_STACK.md` (stack/model changes), `43_CHANGELOG.md`, future ADRs                                                                              |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Final Decisions`, `# Integration Architecture` (Option C), plus decisions frozen in `00`/`10`–`18`/`20`–`23` |

---

## 1. Purpose and scope

This document is **canonical for what was decided, what was rejected, and where the full rationale lives**. It is an **index**, not a second architecture spec.

If a choice is not an `ADR-*` here, it is not a platform decision — it is either still an open question (`01`/`03`/`11` OQ-*) or an assumption (`41_ASSUMPTIONS.md`).

**In scope:** ADR id, one-line decision, rejected alternatives, canonical file, revisit trigger.

**Out of scope, and where it lives instead:**

| Topic                                     | Canonical location         |
| ----------------------------------------- | -------------------------- |
| Full module map, extraction path          | `10_ARCHITECTURE.md`       |
| Pins, versions, model ids, BFS rejections | `11_TECH_STACK.md`         |
| Tables, JSONB                             | `12_DATABASE_DESIGN.md`    |
| Routes, DTOs                              | `13_API_DESIGN.md`         |
| State machine, jobs, scoring              | `14_SYSTEM_DESIGN.md`      |
| Orchestrator internals                    | `15_AI_ARCHITECTURE.md`    |
| Meta adapters, HMAC                       | `16_INTEGRATION_DESIGN.md` |
| RBAC, secrets, tenancy enforcement        | `17_SECURITY_DESIGN.md`    |
| VPC, ECS sizing, no-NAT                   | `18_DEPLOYMENT.md`         |
| Tokens, type, colour                      | `20_DESIGN_SYSTEM.md`      |
| Brain Dump gaps (working answers)         | `41_ASSUMPTIONS.md`        |
| Known shortcuts                           | `42_TECH_DEBT.md`          |
| Chronology of doc edits                   | `43_CHANGELOG.md`          |

Do **not** copy `11` §2.1 pin tables into ADRs. A stack change is: new or amended ADR → update `11` → golden set if models changed.

---

## 2. How to add or change an ADR

1. Write or amend the `ADR-*` row here (never reuse an id; supersede instead).
2. Update the **canonical** document in the same change.
3. If it changes MVP scope, follow `03` §9 (`01` → `03` → `30` → `43`).
4. Append `43_CHANGELOG.md`.

Agents must not silently introduce a second ORM, queue, unofficial WhatsApp client, or unpinned model id (`11` §1).

**Conflict:** Brain Dump wins; record the discrepancy in `41_ASSUMPTIONS.md` (`00` §15.2). Downstream detail wins over this index; if they disagree, **fix this file**.

---

## 3. ID scheme

```
ADR-<NNN>
```

Numbers are zero-padded, never reused. Status is `Accepted` | `Superseded by ADR-…` | `Rejected`.

---

## 4. Index

| ID        | Decision                                                                      | Canonical                            | Status   |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------ | -------- |
| `ADR-001` | Grounding over generation                                                     | `00` §5.1, `05`                      | Accepted |
| `ADR-002` | Explicit conversation state machine                                           | `00` §5.2, `14`                      | Accepted |
| `ADR-003` | Human closes the sale; no payment provider in MVP                             | `00` §5.3, `06`, `03`                | Accepted |
| `ADR-004` | All fifteen `HUMAN_REQUIRED` triggers in MVP                                  | `00` §5.4, `06`                      | Accepted |
| `ADR-005` | Multi-tenant from line one; RLS **off**                                       | `00` §5.5, `17`                      | Accepted |
| `ADR-006` | Modular monolith, not microservices                                           | `00` §5.6, `10`                      | Accepted |
| `ADR-007` | AI observability is a product feature                                         | `00` §5.7, `15`                      | Accepted |
| `ADR-008` | Triage over transcript (sales command center)                                 | `00` §5.8, `22`                      | Accepted |
| `ADR-009` | Official Meta APIs only; WhatsApp Cloud API = Phase 2 (Option C)              | `00` §5.9, `16`                      | Accepted |
| `ADR-010` | Async at the channel boundary (persist, 200, then AI job)                     | `00` §5.10, `16`                     | Accepted |
| `ADR-011` | Context-rich, not clutter-rich                                                | `00` §5.11, `20`, `21`               | Accepted |
| `ADR-012` | HTTP API is REST `/api/v1`                                                    | `13`, Brain Dump `# Final Decisions` | Accepted |
| `ADR-013` | PostgreSQL 16 + pgvector; no second vector DB                                 | `11`, `12`                           | Accepted |
| `ADR-014` | Redis + BullMQ; Socket.IO + Redis adapter; REST remains SoT                   | `11`, `14`, `13` §14                 | Accepted |
| `ADR-015` | AWS ECS Fargate ×3 from day one; Compose locally                              | `18`                                 | Accepted |
| `ADR-016` | Nest 11 + Next 16 + Prisma 7 + pnpm; BFS pins in `11` §2.1                    | `11`                                 | Accepted |
| `ADR-017` | shadcn **Base UI** (not Radix); no Storybook / MSW / Zustand                  | `11`, `20`, `23`                     | Accepted |
| `ADR-018` | Exact model ids; golden set on any change                                     | `11` §9                              | Accepted |
| `ADR-019` | RAG in Postgres; knowledge graph is post-MVP                                  | `15`, Brain Dump `# Final Decisions` | Accepted |
| `ADR-020` | New businesses default `approval_required`; G4 does **not** flip `reply_mode` | `01` FR-AI-011, `22`                 | Accepted |
| `ADR-021` | Exactly four analytics KPIs; no fifth tile                                    | `01` §15                             | Accepted |
| `ADR-022` | `GET /usage` Owner-only; Employee has no playground                           | `13`, `17`, `23`                     | Accepted |
| `ADR-023` | Unofficial WhatsApp automation prohibited at every phase                      | `16`, FR-INT-032                     | Accepted |
| `ADR-024` | No NAT Gateway, no Kubernetes, no Vercel in MVP                               | `18`                                 | Accepted |
| `ADR-025` | Nest HTTP runs on the **Fastify** adapter (supersedes the Fastify reject)     | `11` §5.1, §5.3                      | Accepted |

---

## 5. Records

Each record is the decision and the rejects. Behaviour, pins, and diagrams stay in the canonical file.

### ADR-001 — Grounding over generation

|               |                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                                        |
| **Canonical** | `00` §5.1, `05_AI_BEHAVIOR_SPECIFICATION.md`                                                                                    |
| **Decision**  | Prices, stock, fees, discounts, and policies in outbound copy come from a tool result or `business_rules` **in the same turn**. |
| **Rejected**  | Parametric “the model knows fashion prices”; sending a degraded guess on tool failure                                           |
| **Revisit**   | Never for MVP. Phase 4 payments do not relax this.                                                                              |

### ADR-002 — Explicit state machine

|               |                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                          |
| **Canonical** | `14_SYSTEM_DESIGN.md`                                                                                             |
| **Decision**  | Conversation `status` is a code-executed machine. Handoff and takeover are transitions, not prompt improvisation. |
| **Rejected**  | “The LLM decides when to escalate”; status written from the UI                                                    |
| **Revisit**   | Adding a status requires `14` + `12` enum first.                                                                  |

### ADR-003 — Human closes the sale

|               |                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                   |
| **Canonical** | `06`, `03` §2 H2                                                                                           |
| **Decision**  | Purchase intent → pending order → `HUMAN_REQUIRED`. No PSP, payment links, or in-chat checkout in Phase 1. |
| **Rejected**  | Stripe/Flouci/Konnect in MVP; AI confirming payment                                                        |
| **Revisit**   | `04` Phase 4, or reordering trigger OQ-20 (conversion + loud demand).                                      |

### ADR-004 — Fifteen triggers

|               |                                                                                |
| ------------- | ------------------------------------------------------------------------------ |
| **Status**    | Accepted                                                                       |
| **Canonical** | `06_AI_HUMAN_HANDOFF_RULES.md`                                                 |
| **Decision**  | All fifteen `HUMAN_REQUIRED` triggers ship in MVP, with priority and briefing. |
| **Rejected**  | Shipping a subset “until we see which fire”; a 16th trigger invented in code   |
| **Revisit**   | New trigger = `06` first, then `30`.                                           |

### ADR-005 — Multi-tenant; RLS off

|               |                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                |
| **Canonical** | `17_SECURITY_DESIGN.md` (OQ-70)                                                                         |
| **Decision**  | `business_id` on every tenant table; application filter is the control. Postgres RLS is **off** in MVP. |
| **Rejected**  | Single-tenant now / multi-tenant later; RLS as the only control                                         |
| **Revisit**   | After a Sev-1 cross-tenant incident — RLS as defence in depth, never as the only control.               |

### ADR-006 — Modular monolith

|               |                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                       |
| **Canonical** | `10_ARCHITECTURE.md`                                                                           |
| **Decision**  | One NestJS deployable; modules talk via services and domain events, never each other’s tables. |
| **Rejected**  | Microservices in MVP; a single Nest module sharing entities                                    |
| **Revisit**   | Extraction path in `10` when a module’s scale or team boundary justifies it.                   |

### ADR-007 — AI observability is product

|               |                                                                                    |
| ------------- | ---------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                           |
| **Canonical** | `15_AI_ARCHITECTURE.md`                                                            |
| **Decision**  | `ai_actions`, traces, usage, feedback, evaluations, versioned prompts ship in MVP. |
| **Rejected**  | “We’ll add traces after launch”; mixing AI rows into `audit_logs`                  |
| **Revisit**   | Schema additions go through `12` + `15`.                                           |

### ADR-008 — Triage over transcript

|               |                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                        |
| **Canonical** | `22_UX_FLOWS.md`                                                                                                |
| **Decision**  | Operator UI is a sales command center: sales-priority inbox, four notification types, quiet when AI is working. |
| **Rejected**  | Recency-sorted chat client; notify on every AI reply; Clients / Commandes / Tableau de bord nav                 |
| **Revisit**   | H4 falsified (`03` §2) — still do not turn it into a CRM (`03` §8).                                             |

### ADR-009 — Official Meta APIs; Option C

|               |                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**    | Accepted                                                                                                                                                     |
| **Canonical** | `16_INTEGRATION_DESIGN.md`, Brain Dump `# Integration Architecture`                                                                                          |
| **Decision**  | MVP = Instagram Messaging + Messenger Platform, official APIs. WhatsApp Cloud API = Phase 2, same adapter layout. Stub + `whatsapp` enum + flag ship in MVP. |
| **Rejected**  | WhatsApp in Phase 1; Evolution Go / Baileys / any unofficial client at any phase (see `ADR-023`)                                                             |
| **Revisit**   | Phase 2 entry: `04` §5.4 (merchant demand or WhatsApp-first pipeline).                                                                                       |

### ADR-010 — Async channel boundary

|               |                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                       |
| **Canonical** | `16`, `14`                                                                                     |
| **Decision**  | Webhook: verify, persist, **200**, then BullMQ. Per-conversation Redis lock. Idempotency keys. |
| **Rejected**  | Running the orchestrator inside the webhook process; ack before durable persist                |
| **Revisit**   | Never for Meta inbound.                                                                        |

### ADR-011 — Context-rich, not clutter-rich

|               |                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                                                              |
| **Canonical** | `20_DESIGN_SYSTEM.md`, `21_BRAND_STRATEGY.md`                                                                                                         |
| **Decision**  | Western SaaS hierarchy + Tunisian/MENA trust cues; ~20% less visual noise than a dense dashboard; tokens live in `20`, not a `25_DESIGN_TOKENS` file. |
| **Rejected**  | Chat-app chrome; extra KPI tiles as decoration                                                                                                        |
| **Revisit**   | Visual assets → `24`; tokens still `20`.                                                                                                              |

### ADR-012 — REST `/api/v1`

|               |                                                                                     |
| ------------- | ----------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                            |
| **Canonical** | `13_API_DESIGN.md`                                                                  |
| **Decision**  | Public HTTP is REST under `/api/v1`. Socket.IO is an accelerator, not a second API. |
| **Rejected**  | GraphQL, tRPC, and gRPC as the merchant API                                         |
| **Revisit**   | Partner API is Phase 5 (`04`).                                                      |

### ADR-013 — PostgreSQL + pgvector

|               |                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                              |
| **Canonical** | `11` §6, `12`                                                                                         |
| **Decision**  | One Postgres 16 with pgvector. KNN is tenant-scoped `$queryRaw` in the owning module.                 |
| **Rejected**  | Pinecone, Qdrant, Chroma, Weaviate, Supabase-as-DB                                                    |
| **Revisit**   | NFR-PERF-06 miss after the Prisma 7 bootstrap gate (OQ-40) — still not a second DB without a new ADR. |

### ADR-014 — Redis, BullMQ, Socket.IO

|               |                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                                                       |
| **Canonical** | `11`, `14`, `13` §14                                                                                                                           |
| **Decision**  | Redis for cache, locks, BullMQ, and the Socket.IO adapter. List/thread remain refetchable over REST. Polling fallback when the socket is down. |
| **Rejected**  | SQS as the job bus; Supabase Realtime; inbox that exists only in push payloads                                                                 |
| **Revisit**   | Replica count > 1 already requires the Redis adapter (`18`).                                                                                   |

### ADR-015 — ECS Fargate from day one

|               |                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                       |
| **Canonical** | `18_DEPLOYMENT.md`                                                                             |
| **Decision**  | Three Fargate services (`frontend`, `backend`, `worker`). Compose locally. Same process split. |
| **Rejected**  | Kubernetes, VPS “then migrate”, Vercel/Amplify, a fourth Socket.IO service                     |
| **Revisit**   | Scale triggers in `18` — still not K8s for Phase 1.                                            |

### ADR-016 — BFS TypeScript pins

|               |                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                                        |
| **Canonical** | `11_TECH_STACK.md` §2.1                                                                                                         |
| **Decision**  | Nest 11, Next 16, React 19, Prisma 7, pnpm, Zod, Jest + Playwright. `none` means skip, not default.                             |
| **Rejected**  | The full reject lists in `11` §2.1 (Vitest, Clerk, Drizzle as a second ORM, …). The Fastify reject is **superseded by ADR-025** |
| **Revisit**   | Major bump or new BFS addon = this ADR amended + `11` + CI.                                                                     |

### ADR-017 — Operator UI kit

|               |                                                                                        |
| ------------- | -------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                               |
| **Canonical** | `11` §8, `20`, `23`                                                                    |
| **Decision**  | shadcn/ui on **Base UI** primitives. TanStack Query. Playwright on the core path only. |
| **Rejected**  | Radix, Storybook, MSW, Zustand, Redux, Vitest-for-UI                                   |
| **Revisit**   | Never to “unblock” frontend with mocks (`30` §4).                                      |

### ADR-018 — Pinned model ids

|               |                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                                                                                               |
| **Canonical** | `11` §9.3                                                                                                                                                                              |
| **Decision**  | Sales primary `gemini-3.5-flash`; fallback `gpt-5.6-terra` then `claude-sonnet-5`; classifier/summary `gpt-5.6-luna`; embeddings `text-embedding-3-small` (1536-d). Unpinned id → 400. |
| **Rejected**  | “Whatever Flash is this week”; a blog-post model in prod                                                                                                                               |
| **Revisit**   | Any id change: ADR + `11` + golden set (`15`).                                                                                                                                         |

### ADR-019 — RAG now; graph later

|               |                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                  |
| **Canonical** | `15`, Brain Dump `# Knowledge Graph & Context Optimization Strategy`                                      |
| **Decision**  | MVP retrieval is pgvector + business rules + tools. Knowledge graph / hybrid graph retrieval is post-MVP. |
| **Rejected**  | Graph DB in Phase 1                                                                                       |
| **Revisit**   | After 1,000 conversations if retrieval quality is the limiter — `04` / OQ on graph.                       |

### ADR-020 — Default draft-to-approve; G4 does not flip mode

|               |                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                                                                        |
| **Canonical** | `01` FR-AI-011, `22` §4.6                                                                                                                                       |
| **Decision**  | New businesses `reply_mode = approval_required`. Completing G4 unblocks **live** AI; it does **not** PATCH `replyMode`. Owner opts into `auto_send` explicitly. |
| **Rejected**  | Playground success silently enabling `auto_send`                                                                                                                |
| **Revisit**   | OQ-07 `draft_only` is Should; may omit the radio (`23`).                                                                                                        |

### ADR-021 — Four KPIs

|               |                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**    | Accepted                                                                                                                                   |
| **Canonical** | `01` §15                                                                                                                                   |
| **Decision**  | Dashboard ships messages handled (with AI/human breakdown), orders created, human handoffs by reason, conversion. Rollups, not live scans. |
| **Rejected**  | Revenue, CSAT, cost, or latency as a fifth tile                                                                                            |
| **Revisit**   | `feature_flags.advanced_analytics` (Phase 4-shaped).                                                                                       |

### ADR-022 — Usage and playground RBAC

|               |                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                                                                                                             |
| **Canonical** | `13`, `17`, `23`                                                                                                                                                     |
| **Decision**  | `GET /usage` and cost captions are Owner (`usage.read`). Employee cannot call playground or traces (`ai.playground` / `ai.traces.read` 403). UI hiding is not authZ. |
| **Rejected**  | Admin polling `/usage`; Employee `DecisionInspector`                                                                                                                 |
| **Revisit**   | OQ-08 (Employee cost) stays No for MVP.                                                                                                                              |

### ADR-023 — No unofficial WhatsApp

|               |                                                                                 |
| ------------- | ------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                        |
| **Canonical** | `16`, FR-INT-032                                                                |
| **Decision**  | Unofficial WhatsApp automation is prohibited in the codebase at every phase.    |
| **Rejected**  | Evolution, Baileys, multi-device reverse-engineered clients, “just for staging” |
| **Revisit**   | Never. Aggregator BSPs only if `04` OQ-29 reopens.                              |

### ADR-024 — No NAT, no K8s, no Vercel

|               |                                                                                     |
| ------------- | ----------------------------------------------------------------------------------- |
| **Status**    | Accepted                                                                            |
| **Canonical** | `18` §15                                                                            |
| **Decision**  | Public task IPs, Cloudflare → ALB, no NAT Gateway, no Kubernetes, no Vercel in MVP. |
| **Rejected**  | NAT for “security theatre”; sticky ALB; migrate-on-boot                             |
| **Revisit**   | Enterprise / security review — listed as post-MVP in `18`, not launch work.         |

### ADR-025 — Fastify adapter

|               |                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted — supersedes the "Fastify in MVP" reject in ADR-016 / `11` §2.1                                                                                                                                                                            |
| **Canonical** | `11_TECH_STACK.md` §5.1 and §5.3                                                                                                                                                                                                                    |
| **Decision**  | Nest HTTP runs on `@nestjs/platform-fastify` (`FastifyAdapter` + `NestFastifyApplication`). The adapter is constructed in one place, `apps/api/src/bootstrap.ts`.                                                                                   |
| **Why now**   | The original reject cited "a second adapter, a second file-upload story". Neither applies: uploads are S3 presigned `PUT` plus CSV-in-JSON, so no multipart parser exists to port, and Socket.IO attaches to Fastify's raw `http.Server` unchanged. |
| **Rejected**  | Staying on Express; a community Nest↔Better Auth wrapper (an in-repo ~40-line Fastify adapter is smaller, tested, and not coupled to two release cadences)                                                                                          |
| **Revisit**   | If a true multipart upload surface, a Fastify-incompatible Nest plugin, or a measured regression appears. Rollback path is in `42_TECH_DEBT.md`.                                                                                                    |

---

## 6. Open questions that are **not** ADRs

OQ-* working answers live on the owning spec (`01`, `03`, `11`, `17`, `31`). Promoting an OQ to an ADR happens when the founder locks it and the canonical doc is updated — not by copying the working answer here.

Examples still OQ, not ADR: OQ-02 billing currency vs chrome `DT`; OQ-78 `wk 1` anchor date; OQ-79 team size.

---

## 7. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Final Decisions`, `# Integration Architecture`
- `docs/00_product/00_PROJECT_OVERVIEW.md` §5, §15.3
- `docs/10_engineering/11_TECH_STACK.md` — pin changes require an ADR
- `docs/40_project_management/41_ASSUMPTIONS.md`
- `docs/40_project_management/42_TECH_DEBT.md`
- `docs/40_project_management/43_CHANGELOG.md`
