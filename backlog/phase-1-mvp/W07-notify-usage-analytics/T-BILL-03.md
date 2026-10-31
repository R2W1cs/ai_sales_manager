---
id: T-BILL-03
parent: T-BILL-03
wave: W7
status: done
optional: false
depends:
  - T-BILL-02
fs:
  - FS-BILL-01
read:
  - docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/billing/quota/quota.service.ts
  - apps/api/src/billing/core/billing.controller.ts
done_cmd: pnpm --filter api test -- src/billing
next: T-BILL-04
---

# Task: Quota enforcement engine, 85% warning & 100% hard limit gate (`/billing/usage`)

## 1. Objective & Value

Implement quota enforcement engine (hybrid real-time counter, single 85% warning alert per cycle, 100% AI pause) and usage summary endpoint (`GET /api/v1/billing/usage`).

**Why this exists**: Prevent merchants from exceeding monthly quota allowances with zero lag while keeping human messaging active.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/billing/`
- `packages/shared/src/billing/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /api/v1/billing/usage` (200 OK) — Permission: `@RequirePermission('usage.read')`.
  - Response: `{ cycleStart, cycleEnd, planCode, limits: { aiMessages, seats, channels }, current: { aiMessages, seats, channels }, percentUsed: number, aiPaused: boolean }`.
- **Billing Cycle**: Starts 1st of month at 00:00:00 `Africa/Tunis` and ends last day of month at 23:59:59 `Africa/Tunis`.
- **Hybrid Real-Time Quota Read**:
  - Computes `currentUsage = SUM(usage_aggregates in cycle) + SUM(usage_events recorded after last aggregate period_end)`.
- **85% Warning Alert Debounce**:
  - When `percentUsed >= 85%`, dispatches `USAGE_WARNING_85` notification IF NOT ALREADY SENT for the current monthly cycle (tracked via dedupe key `usage_warning_85:{businessId}:{yyyy-MM}`).
- **100% Hard Limit Gate**:
  - When `percentUsed >= 100%`, sets `aiPaused = true` and rejects inbound AI auto-send jobs.

---

## 4. Invariants & Security Guardrails

- 🔒 **Zero Lag Quota Enforcement**: Hybrid read guarantees that quota exhaustion cannot be bypassed during the 1-hour rollup interval.
- 🔒 **Human Messaging Preserved**: Reaching 100% quota strictly pauses AI turns; human agent manual replies must NEVER be blocked.
- 🚫 **No Alert Spam**: 85% warning alert triggers at most once per tenant per monthly billing cycle.

---

## 5. Implementation Steps

1. Implement `QuotaService.getUsage(businessId)` with hybrid read combining `usage_aggregates` and recent `usage_events`.
2. Implement `QuotaService.checkQuotaGate(businessId)` called before dispatching AI turns.
3. Add cycle-scoped deduplication check before dispatching `USAGE_WARNING_85`.
4. Implement `BillingController.getUsage()` with `@RequirePermission('usage.read')`.
5. Author unit tests covering hybrid calculation, 85% alert suppression, and 100% AI pause behavior.

---

## 6. Acceptance Criteria & Test Scenarios

- [x] **Hybrid Calculation**: Accurately sums aggregates plus raw events created in the current hour.
- [x] **85% Alert Debounce**: Warning notification fires once when crossing 85%, and does NOT fire on subsequent checks in the same cycle.
- [x] **100% Hard Gate**: AI turns pause at 100% utilization while human agent replies continue to send.
- [x] **Timezone Cycle**: Cycle start/end dates correctly correspond to `Africa/Tunis` calendar month.

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

- **🧪 Manual QA**: Insert test usage events bringing tenant to 86%, verify 1 notification in DB; insert up to 100%, verify AI pause.

---

## 9. Expected Deliverables

Quota service, billing controller, and unit tests in `apps/api/src/billing`.
