---
id: T-BOOT-03/g
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/f
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md
files:
  - apps/api/prisma/schema.prisma
  - packages/shared/src/jsonb.ts
done_cmd: pnpm --filter api exec prisma validate
next: T-BOOT-03/h
---

# T-BOOT-03/g — Notifications, audit, JSONB Zod `12` §13–14

## Do

- Models: `notifications`, `audit_logs`.
- Align JSONB columns with Zod in `packages/shared` for the inventory in `12` §14.0 (at least `handoff_context`, decision traces, rule payload).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- §13 models present; shared Zod covers listed JSONB contracts used at migrate time.
