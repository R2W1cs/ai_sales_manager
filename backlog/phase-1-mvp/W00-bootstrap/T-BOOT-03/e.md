---
id: T-BOOT-03/e
parent: T-BOOT-03
wave: W0
status: done
optional: false
depends:
  - T-BOOT-03/d
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
files:
  - apps/api/prisma/schema.prisma
done_cmd: pnpm --filter api exec prisma validate
next: T-BOOT-03/f
---

# T-BOOT-03/e — Orders, knowledge, embeddings `12` §9–10

## Do

- Models: `orders`, `order_items`, `knowledge_documents`, `embeddings` (pgvector).
- Enable `pgvector` per `12` §2.10. Embedding dimension 1536 (`11` embeddings pin).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- §9–10 models present; vector column compiles with the Prisma pgvector pin.
