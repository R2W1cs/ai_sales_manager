---
id: T-BIZ-02
parent: T-BIZ-02
wave: W1
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-BIZ-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/workspace/businesses.controller.ts
  - apps/api/src/businesses/workspace/businesses.service.ts
  - apps/api/src/businesses/dto/update-business.dto.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-BIZ-03
---

# Task: Business profile management API (`GET/PATCH /businesses/:id`)

## 1. Objective & Value

Implement business profile retrieval and modification endpoints for store metadata.

**Why this exists**: Allow store owners to view and update store name, contact details, timezone, and currency.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/workspace/businesses.controller.ts`
- `apps/api/src/businesses/workspace/businesses.service.ts`
- `apps/api/src/businesses/dto/update-business.dto.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /businesses/:id` (200 OK) -> Business profile details
- `PATCH /businesses/:id` (200 OK) -> Body `{ name?: string, timezone?: string, currency?: string, phone?: string }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Scope**: Caller can only view/update their own workspace.
- 🛡️ **RBAC Permission**: PATCH requires `@RequirePermission('business.write')` (Owner/Manager).
- 🚫 **Negative Invariants**: Forbid modifying onboarding status flags on this endpoint.

---

## 5. Implementation Steps

1. Implement profile GET and PATCH in `BusinessesController`.
2. Author unit tests covering tenant isolation and field validation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Profile Update**: Authorized role updates name and timezone.
- [ ] **Cross-Tenant Block**: Accessing other business ID returns 403 Forbidden.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/businesses

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Call `PATCH /businesses/:id` via Swagger to update store phone number.

---

## 9. Expected Deliverables

Business profile endpoints and tests.
