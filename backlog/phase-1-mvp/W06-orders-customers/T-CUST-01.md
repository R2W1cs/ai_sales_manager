---
id: T-CUST-01
parent: T-CUST-01
wave: W6
status: done
optional: false
depends:
  - T-INT-03
fs:
  - FS-CUST-01
read:
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/customers/workspace/customers.controller.ts
  - apps/api/src/customers/workspace/customers.service.ts
  - apps/api/src/customers/identity/identity-resolver.service.ts
  - apps/api/src/customers/customers.module.ts
done_cmd: pnpm --filter api test -- src/customers
next: T-CUST-02
---

# Task: Customer profile resolution & multi-channel identity linking

## 1. Objective & Value

Implement customer profile repository and multi-channel identity resolution linking phone numbers across Instagram, WhatsApp, and Messenger.

**Why this exists**: Provide a single customer profile when the same shopper contacts the store across different social messaging platforms.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/customers/`
- `packages/shared/src/customers/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `IdentityResolverService.resolveCustomer(businessId, channelType, externalId, phone)`: Looks up or creates unified `customers` record, links `customer_identities` row.
- `GET /customers/:id` (200 OK) -> Unified profile with all linked channel identities and order history.

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Boundary**: Customer identity linking is strictly isolated to the merchant's `business_id`.

---

## 5. Implementation Steps

1. Implement `IdentityResolverService` matching on phone or channel account ID.
2. Implement `CustomersController` and `CustomersService`.
3. Author unit tests covering identity linking, new profile creation, and tenant isolation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Identity Link**: Linking Instagram and WhatsApp with same phone links to single customer record.

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

- **🧪 Manual QA**: Send message from IG and WhatsApp with same phone; verify single customer record in DB.

---

## 9. Expected Deliverables

Customer resolution service, controller, and tests in `apps/api/src/customers`.
