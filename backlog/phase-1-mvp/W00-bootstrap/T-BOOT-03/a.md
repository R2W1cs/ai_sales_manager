---
id: T-BOOT-03/a
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-02
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/01-rules-enums-er.md
  - docs/00_product/06_AI_HUMAN_HANDOFF_RULES/01-triggers-briefing.md
files:
  - apps/api/prisma/schema.prisma
  - packages/shared/src/enums.ts
done_cmd: pnpm --filter api exec prisma validate
next: T-BOOT-03/b
---

# T-BOOT-03/a — Prisma enums from `12` §3

## Do

- Add every enum in `12` §3 to Prisma. Closed sets only.
- `escalation_reason` is text + Zod in shared — **not** a Postgres CHECK that will drift from `06`.
- No `SNOOZED`, no fulfilment `PROCESSING`/`SHIPPED`/`DELIVERED`.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Prisma enum block matches `12` §3. `prisma validate` succeeds.
