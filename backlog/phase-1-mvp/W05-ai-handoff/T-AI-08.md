---
id: T-AI-08
parent: T-AI-08
wave: W5
status: done
optional: false
depends:
  - T-AI-04
fs:
  - FS-AI-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/suggest/suggest.controller.ts
  - apps/api/src/ai/suggest/suggest.service.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-AI-09
---

# Task: On-demand AI draft suggestion API (`/conversations/:id/suggest`)

## 1. Objective & Value

Implement on-demand AI reply suggestion endpoint assisting human sales agents in takeover mode.

**Why this exists**: Assist human sales reps by generating high-quality response drafts on click while in human takeover mode.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/suggest.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /conversations/:id/suggest` (202 Accepted) -> Triggers on-demand draft suggestion
- Error Codes: 409 Conflict (if conversation has active complaint), 403 Forbidden (if `ai_paused = true`)

---

## 4. Invariants & Security Guardrails

- 🚫 **No Keystroke Trigger**: Explicit user button click only (never trigger on keystroke or open).

---

## 5. Implementation Steps

1. Implement `SuggestService` generating draft proposal.
2. Implement `SuggestController`.
3. Author unit tests covering draft creation, complaint suppression (409), and quota block (403).

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **On-Demand Draft**: Generates AI suggestion draft in timeline.
- [ ] **Complaint Block (409)**: Returns 409 Conflict if thread is in complaint status.

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

- **🧪 Manual QA**: In human takeover mode, click suggest via Swagger and verify draft in timeline.

---

## 9. Expected Deliverables

Suggest controller and service in `apps/api/src/ai`.
