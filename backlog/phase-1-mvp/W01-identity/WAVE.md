---
id: W1
phase: phase-1-mvp
status: done
---

# W1 — Identity and workspace

Start constraint from `30` §5, not a sprint name. Calendar is `31`.

**First card in this wave (depends-ready order):** [`T-AUTH-01/a`](T-AUTH-01/a.md)

## Cards

- [`T-AUTH-01/a`](T-AUTH-01/a.md) — Register + login
- [`T-AUTH-01/b`](T-AUTH-01/b.md) — Refresh + logout + me
- [`T-AUTH-01/c`](T-AUTH-01/c.md) — Auth invariant tests
- [`T-AUTH-02/a`](T-AUTH-02/a.md) — TenantGuard
- [`T-AUTH-02/b`](T-AUTH-02/b.md) — PermissionsGuard + decorator
- [`T-AUTH-02/c`](T-AUTH-02/c.md) — Tenancy + RBAC Jest
- [`T-AUTH-03`](T-AUTH-03.md) — Accept invitation API (`POST /auth/invitations/accept`)
- [`T-AUTH-04`](T-AUTH-04.md) — Auth rate limiting / throttles 5/min
- [`T-AUTH-05`](T-AUTH-05.md) — Forgot / reset password flow (Should) _(optional)_
- [`T-AUTH-06`](T-AUTH-06.md) — Google OAuth authentication (Should) _(optional)_
- [`T-BIZ-01`](T-BIZ-01.md) — Business workspace creation (`POST /businesses`) + seed agent, ai_settings, rules, onboarding
- [`T-AI-10`](T-AI-10.md) — AI Agent configuration & settings CRUD (`/ai/agents/:id`, `/ai/settings`)
- [`T-BIZ-02`](T-BIZ-02.md) — Business profile management API (`GET/PATCH /businesses/:id`)
- [`T-BIZ-03`](T-BIZ-03.md) — Members + invitations management (`/businesses/:id/members`, `/invitations`)
- [`T-BIZ-04`](T-BIZ-04.md) — Onboarding completion & state management (`/businesses/:id/onboarding`)
- [`T-BIZ-06`](T-BIZ-06.md) — Feature flags API (`GET/PATCH /businesses/:id/flags`)
- [`T-BIZ-07`](T-BIZ-07.md) — Audit logging service & events repository (`/businesses/:id/audit-logs`)
- [`T-BIZ-08`](T-BIZ-08.md) — Soft-delete business workspace (Should) _(optional)_
