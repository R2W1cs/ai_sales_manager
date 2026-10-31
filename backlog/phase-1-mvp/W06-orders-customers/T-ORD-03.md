---
id: T-ORD-03
parent: T-ORD-03
wave: W6
status: done
optional: false
depends:
  - T-ORD-01
fs:
  - FS-ORD-01
read:
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/orders/core/orders.controller.ts
  - apps/api/src/orders/core/orders.service.ts
  - apps/api/src/orders/dto/list-orders.dto.ts
done_cmd: pnpm --filter api test -- src/orders
next: T-ORD-04
---

# Task: Orders query API, filtering & detail view (`GET /orders`)

## 1. Objective & Value

Implement orders query endpoint with status filters, date range selection, customer search, and cursor pagination.

**Why this exists**: Allow merchants to review order history, monitor pending confirmations, and inspect fulfillment details.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/orders/orders.*`
- `apps/api/src/orders/dto/*list*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /orders` (200 OK) -> Query params: `status`, `customerId`, `from`, `to`, `cursor`, `limit`
- Response: `{ items: OrderSummaryDto[], nextCursor?: string, totalCount: number }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Boundary**: Query must strictly filter by `business_id`.

---

## 5. Implementation Steps

1. Implement `listOrders` query builder with cursor pagination.
2. Author unit tests covering multi-status filtering and date range checks.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Filter by Status**: Correctly filters orders by CONFIRMED / PENDING.
- [ ] **Date Range Filter**: Limits results within specified date range.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/orders

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Query `GET /orders` via Swagger with status filters.

---

## 9. Expected Deliverables

Orders listing query methods and tests in `apps/api/src/orders`.
