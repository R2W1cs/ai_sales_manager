---
id: T-BOOT-02
parent: T-BOOT-02
wave: W0
status: done
optional: false
depends:
  - T-BOOT-01/c
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/13_API_DESIGN/01-conventions-dto-contracts.md
  - docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md
files:
  - packages/shared/src/error.ts
  - packages/shared/src/pagination.ts
  - packages/shared/src/money.ts
  - packages/shared/src/index.ts
  - packages/shared/src/error.spec.ts
done_cmd: "pnpm exec tsc --noEmit && pnpm --filter api test"
next: T-BOOT-03/a
---

# T-BOOT-02 — Shared Zod envelope, money, cursor

## Do

- In `packages/shared`, define Zod for `13` §2.6 error envelope, §2.7 pagination cursor, §2.8 money/dates/enums.
- JSONB contracts that already exist in `12` §14 start here as shared schemas (only the cross-cutting ones this leaf needs: envelope + cursor + money).
- API and web import from this package — no duplicated DTO types.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- `apps/api` and `apps/web` import envelope + cursor + money from `packages/shared`. Jest (or a type test) covers a sample error body.
