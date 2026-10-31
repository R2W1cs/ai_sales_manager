---
id: T-BOOT-03/f
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/e
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
files:
  - apps/api/prisma/schema.prisma
done_cmd: pnpm --filter api exec prisma validate
next: T-BOOT-03/g
---

# T-BOOT-03/f — AI, billing, flags, analytics `12` §11–12

## Do

- Models: `ai_agents`, `ai_settings`, `ai_prompts`, `ai_actions`, `ai_decision_traces`, `ai_usage`, `ai_feedback`, `ai_evaluations`, `plans`, `subscriptions`, `usage_events`, `usage_aggregates`, `analytics_daily`, `feature_flags`.
- `ReplyMode` includes `draft_only` as an enum value (Should behaviour is later).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- §11–12 models present. No fifth KPI column on `analytics_daily`.
