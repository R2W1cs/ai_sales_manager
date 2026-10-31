---
id: T-AUTH-05
parent: T-AUTH-05
wave: W1
status: pending
optional: true
depends:
  - T-AUTH-01/c
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/auth/core/auth.controller.ts
  - apps/api/src/auth/core/auth.service.ts
done_cmd: pnpm --filter api test -- src/auth
next: T-BIZ-01
---

# Task: Forgot / reset password flow (Should)

## 1. Objective & Value

Implement password recovery and reset flow with enumeration-safe endpoints.

**Why this exists**: Allow users to recover account access securely without leaking registered user email addresses.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/auth/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /auth/forgot` (204 No Content) -> Always returns 204 regardless of email presence.
- `POST /auth/reset` (200 OK) -> Body `{ token: string, newPassword: string }` updates Argon2id password hash.

---

## 4. Invariants & Security Guardrails

- 🔒 **No Enumeration**: Never disclose whether an email is registered in `/auth/forgot` response.
- 🛡️ **Session Invalidation**: Resetting password immediately revokes all active refresh tokens for the user.

---

## 5. Implementation Steps

1. Implement `POST /auth/forgot` generating 1-hour secure crypto token.
2. Implement `POST /auth/reset` updating password hash and deleting active sessions.
3. Author unit tests covering forgot 204 invariant and reset token validation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Forgot (204)**: Returns 204 for both existing and non-existing email.
- [ ] **Reset (200)**: Valid reset token updates password and revokes previous sessions.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/auth

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 Environment variables**: Optional SMTP credentials in `.env`.
- **🧪 Manual QA**: Test forgot password flow in Swagger.
- **👁️ Review & Sign-off**: Verify zero email enumeration leakage.

---

## 9. Expected Deliverables

Password recovery endpoints in auth module.
