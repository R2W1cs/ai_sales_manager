---
id: T-ORD-04
parent: T-ORD-04
wave: W6
status: done
optional: false
depends:
  - T-ORD-01
fs:
  - FS-ORD-01
read:
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/20_design/23_UI_COMPONENTS/03-inbox-command-center.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/orders/core/orders.controller.ts
  - apps/api/src/orders/core/orders.service.ts
done_cmd: pnpm --filter api test -- src/orders
next: T-CONV-07
---

# Task: Manual order draft creation from inbox conversation drawer

## 1. Objective & Value

Implement manual order draft generation directly linked to an active conversation thread.

**Why this exists**: Allow sales reps to quickly draft an order while chatting with a customer in the inbox drawer.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/orders/orders.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /conversations/:id/orders/draft` (201 Created) -> Creates draft order linked to conversation, places stock hold, returns order summary.

---

## 4. Invariants & Security Guardrails

- 🔒 **Conversation Match**: Verify conversation belongs to caller's tenant.

---

## 5. Implementation Steps

1. Implement draft order creation route inside conversation context.
2. Author unit tests verifying stock hold and conversation link.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Draft from Inbox**: Creates draft order linked to conversation thread.

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

- **🧪 Manual QA**: Call `POST /conversations/:id/orders/draft` via Swagger and verify draft creation.

---

## 9. Expected Deliverables

Manual order draft endpoints in `apps/api/src/orders`.
