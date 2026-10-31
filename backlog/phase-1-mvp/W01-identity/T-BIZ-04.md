---
id: T-BIZ-04
parent: T-BIZ-04
wave: W1
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-BIZ-03
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/onboarding/onboarding.controller.ts
  - apps/api/src/businesses/onboarding/onboarding.service.ts
  - apps/api/src/businesses/dto/update-onboarding.dto.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-BIZ-06
---

# Task: Onboarding completion & state management (`/businesses/:id/onboarding`)

## 1. Objective & Value

Implement onboarding step tracking and dynamic computation of readiness gates G1–G5.

**Why this exists**: Guide merchants step-by-step through onboarding and verify all prerequisite setup tasks are satisfied before live activation.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/onboarding/onboarding.controller.ts`
- `apps/api/src/businesses/onboarding/onboarding.service.ts`
- `apps/api/src/businesses/dto/update-onboarding.dto.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /businesses/:id/onboarding` (200 OK) -> `{ currentStep: number, completedSteps: string[], isReadyForLive: boolean, unmetGates: string[] }`
- `PATCH /businesses/:id/onboarding` (200 OK) -> Body `{ handoffAcknowledged?: boolean, currentStep?: number }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Computed Gates**: Gates G1 (channels), G2 (catalog), G3 (rules), G4 (playground), G5 (handoff policy) must be computed server-side, never trusted from client flags.
- 🚫 **Negative Invariants**: Reject client attempts to PATCH `{ aiActivated: true }` directly.

---

## 5. Implementation Steps

1. Implement `OnboardingService.getOnboardingState(businessId)` querying channels, products, rules, and test sessions.
2. Add `GET` and `PATCH` routes in `OnboardingController`.
3. Author unit tests verifying accurate unmet gate reporting.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Gate Calculation**: Correctly lists unmet gates when store is incomplete.
- [ ] **Acknowledgment**: Client can record handoff policy acknowledgment.
- [ ] **Anti-Tamper**: Client cannot artificially mark gates complete via PATCH.

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

- **🧪 Manual QA**: Call `GET /businesses/:id/onboarding` via Swagger and verify unmetGates matches DB state.

---

## 9. Expected Deliverables

Onboarding state controller, service, and tests.
