---
id: T-AUTH-02/c
parent: T-AUTH-02
wave: W1
status: done
optional: false
depends:
  - T-AUTH-02/b
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
files:
  - apps/api/src/platform/security/tenant.guard.spec.ts
  - apps/api/src/platform/security/permissions.guard.spec.ts
done_cmd: pnpm --filter api test -- src/platform
next: T-AUTH-03
---

# Task: Tenant resolution + RBAC guards (Tenancy + RBAC Jest)

## 1. Objective & Value

Exhaustive Jest unit test suite mathematically proving multi-tenant isolation and RBAC permission enforcement on TenantGuard and PermissionsGuard per NFR-SEC-04 and NFR-SEC-05.

**Why this exists**: Security invariants require absolute proof that cross-tenant access, missing headers, and privilege escalations are strictly blocked at the guard layer before reaching business logic.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/platform/security/tenant.guard.spec.ts`
- `apps/api/src/platform/security/permissions.guard.spec.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/api/src/platform/security/tenant.guard.ts`
- `apps/api/src/platform/security/permissions.guard.ts`
- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `TenantGuard.canActivate(context)`: Extracts `X-Business-Id` header, resolves active membership from JWT user context, attaches `req.tenantId` and `req.membership`.
- `PermissionsGuard.canActivate(context)`: Reads `@RequirePermission()` metadata, verifies caller membership role against the 22 closed permissions list.

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Isolation**: Any request missing `X-Business-Id` or attempting cross-tenant access must be rejected with 400/403.
- 🛡️ **RBAC Rigor**: `OWNER` has superuser bypass for all 22 permissions. `MANAGER` and `EMPLOYEE` are strictly limited to their documented permissions.
- 🚫 **Negative Invariants**: Never mock Prisma globally; construct realistic ExecutionContext mocks.

---

## 5. Implementation Steps

1. Author `tenant.guard.spec.ts`: test missing header (400), user without membership (403), inactive membership (403), valid tenant (passes).
2. Author `permissions.guard.spec.ts`: test unauthenticated (401), missing tenant context (403), Owner role (passes all 22).
3. Test Manager role on allowed permissions (e.g. `catalog.write`, `inbox.write`) vs forbidden (e.g. `business.delete`).
4. Test Employee role on allowed permissions (e.g. `inbox.read`, `orders.write`) vs forbidden (e.g. `catalog.write`, `ai.configure`).
5. Verify all tests pass with `pnpm --filter api test -- src/platform`.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Happy Path**: Valid tenant member with required permission passes guard check.
- [ ] **Missing Header (400)**: Request without `X-Business-Id` throws 400 Bad Request.
- [ ] **Cross-Tenant Access (403)**: Accessing tenant without active membership throws 403 Forbidden.
- [ ] **Permission Escalation (403)**: Employee attempting `ai.configure` or `business.write` receives 403 Forbidden.
- [ ] **Coverage**: All 22 closed permission codes have explicit test coverage.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/platform

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 Environment variables**: None (uses in-memory test mocks).
- **🧪 Manual QA & Verification**: Run `pnpm --filter api test -- src/platform` and verify 100% test pass rate.
- **👁️ Review & Sign-off**: Verify role-to-permission mapping strictly adheres to `13_API_DESIGN.md` §2.11.

---

## 9. Expected Deliverables

Comprehensive, passing unit test suite in `apps/api/src/platform/**/*.spec.ts`.
