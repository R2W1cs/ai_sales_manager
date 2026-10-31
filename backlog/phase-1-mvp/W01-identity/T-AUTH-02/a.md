---
id: T-AUTH-02/a
parent: T-AUTH-02
wave: W1
status: done
optional: false
depends:
  - T-AUTH-01/c
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
  - docs/10_engineering/10_ARCHITECTURE/02-flow-tenancy-topology.md
files:
  - apps/api/src/platform/security/tenant.guard.ts
  - apps/api/src/auth/auth.module.ts
done_cmd: pnpm --filter api test
next: T-AUTH-02/b
---

# T-AUTH-02/a — X-Business-Id tenant resolution

## Do

- Tenant from `X-Business-Id` (`13` §2.4). Membership required.
- Wrong tenant → 403. UI hiding is not authZ (`17`).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Guard rejects missing/foreign business id with 403.
