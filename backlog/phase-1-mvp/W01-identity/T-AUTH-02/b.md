---
id: T-AUTH-02/b
parent: T-AUTH-02
wave: W1
status: done
optional: false
depends:
  - T-AUTH-02/a
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
files:
  - apps/api/src/platform/security/permissions.guard.ts
  - apps/api/src/platform/security/permissions.ts
done_cmd: pnpm --filter api test
next: T-AUTH-02/c
---

# T-AUTH-02/b — RBAC permission guards

## Do

- Permission codes `13` §2.11. Missing perm → 403.
- Attach to controllers; do not invent codes.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- At least one protected route returns 403 without perm.
