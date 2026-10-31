---
id: T-CUST-04
parent: T-CUST-04
wave: W6
status: done
optional: false
depends:
  - T-CUST-01
  - T-ORD-01
fs:
  - FS-CUST-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/customers/lifecycle/lifecycle.service.ts
  - apps/api/src/customers/lifecycle/lifecycle.processor.ts
done_cmd: pnpm --filter api test -- src/customers
next: T-NOTIF-01
---

# Task: Customer lifecycle stage automated classification

## 1. Objective & Value

Implement automated customer lifecycle stage classifier (`PROSPECT`, `FIRST_TIME_BUYER`, `RETURNING_CUSTOMER`, `CHURN_RISK`) triggered by order confirmation events and customer merge operations.

**Why this exists**: Automatically classify customer relationship stages based on completed order history and recency to guide AI tone and marketing segmentation.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/customers/`
- `packages/shared/src/customers/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Lifecycle Stages & Rules:
  - 0 confirmed orders -> `PROSPECT`
  - 1 confirmed order -> `FIRST_TIME_BUYER`
  - > = 2 confirmed orders -> `RETURNING_CUSTOMER`
  - > 90 days without confirmed orders / activity -> `CHURN_RISK`
- **Recalculation Triggers**:
  1. `order.confirmed` domain event from `OrdersService`.
  2. Customer merge operation in `MergeService` (recalculating total confirmed orders across consolidated profiles).
- **Aggregates Updated**: `confirmed_order_count`, `last_confirmed_order_at`, and `lifecycle_stage` on the customer record.

---

## 4. Invariants & Security Guardrails

- 🚫 **Deterministic Calculation**: Stage is always computed directly from actual confirmed order count and dates, eliminating drift or double-counting on merge.
- 🔒 **Tenancy Boundary**: Operations strictly filtered by caller's `business_id`.

---

## 5. Implementation Steps

1. Implement `LifecycleService.recomputeStage(customerId, tx?)` calculating exact confirmed order count and recency.
2. Implement BullMQ `lifecycle.processor.ts` listening to `order.confirmed`.
3. Integrate lifecycle recalculation in `MergeService` for atomic post-merge sync.
4. Author unit tests covering 0, 1, 2+ orders, >90d churn, and merge transitions.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **First Order**: Transitions customer to `FIRST_TIME_BUYER` upon 1st order confirmation.
- [ ] **Repeat Order**: Transitions customer to `RETURNING_CUSTOMER` upon 2nd order confirmation.
- [ ] **Post-Merge Sync**: Merging two customers with 1 order each promotes survivor to `RETURNING_CUSTOMER` (total = 2).
- [ ] **Churn Risk**: Classifies customer as `CHURN_RISK` if last confirmed order >90 days ago.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/customers

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Confirm order in Swagger and verify customer lifecycle stage update in DB via Prisma Studio.

---

## 9. Expected Deliverables

Customer lifecycle service, processor, and tests in `apps/api/src/customers`.
