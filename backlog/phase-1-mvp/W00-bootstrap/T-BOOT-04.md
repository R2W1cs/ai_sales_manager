---
id: T-BOOT-04
parent: T-BOOT-04
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/h
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md
  - docs/10_engineering/11_TECH_STACK/02-backend-db-realtime.md
  - docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md
files:
  - docker-compose.yml
  - apps/api/prisma/seed.ts
  - .env.example
done_cmd: docker compose config
next: T-BOOT-05
---

# T-BOOT-04 — Compose + seed demo business

## Do

- Compose services: Postgres 16 + pgvector, Redis 7, MinIO, api, worker, web (`11`, `18` §16).
- Seed one demo business. Playground/`is_test` rows must be excludable from KPIs (`12` §2.6).
- One command up (`docker compose up`).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- `docker compose up` starts the stack; seed creates a tenant; no KPI pollution from `is_test`.
