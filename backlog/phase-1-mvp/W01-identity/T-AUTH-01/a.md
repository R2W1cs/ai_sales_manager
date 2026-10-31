---
id: T-AUTH-01/a
parent: T-AUTH-01
wave: W1
status: done
optional: false
depends:
  - T-BOOT-06
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/auth/core/auth.controller.ts
  - apps/api/src/auth/core/auth.service.ts
  - apps/api/src/auth/auth.module.ts
  - packages/shared/src/auth/index.ts
done_cmd: pnpm --filter api test
next: T-AUTH-01/b
---

# T-AUTH-01/a — Register + login + Argon2

## Do

- `POST /api/v1/auth/register` and `POST /api/v1/auth/login` per `13` §4.
- Argon2 hashes. Min password 10. Duplicate email **409**. Failed login **401** with the **same** copy as unknown user.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Jest: 409 duplicate, 401 same body, password <10 rejected.
