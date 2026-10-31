---
id: T-BOOT-03/d
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/c
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
files:
  - apps/api/prisma/schema.prisma
done_cmd: pnpm --filter api exec prisma validate
next: T-BOOT-03/e
---

# T-BOOT-03/d — Integrations and conversations `12` §8

## Do

- Models: `channel_accounts`, `message_templates` (schema only, unused), `integration_events`, `conversations`, `conversation_status_events`, `messages`, `message_attachments`, `conversation_notes`, `conversation_assignments`.
- `ConversationStatus` has no `SNOOZED`. `SenderType` includes `human` (not `user`).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- §8 models present; WhatsApp is an enum value, not a live integration.
