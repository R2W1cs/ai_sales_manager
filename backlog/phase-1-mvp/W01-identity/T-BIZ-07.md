---
id: T-BIZ-07
parent: T-BIZ-07
wave: W1
status: done
optional: false
depends:
  - T-AUTH-02/c
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/17_SECURITY_DESIGN/02-secrets-encryption-pii-audit.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/audit/audit.controller.ts
  - apps/api/src/businesses/audit/audit.service.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-CAT-01
---

# Task: Audit logging service & events repository (`/businesses/:id/audit-logs`)

## 1. Objective & Value

Implement immutable tenant audit logging service for recording human, security, and financial actions.

**Why this exists**: Ensure compliance and security traceability for sensitive merchant actions (role updates, invites, order cancellations) per BAC-9.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/audit/audit.controller.ts`
- `apps/api/src/businesses/audit/audit.service.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /businesses/:id/audit-logs` (200 OK) -> Paginated audit event records with filters (`actorId`, `action`, `dateRange`)
- `AuditService.record(event)`: Internal method recording immutable audit row asynchronously.

---

## 4. Invariants & Security Guardrails

- 🔒 **Immutability**: Audit logs are append-only; no UPDATE or DELETE queries are permitted.
- 🛡️ **Separation of Concerns**: AI autonomous actions must never be written to `audit_logs` (they belong in `ai_actions`).
- 🛡️ **RBAC Permission**: GET requires `@RequirePermission('audit.read')` (Owner/Manager).

---

## 5. Implementation Steps

1. Implement `AuditService.record(event)` with async execution.
2. Implement `AuditController` with cursor pagination and date filtering.
3. Author unit tests covering log creation, pagination, and employee 403 block.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Audit Record**: Sensitive action creates immutable log entry with actor IP.
- [ ] **Employee Access (403)**: Employee role receives 403 Forbidden.

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

- **🧪 Manual QA**: Trigger team role update and verify audit log entry in Swagger.
- **👁️ Review & Sign-off**: Verify audit log table has no update/delete methods.

---

## 9. Expected Deliverables

Audit logging service, controller, and tests.
