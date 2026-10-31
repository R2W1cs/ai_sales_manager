---
id: T-BIZ-08
parent: T-BIZ-08
wave: W1
status: pending
optional: true
depends:
  - T-BIZ-01
fs:
  - FS-BIZ-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/12_DATABASE_DESIGN/01-rules-enums-er.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/workspace/businesses.controller.ts
  - apps/api/src/businesses/workspace/businesses.service.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-CAT-01
---

# Task: Soft-delete business workspace (Should)

## 1. Objective & Value

Implement business workspace soft-deletion and immediate channel/AI deactivation.

**Why this exists**: Allow store owners to close their accounts safely without data corruption.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `DELETE /businesses/:id` (200 OK) -> Body `{ confirmationPassword: string }` sets `deleted_at = NOW()` and halts webhooks/AI.

---

## 4. Invariants & Security Guardrails

- 🔒 **Owner Only**: Strict Owner password confirmation required.

---

## 5. Implementation Steps

1. Implement soft delete method setting `deleted_at` and disabling channels.
2. Author unit tests verifying password check and deactivation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Soft Delete**: Deactivated business returns 404 on subsequent requests.

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

- **🧪 Manual QA**: Test soft deletion endpoint in Swagger.

---

## 9. Expected Deliverables

Soft delete endpoint in businesses module.
