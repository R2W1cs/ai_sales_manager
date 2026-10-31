---
id: T-ANL-02
parent: T-ANL-02
wave: W7
status: done
optional: false
depends:
  - T-ANL-01
fs:
  - FS-ANL-01
read:
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/analytics/kpis/analytics.controller.ts
  - apps/api/src/analytics/kpis/analytics.service.ts
  - apps/api/src/analytics/dto/analytics-overview.dto.ts
done_cmd: pnpm --filter api test -- src/analytics
next: T-WEB-01
---

# Task: Analytics dashboard summary & timeseries overview API (`/analytics/overview`)

## 1. Objective & Value

Implement merchant analytics overview API returning the 4 core KPI cards (GMV, Conversations Handled, AI Resolution Rate, Response Time) and trend timeseries with sub-100ms response time.

**Why this exists**: Power the executive analytics dashboard in the merchant web application without data gaps for the current day.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/analytics/`
- `packages/shared/src/analytics/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /api/v1/analytics/overview` (200 OK) — Permission: `@RequirePermission('analytics.read')`.
  - Query params: `from`, `to` (dates in `Africa/Tunis` timezone), `period` (`7d` | `30d` | `90d`).
  - Response:
    ```json
    {
      "summary": {
        "gmv": 14250000,
        "ordersCount": 85,
        "conversationsCount": 340,
        "aiResolutionRate": 0.82,
        "messagesAi": 1240,
        "messagesHuman": 260,
        "avgResponseTimeMs": 850
      },
      "timeseries": [
        {
          "date": "2026-08-27",
          "gmv": 520000,
          "ordersCount": 4,
          "conversationsCount": 18,
          "aiResolutionRate": 0.85
        }
      ]
    }
    ```
- **Hybrid Real-Time Query**:
  - Historical days (`day < TODAY_TUNIS`): Read directly from `analytics_daily` table (fast indexed lookup on `(business_id, day)`).
  - Current day (`day = TODAY_TUNIS`): Perform lightweight live aggregation from `orders` and `conversations` where `created_at >= TODAY_START_TUNIS`.
  - Merges historical and intraday data to deliver a complete, gapless dashboard for Tunisian daytime users.

---

## 4. Invariants & Security Guardrails

- 🛡️ **Sub-100ms SLA**: Uses materialized `analytics_daily` plus indexed partial query for today.
- 🔒 **Tenancy Boundary**: Queries strictly scoped to caller's `business_id`.
- 🚫 **Four KPIs Only**: GMV, Orders, Conversations, and AI Resolution Rate (messages breakdown is a sub-field, not a 5th KPI tile).

---

## 5. Implementation Steps

1. Define analytics overview response DTO and query DTO in `packages/shared`.
2. Implement `AnalyticsService.getOverview()` with hybrid daily query logic.
3. Implement `AnalyticsController` with `@RequirePermission('analytics.read')`.
4. Author unit tests verifying hybrid date math, KPI calculation, and tenant isolation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **KPI Overview**: Returns 4 KPI metrics with breakdown of AI vs human messages.
- [ ] **Intraday Data**: Current day (today) includes live partial counts rather than empty zeros.
- [ ] **Timeseries**: Returns daily data points for charts.
- [ ] **Performance (<100ms)**: Query execution finishes well within 100ms SLA.

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

- **🧪 Manual QA**: Call `GET /api/v1/analytics/overview?period=30d` via Swagger; verify today's orders are included.

---

## 9. Expected Deliverables

Analytics overview controller, service, and tests in `apps/api/src/analytics`.
