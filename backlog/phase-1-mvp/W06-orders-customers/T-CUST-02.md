---
id: T-CUST-02
parent: T-CUST-02
wave: W6
status: done
optional: false
depends:
  - T-CUST-01
fs:
  - FS-CUST-01
read:
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/customers/workspace/customers.controller.ts
  - apps/api/src/customers/workspace/customers.service.ts
  - apps/api/src/customers/dto/update-customer.dto.ts
done_cmd: pnpm --filter api test -- src/customers
next: T-CUST-03
---

# Task: Customer profile management, tags & VIP flags (`/customers/:id`)

## 1. Objective & Value

Implement customer profile updates, staff internal notes, VIP flagging, and custom tags.

**Why this exists**: Allow sales reps to tag important clients ('VIP', 'Wholesale', 'Bad Return History') and record private notes.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/customers/`
- `packages/shared/src/customers/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `PATCH /customers/:id` (200 OK) -> Body `{ name?: string, phone?: string, tags?: string[], isVip?: boolean, notes?: string }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy**: Cross-tenant updates return 403 Forbidden.

---

## 5. Implementation Steps

1. Implement customer PATCH route and validation.
2. Author unit tests covering tags, VIP status, and tenant isolation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Update Customer**: Staff can update customer tags and VIP status.

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

- **🧪 Manual QA**: Update customer tags via Swagger and verify in DB.

---

## 9. Expected Deliverables

Customer profile update endpoints in `apps/api/src/customers`.
