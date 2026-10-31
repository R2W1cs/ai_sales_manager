---
id: T-AUTH-06
parent: T-AUTH-06
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
  - apps/api/src/auth/strategies/google.strategy.ts
done_cmd: pnpm --filter api test -- src/auth
next: T-BIZ-01
---

# Task: Google OAuth authentication (Should)

## 1. Objective & Value

Implement Google OAuth sign-in and account linking via verified email.

**Why this exists**: Provide seamless one-click sign in for merchants.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/auth/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /auth/google` (302 Redirect) -> Google OAuth authorization URL
- `POST /auth/google/callback` (200 OK) -> Session JWT and user profile

---

## 4. Invariants & Security Guardrails

- 🔒 **Verified Email**: Auto-link accounts only when Google returns `email_verified: true`.

---

## 5. Implementation Steps

1. Create Passport Google strategy in `google.strategy.ts`.
2. Implement callback route linking or creating user account.
3. Author unit tests covering token exchange and account linking.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **OAuth Login**: Valid Google ID token logs in and returns session.

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

- **🔑 Environment variables**: Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
- **🌐 External setup**: Configure OAuth credentials in Google Cloud Console.
- **🧪 Manual QA**: Test Google sign-in redirect in browser.

---

## 9. Expected Deliverables

Google OAuth strategy and callback endpoint in auth module.
