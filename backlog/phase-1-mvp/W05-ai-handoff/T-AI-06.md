---
id: T-AI-06
parent: T-AI-06
wave: W5
status: done
optional: false
depends:
  - T-AI-01
fs:
  - FS-AI-03
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/playground/playground.controller.ts
  - apps/api/src/ai/playground/playground.service.ts
  - apps/api/src/ai/dto/playground-simulate.dto.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-AI-07
---

# Task: AI Playground execution sandbox & test simulation API

## 1. Objective & Value

Implement AI Playground sandbox simulation endpoint allowing merchants to test AI sales responses in a safe test environment.

**Why this exists**: Allow merchants to test their AI agent's prompts, knowledge, and tool execution in a simulation sandbox without customer risk.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/playground.*`
- `apps/api/src/ai/dto/*playground*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /ai/playground` (200 OK) -> Body `{ message: string, conversationId?: string }`
- Response: `{ response: string, reasoning: string, toolCalls: [], handoffTriggered: boolean, handoffReason?: string }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Test Flag**: All playground records flagged with `is_test = true` to exclude from metrics.
- 🛡️ **No Outbound**: Bypasses Meta outbound queue; never dispatches to real channels.
- 🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.playground')` (Employee receives 403).

---

## 5. Implementation Steps

1. Implement `PlaygroundService` executing AI orchestrator with `source = 'PLAYGROUND'`.
2. Implement `PlaygroundController`.
3. Author unit tests covering simulation execution, test flag tagging, and employee 403 block.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Simulation**: Executes AI turn and returns tool telemetry.
- [ ] **Test Isolation**: Playground conversations are marked `is_test = true`.
- [ ] **Employee (403)**: Employee role receives 403 Forbidden.

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

- **🧪 Manual QA**: Send test prompt via Playground in Swagger and verify telemetry output.

---

## 9. Expected Deliverables

Playground simulation controller and sandbox service in `apps/api/src/ai`.
