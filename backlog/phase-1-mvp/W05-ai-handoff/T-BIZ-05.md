---
id: T-BIZ-05
parent: T-BIZ-05
wave: W5
status: done
optional: false
depends:
  - T-BIZ-04
  - T-CAT-02
  - T-INT-01
  - T-AI-07
fs:
  - FS-BIZ-03
read:
  - docs/00_product/03_MVP_SCOPE/02-out-of-scope-hooks-gate.md
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/activation/activation.controller.ts
  - apps/api/src/businesses/activation/activation.service.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-AI-08
---

# Task: Live activation gate enforcement (G1–G5 validation)

## 1. Objective & Value

Implement live activation gate check strictly validating all 5 prerequisites (G1 channels, G2 catalog, G3 rules, G4 playground, G5 handoff policy) before enabling live AI customer responses.

**Why this exists**: Prevent merchants from accidentally activating unconfigured AI agents without connected channels, products, or store policies.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/activation/*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `PATCH /integrations/live` (200 OK) -> Body `{ enabled: true }` (returns 422 with unmet gates list if incomplete)

---

## 4. Invariants & Security Guardrails

- 🔒 **Strict Enforcement**: If any gate is missing, return 422 Unprocessable Entity with error envelope listing unmet gates.
- 🛡️ **Owner Only**: Requires role `OWNER`.

---

## 5. Implementation Steps

1. Implement `ActivationService` querying database to independently verify each gate.
2. Implement `ActivationController`.
3. Author unit tests covering 422 rejection on missing gates and 200 OK on full completion.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Incomplete Setup (422)**: Returns 422 listing unmet gates.
- [ ] **Complete Setup (200)**: Sets `is_live = true` and enables live inbound AI processing.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/businesses

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Call `PATCH /integrations/live` via Swagger before setup and verify 422 error payload.

---

## 9. Expected Deliverables

Activation controller and gate verification service in `apps/api/src/businesses`.
