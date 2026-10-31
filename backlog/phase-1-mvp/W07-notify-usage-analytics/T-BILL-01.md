---
id: T-BILL-01
parent: T-BILL-01
wave: W7
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-BILL-01
read:
  - docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
files:
  - apps/api/src/billing/plans/plans.service.ts
  - apps/api/src/billing/plans/plans.controller.ts
  - apps/api/src/billing/billing.module.ts
done_cmd: pnpm --filter api test -- src/billing
next: T-BILL-02
---

# Task: Billing subscription plans seed & database repository

## 1. Objective & Value

Seed subscription plan tiers (Starter, Growth, Scale) with quota allocations.

**Why this exists**: Provide system with canonical plan limits (seats, channel accounts, AI messages/month, orders/month).

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/billing/`
- `packages/shared/src/billing/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /billing/plans` (200 OK) -> Lists available tiers and quotas.

---

## 4. Invariants & Security Guardrails

- 🔒 **Plan Quotas**: Starter (2 seats, 1 channel, 500 AI msgs), Growth (5 seats, 3 channels, 3000 AI msgs), Scale (15 seats, 10 channels, 15000 AI msgs).

---

## 5. Implementation Steps

1. Seed plans in database schema.
2. Implement `PlansService` and `PlansController`.
3. Author unit tests verifying plan quota retrieval.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Plan Quotas**: Returns 3 standard subscription tiers with correct quotas.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/billing

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Query `GET /billing/plans` in Swagger.

---

## 9. Expected Deliverables

Plans service, controller, and tests in `apps/api/src/billing`.
