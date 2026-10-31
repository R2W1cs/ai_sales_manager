---
id: T-AUTH-01/b
parent: T-AUTH-01
wave: W1
status: done
optional: false
depends:
  - T-AUTH-01/a
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
files:
  - apps/api/src/auth/core/auth.controller.ts
  - apps/api/src/auth/core/auth.service.ts
  - apps/api/src/auth/core/refresh.ts
done_cmd: pnpm --filter api test
next: T-AUTH-01/c
---

# T-AUTH-01/b — Refresh cookie + logout + me

## Do

- `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Refresh cookie name `aisales_refresh` (`13` §4, `17`). Rotation on refresh.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Jest: refresh rotates; logout clears cookie; me requires session.
