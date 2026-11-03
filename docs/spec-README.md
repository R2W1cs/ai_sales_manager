# AI Sales Agent — Documentation

How to run the app, sign in, and talk to the model is in the root [`README.md`](../README.md).

The measured refactor is in [`../refactoring-optimization/`](../refactoring-optimization/README.md). The testing record is in [`../testing/`](../testing/README.md).

## Source of truth

All product behaviour and engineering architecture are defined in the canonical numbered specifications under `docs/`. The **live coding board** is [`../backlog/`](../backlog/) — not this folder.

When coding, open [`../backlog/CURSOR.md`](../backlog/CURSOR.md).

## Layout

| Folder                  | Role                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `00_product`            | What and why                                                                            |
| `10_engineering`        | How (systems, data, APIs, AI, integrations, security, deployment)                       |
| `20_design`             | Experience and visuals                                                                  |
| `30_execution`          | Parent `T-*` catalog, calendar, feature join (live board: [`../backlog/`](../backlog/)) |
| `40_project_management` | Decisions, assumptions, tech debt, changelog                                            |

## File map

```
docs/
├── README.md
│
├── 00_product/
│   ├── 00_PROJECT_OVERVIEW.md
│   ├── 01_PRODUCT_REQUIREMENTS.md
│   ├── 02_USER_STORIES.md
│   ├── 03_MVP_SCOPE.md
│   ├── 04_ROADMAP.md
│   ├── 05_AI_BEHAVIOR_SPECIFICATION.md   ← AI personality, tools, memory, guardrails
│   ├── 06_AI_HUMAN_HANDOFF_RULES.md      ← HUMAN_REQUIRED triggers, priorities, briefing
│   └── 07_DOMAIN_MODEL.md                ← ubiquitous language (export pending)
│
├── 10_engineering/
│   ├── 10_ARCHITECTURE.md
│   ├── 11_TECH_STACK.md
│   ├── 12_DATABASE_DESIGN.md
│   ├── 13_API_DESIGN.md
│   ├── 14_SYSTEM_DESIGN.md
│   ├── 15_AI_ARCHITECTURE.md             ← orchestrator, RAG, prompts, evaluation
│   ├── 16_INTEGRATION_DESIGN.md          ← Meta adapters, webhooks, retries
│   ├── 17_SECURITY_DESIGN.md             ← auth, tenancy, encryption, secrets
│   └── 18_DEPLOYMENT.md                  ← ECS, VPC, CI/CD, sizing, ops
│
├── 20_design/
│   ├── 20_DESIGN_SYSTEM.md
│   ├── 21_BRAND_STRATEGY.md
│   ├── 22_UX_FLOWS.md
│   ├── 23_UI_COMPONENTS.md               ← panes, cards, badges, controls
│   └── 24_REFERENCE_SCREENS.md           ← visual benchmarks (export pending)
│
├── 30_execution/
│   ├── 30_TASKS.md                       ← parent T-* + FR map (live board: ../backlog/)
│   ├── 31_IMPLEMENTATION_PLAN.md         ← milestones, capacity, launch date
│   └── 32_FEATURE_SPECIFICATIONS.md      ← Phase 1 feature join
│
└── 40_project_management/
    ├── 40_DECISIONS.md                   ← ADR index
    ├── 41_ASSUMPTIONS.md                 ← OQ index + conflict winners
    ├── 42_TECH_DEBT.md                   ← accepted MVP shortcuts
    └── 43_CHANGELOG.md
```

## Brain dump → doc hints

| Export target                     | Primary sections in brain dump                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `05_AI_BEHAVIOR_SPECIFICATION.md` | AI Agent, AI Decision Engine, Memory, Recommendation Engine, restrictions                                                 |
| `06_AI_HUMAN_HANDOFF_RULES.md`    | Human Required State Rules, AI Sales Handoff                                                                              |
| `13_API_DESIGN.md`                | API Specification, plus Must FRs not listed there                                                                         |
| `14_SYSTEM_DESIGN.md`             | Conversation State Machine, Event Architecture, Background Jobs, Rate Limiting, Failure Scenarios, lead scoring           |
| `15_AI_ARCHITECTURE.md`           | AI Orchestrator, AI Architecture, prompts, feedback, traces, cost                                                         |
| `16_INTEGRATION_DESIGN.md`        | Integration Architecture, Event Architecture                                                                              |
| `17_SECURITY_DESIGN.md`           | Security, User Permission Matrix, Rate Limiting                                                                           |
| `18_DEPLOYMENT.md`                | Infrastructure, ECS, VPC, CI/CD                                                                                           |
| `20_DESIGN_SYSTEM.md`             | UX/UI Design Direction — tokens, type, colour, RTL, shadcn pins                                                           |
| `21_BRAND_STRATEGY.md`            | Product Vision, Positioning, Dual-Voice Architecture, Trust Signals                                                       |
| `22_UX_FLOWS.md`                  | Sales Command Center (Inbox UX), onboarding screens, 3-pane mechanics, pipeline                                           |
| `23_UI_COMPONENTS.md`             | Sales Command Center — component inventory, props, states                                                                 |
| `07_DOMAIN_MODEL.md`              | Ubiquitous language / entity relationships (export pending; glossary today: `00` §14, columns: `12`)                      |
| `24_REFERENCE_SCREENS.md`         | Screenshot / visual benchmarks (export pending; add when assets exist)                                                    |
| `30_TASKS.md`                     | `# MVP`, `# Final Decisions` — Phase 1 parent `T-*` catalog, waves, FR coverage. **Execute in [`backlog/`](../backlog/)** |
| `31_IMPLEMENTATION_PLAN.md`       | `# MVP`, `# Roadmap` — milestones `M0`–`M9`, capacity model, critical path, buffer                                        |
| `32_FEATURE_SPECIFICATIONS.md`    | `# MVP` — `FS-*` join: problem → FR/US/`T-*`/routes/`C-*`                                                                 |
| `40_DECISIONS.md`                 | `# Final Decisions`, `# Integration Architecture` — ADR index                                                             |
| `41_ASSUMPTIONS.md`               | Brain Dump gaps — OQ working answers, conflict winners                                                                    |
| `42_TECH_DEBT.md`                 | Accepted MVP shortcuts — cost, trigger, repayment                                                                         |
