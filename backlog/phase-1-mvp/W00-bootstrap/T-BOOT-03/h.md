---
id: T-BOOT-03/h
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/g
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/01-rules-enums-er.md
  - docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md
files:
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/migrations
done_cmd: pnpm --filter api exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
next: T-BOOT-04
---

# T-BOOT-03/h — Indexes + first forward-only migration

## Do

- Add indexes named in `12` (tenant + hot paths). No invented indexes.
- First forward-only migration. No edit-in-place of applied SQL.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- `prisma migrate dev` applies locally against Compose Postgres (or `migrate deploy` if Compose is not up yet — then this leaf stays blocked on `T-BOOT-04` Compose Postgres). Prefer: schema valid + migration file committed.
