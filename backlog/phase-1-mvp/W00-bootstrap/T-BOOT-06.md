---
id: T-BOOT-06
parent: T-BOOT-06
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/h
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/10_ARCHITECTURE/01-modular-monolith-domains.md
  - docs/10_engineering/13_API_DESIGN/01-conventions-dto-contracts.md
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
files:
  - apps/api/src/auth/auth.module.ts
  - apps/api/src/businesses/businesses.module.ts
  - apps/api/src/products/products.module.ts
  - apps/api/src/conversations/conversations.module.ts
  - apps/api/src/ai/ai.module.ts
  - apps/api/src/integrations/integrations.module.ts
  - apps/api/src/platform/platform.module.ts
  - apps/api/src/app.module.ts
done_cmd: pnpm exec tsc --noEmit
next: T-AUTH-01/a
---

# T-BOOT-06 — Nest module shells

## Do

- Create empty Nest modules matching `10` §4.2: auth, businesses, products, customers, conversations, ai, orders, integrations (+ meta/adapters stubs), analytics, notifications, realtime, platform.
- No cross-module Prisma model imports. Lint or a simple ESLint rule / test that fails a forbidden import.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Each listed folder exists with a module class. A reviewer can fail a cross-entity Prisma import.
