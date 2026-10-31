---
id: T-BILL-02
parent: T-BILL-02
wave: W7
status: done
optional: false
depends:
  - T-BILL-01
  - T-AI-01
fs:
  - FS-BILL-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/billing/metering/metering.service.ts
  - apps/api/src/billing/metering/metering.processor.ts
done_cmd: pnpm --filter api test -- src/billing
next: T-BILL-03
---

# Task: Usage events metering pipeline & hourly aggregation worker

## 1. Objective & Value

Implement real-time usage event recording and hourly background aggregation worker rolling up metrics per tenant.

**Why this exists**: Track consumed AI messages, tokens, and storage per tenant to enforce subscription quotas without blocking primary message delivery.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/billing/`
- `packages/shared/src/billing/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `MeteringService.recordUsage(businessId, metric, quantity)`: Inserts raw event to `usage_events` with `recorded_at = NOW()` and `period_bucket = DATE(NOW() AT TIME ZONE 'Africa/Tunis')`.
- Hourly BullMQ repeatable worker aggregates raw events into `usage_aggregates` table with unique constraint `(business_id, period_start, metric)`.
- Metric Types: `AI_MESSAGES`, `TOKENS_INPUT`, `TOKENS_OUTPUT`, `ORDERS_PROCESSED`.

---

## 4. Invariants & Security Guardrails

- 🔒 **Non-Blocking Ingestion**: Raw usage recording must execute asynchronously or with sub-millisecond insert latency to never degrade chat responsiveness.
- 🕒 **Timezone Alignment**: Period buckets are strictly aligned to `Africa/Tunis` calendar days.
- 🔒 **Tenancy Isolation**: Usage records are strictly scoped by `business_id`.

---

## 5. Implementation Steps

1. Implement `MeteringService.recordUsage()` with batching/async insert.
2. Implement BullMQ `metering.processor.ts` hourly rollup job.
3. Author unit tests verifying usage recording, date bucket calculations, and rollup accuracy.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Usage Ingestion**: Emitting usage events writes rows to `usage_events`.
- [ ] **Hourly Rollup**: Aggregator computes exact sums into `usage_aggregates`.
- [ ] **Timezone Bucketing**: Period bucket matches `Africa/Tunis` date.

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

- **🧪 Manual QA**: Send test messages, trigger hourly worker in Swagger/Nest CLI, and verify sums in `usage_aggregates`.

---

## 9. Expected Deliverables

Usage metering service, rollup processor, and tests in `apps/api/src/billing`.
