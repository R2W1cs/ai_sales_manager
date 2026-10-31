---
id: T-ORD-01
parent: T-ORD-01
wave: W6
status: done
optional: false
depends:
  - T-CONV-02
fs:
  - FS-ORD-01
read:
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/orders/core/orders.controller.ts
  - apps/api/src/orders/core/orders.service.ts
  - apps/api/src/orders/dto/create-order.dto.ts
  - apps/api/src/orders/dto/update-order-status.dto.ts
  - apps/api/src/orders/orders.module.ts
done_cmd: pnpm --filter api test -- src/orders
next: T-ORD-02
---

# Task: Orders domain layer, lifecycle & stock reservation management (`/orders`)

## 1. Objective & Value

Implement orders domain layer with state machine (`DRAFT`, `PENDING_CONFIRMATION`, `CONFIRMED`, `CANCELLED`, `FULFILLED`), stock reservation integration, and conversation linking.

**Why this exists**: Allow sales reps and AI agents to draft and confirm commercial orders while automatically managing stock reservations to prevent overselling.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/orders/`
- `packages/shared/src/orders/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /orders` (201 Created) -> Body `{ customerId: string, conversationId?: string, items: [{ variantId, quantity, unitPrice }], shippingAddress }`
- `POST /orders/:id/confirm` (200 OK) -> Confirms order, transitions status to `CONFIRMED`, commits physical stock deduction
- `POST /orders/:id/cancel` (200 OK) -> Cancels order, releases stock reservation hold
- `GET /orders/:id` (200 OK) -> Order details with line items and customer snapshot

---

## 4. Invariants & Security Guardrails

- 🔒 **Atomic Stock Deduction**: Order confirmation must commit stock deduction and mark reservation `COMMITTED` in a single transaction.
- 🛡️ **Tenancy**: All order queries and operations must filter by `business_id`.
- 🚫 **Negative Invariants**: Never allow confirming an order if stock reservation has expired or insufficient stock.

---

## 5. Implementation Steps

1. Define order DTOs and Zod schemas in shared.
2. Implement `OrdersService` with atomic stock hold creation and order confirmation.
3. Implement `OrdersController` with tenant and permissions guards.
4. Author unit/integration tests covering order creation, confirmation, cancellation, and stock math.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Create Draft**: Creates order in PENDING_CONFIRMATION with 30-min stock hold.
- [ ] **Confirm Order**: Deducts physical stock, commits reservation, sets status = CONFIRMED.
- [ ] **Cancel Order**: Cancels order and releases stock reservation hold.
- [ ] **Tenancy Block (403)**: Accessing another tenant's order returns 403 Forbidden.

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

- **🧪 Manual QA & Smoke test**: Create draft order via Swagger; call `POST /orders/:id/confirm` and verify stock deduction in Prisma Studio (`pnpm --filter api exec prisma studio`).
- **👁️ Review & Sign-off**: Verify stock hold and order creation occur in an atomic Prisma transaction.

---

## 9. Expected Deliverables

Orders controller, service, DTOs, and unit tests in `apps/api/src/orders`.
