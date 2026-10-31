---
id: T-BOOT-03/c
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/b
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
files:
  - apps/api/prisma/schema.prisma
done_cmd: pnpm --filter api exec prisma validate
next: T-BOOT-03/d
---

# T-BOOT-03/c — Catalog and customers `12` §6–7

## Do

- Models: categories, products, variants, images, stock_reservations, catalog_import_runs, customers, identities, tags, notes.
- Price and stock live on **variants** only. Skip `inventory_movements` unless `12` marks it Should and you are adding it unused.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- §6–7 models present; `availableStock` is not a stored column (`12` §2.8).
