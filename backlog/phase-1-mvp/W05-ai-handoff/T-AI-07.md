---
id: T-AI-07
parent: T-AI-07
wave: W5
status: done
optional: false
depends:
  - T-AI-06
fs:
  - FS-AI-03
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/00_product/03_MVP_SCOPE/02-out-of-scope-hooks-gate.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/playground/playground.service.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-BIZ-05
---

# Task: AI Playground test completion & readiness check

## 1. Objective & Value

Record successful completion of playground simulation test in onboarding Gate G4.

**Why this exists**: Confirm merchant has tested their agent before live activation is unlocked.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/playground/playground.service.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Playground test turn completion marks `business_onboarding.playground_passed = true`.

---

## 4. Invariants & Security Guardrails

- 🚫 **No Auto Activation**: Completing playground test does NOT automatically activate live AI.

---

## 5. Implementation Steps

1. Update onboarding record upon first playground turn.
2. Author unit test verifying gate status update.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Gate Update**: Marks Gate G4 complete.

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

- **🧪 Manual QA**: Complete 1 test in Playground and verify Gate G4 status in `GET /onboarding`.

---

## 9. Expected Deliverables

Playground readiness handler in `apps/api/src/ai`.
