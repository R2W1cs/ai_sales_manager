---
id: T-ANL-01
parent: T-ANL-01
wave: W7
status: done
optional: false
depends:
  - T-ORD-01
  - T-HAND-01
fs:
  - FS-ANL-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/analytics/rollups/daily-rollup.service.ts
  - apps/api/src/analytics/rollups/daily-rollup.processor.ts
  - apps/api/src/analytics/analytics.module.ts
done_cmd: pnpm --filter api test -- src/analytics
next: T-ANL-02
---

# Task: Daily analytics aggregation worker & materialization pipeline

## 1. Objective & Value

Implement nightly analytics aggregation worker computing daily GMV, order count, conversation volume, AI resolution rate, and response times into `analytics_daily`.

**Why this exists**: Precompute daily commercial performance metrics so dashboard queries load in <100ms without scanning millions of raw rows.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/analytics/`
- `packages/shared/src/analytics/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Worker runs at 00:05 UTC nightly via BullMQ repeatable job.
- **Metric Definitions & Calculation Formulas**:
  - `revenue` (GMV in millimes): `SUM(orders.total_amount_millimes)` where `status IN ('CONFIRMED', 'COMPLETED') AND is_test = false AND DATE(confirmed_at AT TIME ZONE 'Africa/Tunis') = day`.
  - **Exclusions**: `DRAFT`, `PENDING_CONFIRMATION`, and `CANCELLED` orders are strictly excluded from GMV.
  - `ordersCount`: Count of non-test orders reaching `CONFIRMED` or `COMPLETED` on that day.
  - `conversationsCount`: Total conversations with shopper activity on that day.
  - `aiHandledCount` & `humanHandoffCount`: Conversations resolved by AI vs escalated to human.
  - `aiResolutionRate`: `aiHandledCount / conversationsCount` (null if count is 0).
  - `avgResponseTimeMs`: Average AI message latency in milliseconds.
- Upserts row in `analytics_daily` per `(business_id, day)`.

---

## 5. Implementation Steps

1. Implement `DailyRollupService` computing metrics from orders and conversation status events.
2. Implement BullMQ nightly rollup processor.
3. Author unit tests verifying rollup math and idempotency.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Rollup Math**: Correctly calculates GMV, order count, and AI resolution percentage.
- [ ] **Idempotency**: Multiple runs on same day update row without duplication.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/analytics

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Run nightly rollup worker and inspect `analytics_daily` table in Prisma Studio.

---

## 9. Expected Deliverables

Daily analytics rollup service, processor, and tests in `apps/api/src/analytics`.
