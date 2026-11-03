# Wave W7 Testing Specification — Notifications, Usage Metering & Analytics

| Field       | Value                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Wave ID     | `W7`                                                                                            |
| Wave Title  | Notifications, Usage Metering & Analytics                                                       |
| Cards       | `T-ANL-01`, `T-ANL-02`, `T-BILL-01` through `T-BILL-04`, `T-NOTIF-01`, `T-NOTIF-02` (11 leaves) |
| Status      | Canonical AI Testing Guide for Wave W7 Completion Gate                                          |
| Focus Areas | 4 Canonical KPIs, usage event metering, budget pause, staff notification priorities             |

---

## 1. Automated Verification Suites

```bash
# 1. Analytics & KPI Rollup Tests
pnpm --filter api test -- src/analytics

# 2. Billing & Usage Limit Tests
pnpm --filter api test -- src/billing

# 3. Staff Notifications Suite
pnpm --filter api test -- src/notifications

# 4. Monorepo Quality Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Four Canonical KPIs (`01_PRODUCT_REQUIREMENTS.md` §15)

- **Strict KPI Computation**:
  1. `Total Confirmed Revenue`: Sum of `orders.total` where `status = 'CONFIRMED'` or `'COMPLETED'` (stored as `Decimal(12,3)`).
  2. `Total Orders Handled`: Count of orders confirmed via AI assistance + staff.
  3. `AI Automation Rate`: `(conversations resolved by AI without handoff) / (total conversations)`.
  4. `Average Response Time`: Mean seconds from customer message to bot/staff reply.
- **Prohibited Metrics**:
  - No 5th KPI tile in MVP (strict scope).
  - Employees see the exact same 4 figures (cost of goods is omitted from MVP).

### B. Usage Metering & Monthly Quota Enforcement (`13` §2.6, §2.11)

- **Monthly Cap Breach**:
  - `ai_messages_per_month` or `monthly_ai_budget_usd` exceeded -> AI pauses turns.
  - Returns `{ "error": { "code": "quota_exceeded", "message": "Monthly AI usage limit reached", "details": { "metric": "monthly_ai_budget_usd" } } }` (HTTP 403).

### C. Notifications Prioritization (`13` §2.7)

- **Sort Order**:
  - Notifications sorted by `handoff_priority` (high -> medium -> low), then `created_at DESC`.

---

## 3. CLI Smoke & Integration Simulation

```bash
# 1. Query 4 KPIs for current period
curl -s -X GET "http://localhost:3001/api/v1/analytics/kpis?from=2026-08-01&to=2026-08-31" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" | jq '{totalRevenue, totalOrders, aiAutomationRate, avgResponseTimeSeconds}'

# 2. Query Staff Notifications
curl -s -X GET "http://localhost:3001/api/v1/notifications" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" | jq '.data[] | {id, priority, title}'
```

---

## 4. Wave W7 Completion Gate Checklist

- [ ] All 11 leaves in W7 marked `status: done`.
- [ ] Mathematical unit tests verify precision of the 4 KPI calculations.
- [ ] Quota breach triggers `403 quota_exceeded` / `ai_paused`.
- [ ] `pnpm check:full` exits 0.
