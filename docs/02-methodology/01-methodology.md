# Development Methodology

**Chosen approach: Scrum with 2-week sprints**, supported by a Kanban-style board for visualising flow.

## 1. Why Scrum

| Factor | Our situation | Effect on the choice |
|---|---|---|
| Team size | Four people with distinct specialities | Small enough for Scrum's lightweight roles |
| Deadline | Fixed academic submission date | Time-boxed sprints expose slippage early |
| Requirements | Mostly known up front, with a few unknowns (AI behaviour, Meta approval) | Backlog is stable but reprioritised each sprint as AI results come in |
| Risk | AI quality, tenant isolation, third-party approval | Frequent increments and reviews catch risk early |
| Delivery | A working demo at the end, no live traffic | Continuous flow (pure Kanban) is not needed |

**Alternatives considered**

| Option | Verdict |
|---|---|
| Waterfall | Rejected. AI behaviour cannot be fully specified up front; we need feedback from working increments |
| Pure Kanban | Rejected. No stream of unplanned work, and the team benefits from regular planning and review |
| XP | Partly adopted: pair review, continuous integration, test-first for state machines and guardrails |

## 2. Roles

| Scrum role | Who | Notes |
|---|---|---|
| Product Owner | Rayen | Owns the backlog order and acceptance criteria |
| Scrum Master | Rotating each sprint | Runs ceremonies, removes blockers |
| Development team | Rayen, Aymen, Moataz, Asma | Cross-functional; each has a lead area |

| Member | Lead area |
|---|---|
| Rayen | Requirements, methodology, design and architecture |
| Aymen | Frontend and ethics |
| Moataz | Backend, optimization and refactoring |
| Asma | Testing across the whole application |

Lead means accountable, not exclusive. Anyone may contribute anywhere, always through a pull request reviewed by someone else.

## 3. Cadence

| Ceremony | When | Duration | Output |
|---|---|---|---|
| Sprint planning | Day 1 | 1 h | Sprint goal, items pulled from the backlog |
| Daily sync | Daily, async in chat is fine | 10 min | Progress and blockers |
| Backlog refinement | Mid-sprint | 45 min | Items split to L or smaller, acceptance criteria written |
| Sprint review | Last day | 45 min | Demo of the working increment |
| Retrospective | After the review | 30 min | One to three concrete actions, logged below |

## 4. Sprint plan (six sprints)

Dates are filled in by the team when the course calendar is fixed. Sprint contents follow the dependency order in the [backlog](../01-requirements/03-product-backlog.md).

| Sprint | Goal | Backlog items | Exit demo |
|---|---|---|---|
| 0 | Requirements, methodology and design accepted | Phase documents | Review of documents |
| 1 | Foundation | BL-01..06 | Register, create workspace, tenant-isolation tests pass in CI |
| 2 | Catalog and knowledge | BL-07..12 | Import a CSV, edit rules, invite a teammate |
| 3 | Channels and inbox | BL-13..19 | A message arrives (widget or Meta test) and appears live in the inbox |
| 4 | AI core | BL-20..25 | Playground answers from real catalog data; guardrails block a bad reply |
| 5 | Handoff and orders | BL-26..30 | Customer chats to a pending order; staff confirm it |
| 6 | Platform, hardening, report | BL-31..37, BL-X* | KPIs, load test results, refactor report, final demo |

### Sprint log (fill in with real data)

| Sprint | Dates | Goal met? | Velocity (items done) | Retro actions |
|---|---|---|---|---|
| | | | | |

Do not back-fill sprints that did not happen. The sprint log is evidence.

## 5. Definition of Ready and Definition of Done

**Ready**: linked user story with Given/When/Then criteria; size L or smaller; dependencies done or in the same sprint; owner named.

**Done**: all of the following.

- [ ] Code merged by pull request with at least one review from a different member
- [ ] Automated tests for the new behaviour (unit and integration); state transitions, guardrails and idempotency paths always have tests
- [ ] CI green: lint, type check, tests, build, dependency scan
- [ ] Acceptance criteria demonstrated
- [ ] Tenant scoping verified for any new data access
- [ ] Documentation updated (API docs, README or design doc where relevant)
- [ ] AI-assisted parts logged in `docs/ai-usage-log.md` and human-reviewed

## 6. Estimation

T-shirt sizes (S, M, L, XL) for the backlog; XL must be split before entering a sprint. AI tools may suggest sizes, but the team re-estimates by consensus at planning. Velocity is tracked as items completed per sprint.

## 7. Change control

The scope boundary is the in-scope list in the [proposal](../01-requirements/01-project-proposal.md). A proposed addition is accepted only if:

1. it serves one of the hypotheses H1 to H4, **and**
2. the Product Owner agrees what leaves the sprint or backlog to make room, **and**
3. the change is recorded in the decision log below.

### Decision log

| Date | Decision | Reason | Decided by |
|---|---|---|---|
| | | | |

## 8. Risk register

Likelihood and impact scored L / M / H. Reviewed at every retrospective.

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | AI states an invented price, stock level or policy | M | H | Facts only via tools; guardrail before send; approval mode default; golden set blocks regressions in CI | Moataz |
| R2 | Cross-tenant data exposure | L | H | Tenant guard on every query; composite foreign keys; automated tenancy tests on every endpoint | Moataz, Asma |
| R3 | Meta app review delays real channels | H | M | Website widget and playground as demo paths; mocked Meta in tests | Rayen |
| R4 | LLM provider outage or quota exhaustion | M | M | Fallback chain, queue, owner notification, human reply path | Moataz |
| R5 | Scope creep | M | M | MoSCoW, out-of-scope list, change control | Rayen |
| R6 | Uneven workload, a member blocked on another's phase | M | M | Interfaces agreed in the design phase; mocks; daily sync | Scrum Master |
| R7 | Late discovery of performance problems | M | M | k6 smoke test in CI from Sprint 3; baseline measured before refactor | Asma |
| R8 | AI-generated code or docs contain errors or licence problems | M | M | Human review of all AI output; AI usage log; dependency licence scan | Whole team |
| R9 | Test environment differs from production behaviour | L | M | Docker Compose parity, same migrations everywhere | Moataz |
| R10 | Demo fails live | M | H | Recorded backup demo; seeded data; rehearsal in Sprint 6 | Whole team |

## 9. Metrics we track

| Metric | Source | Why |
|---|---|---|
| Items done per sprint | Board | Velocity and planning accuracy |
| Test coverage | Coverage report in CI | Course target 60% or more |
| Defects found after merge | Issue tracker | Quality of review and tests |
| Lint and static-analysis issues | CI and SonarQube scan | Refactor before/after evidence |
| API latency p95 | k6 | Performance before/after evidence |
| Build and CI duration | CI | Developer feedback speed |
