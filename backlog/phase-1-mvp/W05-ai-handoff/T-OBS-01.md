---
id: T-OBS-01
parent: T-OBS-01
wave: W5
status: done
optional: false
depends:
  - T-AI-01
fs:
  - FS-OBS-01
read:
  - docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/observability/observability.service.ts
  - apps/api/src/ai/observability/observability.controller.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-OBS-02
---

# Task: AI decision traces & action logging service

## 1. Objective & Value

Implement AI decision trace and tool action logging service for complete operational observability.

**Why this exists**: Provide store managers with complete transparency into AI intent classification, tool parameters, and reasoning traces.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/observability.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /ai/traces/:messageId` (200 OK) -> Detailed trace (`intent`, `confidence`, `retrievedChunks`, `toolCalls`, `reasoning`)

---

## 4. Invariants & Security Guardrails

- 🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.configure')` (Employee receives 403).

---

## 5. Implementation Steps

1. Record structured decision trace during AI turn execution.
2. Implement `ObservabilityController`.
3. Author unit tests covering trace query and employee 403 block.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Trace Lookup**: Manager can inspect tool inputs/outputs and reasoning trace.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/ai

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Call `GET /ai/traces/:messageId` via Swagger and inspect reasoning trace.

---

## 9. Expected Deliverables

Observability service and trace endpoints in `apps/api/src/ai`.
