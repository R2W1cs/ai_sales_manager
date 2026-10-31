---
id: T-OPS-04
parent: T-OPS-04
wave: W10
status: pending
optional: false
depends:
  - T-AUTH-02/c
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
  - docs/10_engineering/13_API_DESIGN/01-conventions-dto-contracts.md
files:
  - apps/api/test/security-matrix/tenancy-isolation.spec.ts
  - apps/api/test/security-matrix/rbac-matrix.spec.ts
done_cmd: pnpm --filter api test -- test/security-matrix
next: T-OPS-05
---

# Task: Comprehensive security matrix test suite (multi-tenant isolation & RBAC)

## 1. Objective & Value

Implement automated end-to-end security matrix test suite verifying 100% tenant isolation across all 12 modules and RBAC permission enforcement across Owner, Manager, and Employee roles.

**Why this exists**: Provide mathematical verification that no cross-tenant data leakage or privilege escalation exists in the system per NFR-SEC-04-05.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/test/security-matrix/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Matrix Suite: Executes 50+ automated security assertion scenarios across every API route.

---

## 4. Invariants & Security Guardrails

- 🔒 **Zero Tolerance**: 100% pass rate required for launch gate sign-off.

---

## 5. Implementation Steps

1. Author `tenancy-isolation.spec.ts` testing cross-tenant ID injection across all modules.
2. Author `rbac-matrix.spec.ts` testing all 22 permissions across Owner, Manager, Employee.
3. Run security matrix test suite.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Security Matrix Pass**: All multi-tenant and RBAC security tests pass with 0 failures.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- test/security-matrix

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Run `pnpm --filter api test -- test/security-matrix` and inspect pass report.

---

## 9. Expected Deliverables

Security matrix test suite in `apps/api/test/security-matrix`.
