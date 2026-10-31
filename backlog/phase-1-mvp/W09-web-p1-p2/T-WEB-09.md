---
id: T-WEB-09
parent: T-WEB-09
wave: W9
status: done
optional: false
depends:
  - T-WEB-02
  - T-ANL-02
fs:
  - FS-WEB-04
read:
  - docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md
  - docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
files:
  - apps/web/src/app/(dashboard)/analytics/page.tsx
  - apps/web/src/components/analytics/analytics-kpi-cards.tsx
  - apps/web/src/components/analytics/revenue-chart.tsx
  - apps/web/src/components/analytics/ai-resolution-chart.tsx
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-10
---

# Task: Web Analytics Dashboard UI (`/analytics`)

## 1. Objective & Value

Implement merchant Analytics dashboard with 4 KPI summary cards, GMV revenue chart, and AI resolution percentage chart.

**Why this exists**: Provide merchants with visual insights into store sales performance and AI operational efficiency.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(dashboard)/analytics/`
- `apps/web/src/components/analytics/`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- KPI Cards: GMV Revenue, Total Orders, Conversations, AI Resolution Rate.
- Period Selector: 7 days, 30 days, 90 days with trend indicators.

---

## 4. Invariants & Security Guardrails

- 🛡️ **RBAC Permission**: Requires `analytics.read`.

---

## 5. Implementation Steps

1. Implement KPI cards component with metric deltas.
2. Implement timeseries area/bar charts using Recharts.
3. Author component tests.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Analytics View**: Renders KPI cards and trend charts accurately.

---

## 7. Verification Commands

```bash
# 1. Run typecheck & lint
pnpm --filter web check-types && pnpm --filter web lint

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Navigate to `http://localhost:3000/analytics`; test period filters (7d, 30d, 90d).

---

## 9. Expected Deliverables

Analytics dashboard page and chart components in `apps/web`.
