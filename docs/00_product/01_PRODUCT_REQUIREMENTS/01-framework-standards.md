# 01 — Product Requirements

| Field           | Value                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `01_PRODUCT_REQUIREMENTS`                                                                                                                |
| Status          | Approved (MVP baseline)                                                                                                                  |
| Owner           | Product                                                                                                                                  |
| Audience        | Engineering, design, QA, AI coding agents                                                                                                |
| Depends on      | `00_PROJECT_OVERVIEW.md`                                                                                                                 |
| Consumed by     | `02_USER_STORIES.md`, `03_MVP_SCOPE.md`, `30_execution/30_TASKS.md`, `30_execution/32_FEATURE_SPECIFICATIONS.md`, all `10_engineering/*` |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` (authoritative)                                                                                      |

---

# AI Sales Agent Documentation Architect Prompt

## Role

You are a senior:

- Product Manager
- Software Architect
- AI Systems Architect
- Backend Engineer
- UX Designer
- Technical Writer

Your responsibility is to transform the project context into a complete production-grade documentation system.

You are documenting a real SaaS product that will later be built by developers and AI coding agents.

The quality of these documents directly affects implementation quality.

---

# Primary Source of Truth

Your main context source is:

`docs/AI_Sales_Agent_Brain_Dump.md`

You MUST read and understand this file before generating any documentation.

This file contains:

- Product vision
- MVP decisions
- AI behavior rules
- Human handoff logic
- Database decisions
- Architecture decisions
- API decisions
- Business rules
- Roadmap decisions

Treat it as the highest authority.

Do NOT contradict it.

If another assumption conflicts with it:

- Follow the Founder Brain Dump.
- Mention the conflict in the generated document's "Open Questions" section.

---

# Documentation Generation Rules

You will generate documentation files ONE BY ONE.

Never generate multiple files in one response.

The workflow:

1. Generate the first file.
2. Wait for the user to say:

"next"

3. Generate the next file.
4. Continue until all files are completed.

---

# Documentation Order

Generate files in this exact order:

## Product Documentation

1.

docs/00_product/00_PROJECT_OVERVIEW.md

2.

docs/00_product/01_PRODUCT_REQUIREMENTS.md

3.

docs/00_product/02_USER_STORIES.md

4.

docs/00_product/03_MVP_SCOPE.md

5.

docs/00_product/04_ROADMAP.md

6.

docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md

7.

docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md

8.

docs/00_product/07_DOMAIN_MODEL.md

---

## Engineering Documentation

9.

docs/10_engineering/10_ARCHITECTURE.md

10.

docs/10_engineering/11_TECH_STACK.md

11.

docs/10_engineering/12_DATABASE_DESIGN.md

12.

docs/10_engineering/13_API_DESIGN.md

13.

docs/10_engineering/14_SYSTEM_DESIGN.md

14.

docs/10_engineering/15_AI_ARCHITECTURE.md

15.

docs/10_engineering/16_INTEGRATION_DESIGN.md

16.

docs/10_engineering/17_SECURITY_DESIGN.md

---

## Design Documentation

17.

docs/20_design/20_DESIGN_SYSTEM.md

18.

docs/20_design/21_BRAND_STRATEGY.md

19.

docs/20_design/22_UX_FLOWS.md

20.

docs/20_design/23_UI_COMPONENTS.md

21.

docs/20_design/24_REFERENCE_SCREENS.md

---

## Execution Documentation

22.

docs/30_execution/30_TASKS.md

23.

docs/30_execution/31_IMPLEMENTATION_PLAN.md

24.

docs/30_execution/32_FEATURE_SPECIFICATIONS.md

---

## Project Management Documentation

25.

docs/40_project_management/40_DECISIONS.md

26.

docs/40_project_management/41_ASSUMPTIONS.md

27.

docs/40_project_management/42_TECH_DEBT.md

28.

docs/40_project_management/43_CHANGELOG.md

---

# Documentation Quality Requirements

Every document must be:

- Extremely detailed
- Clear
- Implementation-ready
- Written for future developers and AI coding agents
- Based on industry best practices
- Consistent with all previous documents

Do not write shallow summaries.

The documents are not presentations.

They are engineering artifacts.

---

# When Information Is Missing

If the Founder Brain Dump does not specify something:

Follow this priority:

1. Industry best practices
2. Proven SaaS architecture patterns
3. Scalable engineering decisions
4. Simplicity suitable for MVP

Use your own reasoning.

Do NOT leave important sections empty.

Instead:

Make the best decision.

Document:

- The decision
- Why it was chosen
- Alternatives considered
- Future migration path

Example:

Decision:
Use PostgreSQL + pgvector.

Reason:
Keeps relational data and embeddings together.

Alternative:
Dedicated vector database.

Rejected because:
Adds unnecessary complexity for MVP.

---

# Technical Standards

Always optimize for:

## Architecture

- Modular monolith first
- Clear module boundaries
- Future scalability
- Maintainability
- Separation of concerns

## Backend

Use:

- TypeScript
- NestJS
- REST APIs
- PostgreSQL
- Redis
- BullMQ
- Docker

## AI System

Always consider:

- RAG
- Tool calling
- Memory
- Guardrails
- Evaluation
- Prompt versioning
- Cost tracking
- Observability

## Database

For every table include:

- Purpose
- Fields
- Data types
- Constraints
- Indexes
- Relationships
- Example records
- Future considerations

## APIs

For every endpoint include:

- Purpose
- Authentication
- Permissions
- Request format
- Response format
- Validation
- Errors
- Edge cases

## Features

For every feature include:

- Problem
- Goal
- User story
- User flow
- Backend logic
- Database impact
- API impact
- UI impact
- Edge cases
- Acceptance criteria

---

# Writing Style

Use:

- Markdown
- Clear headings
- Tables when useful
- Mermaid diagrams when architecture flows are explained
- Code blocks for schemas and examples

Avoid:

- Marketing language
- Generic explanations
- Empty filler
- Repeating the same information in multiple places

---

# Single Source of Truth Rule

Avoid duplication.

If a concept already belongs to another document:

Reference it.

Example:

Bad:

Repeating AI handoff rules in:

- Product requirements
- Architecture
- System design

Good:

"See docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md"

Each important concept has ONE canonical location.

---

# Before Writing Each Document

Internally verify:

1. What is the purpose of this document?
2. Who will use it?
3. What decisions must it contain?
4. What previous documents does it depend on?
5. What future documents depend on it?

---

# Final Rule

Do not ask unnecessary clarification questions.

Make professional assumptions.

Your goal is to create documentation that allows another AI coding agent to build this entire SaaS product correctly.

Start now with:

`docs/00_product/00_PROJECT_OVERVIEW.md`

---

## 1. Purpose and scope

This document is the **canonical register of what the system must do and how well it must do it**. It defines:

- Every functional requirement (FR), uniquely identified and traceable
- Every non-functional requirement (NFR) with a measurable target
- Two definitions that are canonical _here_ and referenced everywhere else:
  - **AI activation gates** (§14)
  - **MVP analytics KPI definitions** (§15)

It does **not** define implementation. Schemas live in `12_DATABASE_DESIGN.md`, endpoints in `13_API_DESIGN.md`, AI decision rules in `05_AI_BEHAVIOR_SPECIFICATION.md`, escalation rules in `06_AI_HUMAN_HANDOFF_RULES.md`. Where a requirement needs detail beyond "what", it links.

---

## 2. How to read this document

### 2.1 Requirement ID scheme

```
FR-<AREA>-<NNN>     Functional requirement
NFR-<CATEGORY>-<NN> Non-functional requirement
```

IDs are **permanent**. A removed requirement is marked `Dropped`, never deleted or renumbered — downstream tasks, tests, and specs cite these IDs.

### 2.2 Areas

| Area code | Domain                                               |
| --------- | ---------------------------------------------------- |
| `AUTH`    | Authentication, sessions, identity                   |
| `BIZ`     | Business workspace, members, roles, onboarding       |
| `CAT`     | Product catalog, variants, images, import            |
| `KNOW`    | Knowledge base, business rules                       |
| `INT`     | Channel integrations (Meta)                          |
| `CONV`    | Conversations, inbox, human control                  |
| `AI`      | Agent configuration, behaviour, prompts, reply modes |
| `HAND`    | Human handoff and purchase handoff                   |
| `ORD`     | Orders, order items, stock reservations              |
| `CUST`    | Customers, identities, lifecycle                     |
| `NOTIF`   | Notifications                                        |
| `ANL`     | Analytics                                            |
| `BILL`    | Plans, subscriptions, usage, limits                  |
| `OBS`     | AI observability: actions, traces, usage, feedback   |
| `FLAG`    | Feature flags                                        |
| `LEAD`    | Lead scoring and sales-priority triage               |
| `RT`      | Realtime delivery to the operator UI                 |
| `AUD`     | Audit logging and compliance surfaces                |

### 2.3 Priority (MoSCoW, scoped to Phase 1)

| Priority                   | Meaning                                                                       |
| -------------------------- | ----------------------------------------------------------------------------- |
| **M** — Must               | MVP does not ship without it. Blocks launch.                                  |
| **S** — Should             | Strongly desired in Phase 1; may slip one milestone without blocking launch.  |
| **C** — Could              | Build only if capacity remains.                                               |
| **W** — Won't (this phase) | Explicitly deferred; listed so nobody re-litigates it. See `03_MVP_SCOPE.md`. |

### 2.4 Verification method

| Code | Method                                                                     |
| ---- | -------------------------------------------------------------------------- |
| `AT` | Automated test (unit / integration / e2e)                                  |
| `MT` | Manual test script executed by QA                                          |
| `EV` | AI evaluation harness (golden set, sampling) — see `15_AI_ARCHITECTURE.md` |
| `OB` | Verified by production observability (metric or log assertion)             |
| `IN` | Inspection / code review against this spec                                 |

---

## 3. Actors

| Actor                 | Authenticated  | Description                                                                                                       | Permission source                 |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Owner**             | Yes            | Created the business. Full control including billing and deletion.                                                | `17_SECURITY_DESIGN.md`           |
| **Admin**             | Yes            | Operates the business: products, rules, AI config, integrations, staff. Cannot delete business or manage billing. | `17_SECURITY_DESIGN.md`           |
| **Employee**          | Yes            | Works the inbox: reads, replies, takes over, creates/edits orders. Read-only analytics.                           | `17_SECURITY_DESIGN.md`           |
| **End customer**      | No             | Shopper in an Instagram or Messenger thread (WhatsApp in Phase 2). Interacts only through messages.               | n/a                               |
| **AI Agent**          | System         | Autonomous actor operating under `ai_enabled`, reply mode, and guardrails.                                        | `05_AI_BEHAVIOR_SPECIFICATION.md` |
| **Channel provider**  | System         | Meta platform delivering webhooks and accepting outbound sends.                                                   | `16_INTEGRATION_DESIGN.md`        |
| **Platform operator** | Yes (internal) | Our own team: platform prompts, platform feature flags, support.                                                  | `17_SECURITY_DESIGN.md`           |

The canonical permission matrix (who may do what) lives in `docs/10_engineering/17_SECURITY_DESIGN.md`. Requirements below reference roles but do not restate the matrix.

---
