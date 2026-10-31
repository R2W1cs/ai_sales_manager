---
id: T-WEB-01
parent: T-WEB-01
wave: W8
status: done
optional: false
depends:
  - T-AUTH-01/c
  - T-AUTH-03
fs:
  - FS-WEB-01
read:
  - docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md
  - docs/20_design/23_UI_COMPONENTS/02-primitives-shared-atoms-shell.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/web/src/app/(auth)/layout.tsx
  - apps/web/src/app/(auth)/login/page.tsx
  - apps/web/src/app/(auth)/register/page.tsx
  - apps/web/src/app/(auth)/invite/page.tsx
  - apps/web/src/components/auth/login-form.tsx
  - apps/web/src/components/auth/register-form.tsx
  - apps/web/src/components/auth/accept-invite-form.tsx
  - apps/web/src/components/auth/error-banner.tsx
  - apps/web/src/components/auth/password-strength-meter.tsx
  - apps/web/src/components/auth/auth-card-shell.tsx
  - apps/web/src/components/auth/auth-schemas.ts
  - apps/web/src/components/layout/language-switcher.tsx
  - apps/web/src/components/providers.tsx
  - apps/web/src/providers/auth-provider.tsx
  - apps/web/src/hooks/use-auth.ts
  - apps/web/src/lib/api-client.ts
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-02
---

# Task: Web authentication UI (login, register, accept invite, session provider)

## 1. Objective & Value

Implement web authentication interface pages (login, registration, invite acceptance) with React Hook Form, Zod validation, session provider, and resilient 401 token refresh queue.

**Why this exists**: Allow merchants and invited team members to sign in and authenticate securely on the web application without session dropouts.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(auth)/`
- `apps/web/src/components/auth/`
- `apps/web/src/components/layout/language-switcher.tsx`
- `apps/web/src/components/providers.tsx`
- `apps/web/src/providers/auth-provider.*`
- `apps/web/src/hooks/use-auth.*`
- `apps/web/src/lib/api-client.*`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- `/login`: Email/password form with error banner for invalid credentials (generic error copy).
- `/register`: Name, email, password (min 10 chars) with strength meter.
- `/invite?token=...`: Tokenized onboarding form for invited staff.
- `AuthProvider` & `apiClient`:
  - Access token held strictly in React context memory (zero `localStorage` tokens).
  - Refresh token stored in HTTP-only Secure cookie (`SameSite=Lax`, `credentials: 'include'`).
  - **401 Retry Mutex Queue**: On 401 response, apiClient pauses incoming requests in a promise queue, executes `POST /api/v1/auth/refresh`, updates in-memory token, and re-dispatches queued requests.
  - If refresh fails (401/403), clears session and redirects to `/login`.

---

## 4. Invariants & Security Guardrails

- 🔒 **Zero LocalStorage Tokens**: Access token in React memory; refresh token in HTTP-only cookie.
- 🛡️ **No Cross-Boundary Imports**: Never import from `apps/api/src/`.
- 🔄 **Race-Free Refresh**: Concurrent 401s must not trigger multiple refresh HTTP calls.

---

## 5. Implementation Steps

1. Implement `apiClient` with 401 interceptor and request queue.
2. Implement `AuthProvider` and `useAuth()` hook managing session state.
3. Implement login page with form validation and generic error handling.
4. Implement register page with password requirements and strength meter.
5. Implement invite acceptance page reading `?token=` query param.
6. Author component and hook tests verifying session transitions and 401 refresh retries.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Login Page**: Successful login sets in-memory session and redirects to `/inbox` or `/onboarding`.
- [ ] **401 Silent Refresh**: Expired access token triggers silent refresh and retries the original API request without flaking or redirecting.
- [ ] **Register Page**: Registration creates account and launches onboarding.
- [ ] **Invite Page**: Valid token accepts invite and redirects to dashboard.

---

## 7. Verification Commands

```bash
# 1. Run typecheck & lint
pnpm --filter web check-types && pnpm --filter web lint

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA & Smoke test**: Open `http://localhost:3000/login` and `/register` in browser; test sign-in with valid and invalid credentials.
- **👁️ Review & Sign-off**: Verify zero sensitive tokens stored in `localStorage`.

---

## 9. Expected Deliverables

Auth pages, hooks, apiClient with 401 retry queue, and session provider in `apps/web`.
