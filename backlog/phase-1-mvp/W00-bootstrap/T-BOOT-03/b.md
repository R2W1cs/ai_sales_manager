---
id: T-BOOT-03/b
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/a
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
files:
  - apps/api/prisma/schema.prisma
done_cmd: pnpm --filter api exec prisma validate
next: T-BOOT-03/c
---

# T-BOOT-03/b — Identity and workspace tables `12` §5

## Do

- Models: `users`, `refresh_tokens`, `invitations`, `roles`/`permissions`/`role_permissions`, `businesses`, `business_members`, `business_onboarding`, `business_rules`, `idempotency_keys`.
- Should tables `password_reset_tokens` and `oauth_accounts` may exist in schema (unused until `T-AUTH-05/06`).
- Every tenant table has `business_id` (`12` §2.2).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Schema contains §5 models with composite tenant FKs as specified. No extra identity tables.
