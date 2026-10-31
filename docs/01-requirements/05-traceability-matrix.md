# 05. Traceability Matrix

Links each user story to the backlog items that build it, the design artefacts that specify it, and the test level that will verify it. The **Tests** column is filled in by the testing phase owner (Asma); the planned level is already stated so nothing is forgotten.

Design references: flows are in [04-sequence-flows](../03-design/04-sequence-flows.md) (F1 to F20), classes in [02-class-diagrams](../03-design/02-class-diagrams.md) (C1 to C9), states in [03-state-machines](../03-design/03-state-machines.md) (S1 to S5).

| Story | Backlog | Design | Planned test level | Tests (to fill) |
|---|---|---|---|---|
| US-A-01 Register | BL-03 | F1, C1 | Unit, endpoint, E2E | |
| US-A-02 Workspace | BL-02, BL-04 | F1, C1 | Endpoint, tenancy | |
| US-A-03 Invite teammate | BL-12 | F2, C1 | Endpoint, E2E | |
| US-A-04 Activation gates | BL-30 | F16, C1 | Unit (each gate), endpoint | |
| US-A-05 Playground | BL-25 | F17, C5 | Integration (no side effects) | |
| US-B-01 Product CRUD | BL-07 | C2 | Unit, endpoint | |
| US-B-02 CSV import | BL-08 | F3, C2 | Integration, performance | |
| US-B-03 Fresh knowledge | BL-10 | F4, C2 | Integration | |
| US-B-04 Rules | BL-09 | C2 | Unit, AI golden set | |
| US-B-05 No discounting | BL-09, BL-24 | F7, F8 | AI golden set, guardrail unit | |
| US-C-01 Connect channels | BL-15 | F5, C6 | Integration (mocked Meta) | |
| US-C-02 No lost or duplicate message | BL-13 | F6, C6 | Idempotency, crash-recovery, load | |
| US-C-03 Unified inbox | BL-14, BL-19 | F6, C3 | Integration, E2E | |
| US-D-01 Prioritised inbox | BL-17, BL-19 | C3, S1 | Endpoint, E2E | |
| US-D-02 Live updates | BL-18 | F19 | Integration, E2E | |
| US-D-03 Briefing | BL-28 | F8, C4 | Unit, golden set | |
| US-D-04 Take over | BL-29 | F10, S1 | State-machine unit, endpoint | |
| US-D-05 Resume | BL-29 | F10, S1 | State-machine unit (blocked case) | |
| US-D-06 Approve replies | BL-24 | F13, C5 | Unit, endpoint | |
| US-D-07 No invented facts | BL-22, BL-23, BL-24 | F7, C5 | Golden set, guardrail unit | |
| US-D-08 Provider failure | BL-20 | F15, C5 | Unit (fault injection) | |
| US-D-09 Not understood | BL-21, BL-28 | F8 | Golden set | |
| US-D-10 Close conversation | BL-16 | S1 | State-machine unit | |
| US-E-01 Collect details | BL-27 | F9, S1 | Integration, golden set | |
| US-E-02 Reserve stock | BL-26 | F9, F20, S3 | Concurrency, unit | |
| US-E-03 Pending order and handoff | BL-27, BL-28 | F9, C4 | Integration, E2E | |
| US-E-04 Stock disappears | BL-27 | F9 | Integration | |
| US-E-05 Notify staff | BL-31 | F9, F11 | Integration | |
| US-E-06 Confirm order | BL-29 | F11, S2 | Endpoint, E2E | |
| US-E-07 Cancel order | BL-29 | F11, S2, S3 | Endpoint, unit | |
| US-E-08 Exception triggers | BL-28 | F8 | Golden set (15 triggers) | |
| US-F-01..F-05 Customers | BL-14, BL-34 | C3 | Unit, endpoint | |
| US-G-01 KPIs | BL-32 | F18 | Unit (definitions), integration | |
| US-G-02, G-03 Usage and limits | BL-33 | C7 | Integration | |

## NFR coverage

| NFR group | Design response | Test approach |
|---|---|---|
| Webhook latency, no lost message | F6 (persist, then 200, then enqueue), idempotency keys | k6 load, crash-recovery test |
| Tenant isolation | Tenant guard, `business_id` on every table, composite keys | Tenancy test suite across all endpoints |
| AI grounding | Tool-only facts, guardrails, golden set | Golden-set evaluation in CI |
| Provider failure | Fallback chain and queue (F15) | Fault-injection unit tests |
| Duplicate side effects | Unique keys, deterministic job ids | Replay tests |
| Accessibility and RTL | Design system, i18n | axe automated scan, manual RTL review |
