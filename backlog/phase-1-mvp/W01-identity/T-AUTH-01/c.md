---
id: T-AUTH-01/c
parent: T-AUTH-01
wave: W1
status: done
optional: false
depends:
  - T-AUTH-01/b
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
files:
  - apps/api/src/auth/core/auth.controller.spec.ts
done_cmd: pnpm --filter api test
next: T-AUTH-02/a
---

# T-AUTH-01/c — Auth error and password tests

## Do

- Finish FR-AUTH-001–005 / 010 tests: duplicate 409, login 401 same copy, min password 10.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Jest file covers those three invariants.
