---
id: T-BOOT-01/a
parent: T-BOOT-01
wave: W0
status: done
optional: false
depends: []
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md
  - docs/10_engineering/10_ARCHITECTURE/01-modular-monolith-domains.md
  - .agents/skills/better-fullstack/SKILL.md
files:
  - package.json
  - pnpm-workspace.yaml
  - apps/api
  - apps/web
  - packages/shared
  - packages/config
done_cmd: "test -d apps/api && test -d apps/web && test -f pnpm-workspace.yaml"
next: T-BOOT-01/b
---

# T-BOOT-01/a — BFS scaffold (no install)

## Do

- Scaffold TypeScript Better Fullstack with pins in `11` §2.1: Next + Nest 11 + Prisma 7 + pnpm + Compose + GHA + tanstack-query + eslint + prettier.
- Use `--no-install`. Do not hand-roll a second starter.
- Follow the Better Fullstack skill / MCP: `bfs_get_guidance` → compatibility → `bfs_plan_project` → `bfs_create_project`. Dependency install is skipped in MCP — lockfile is a later leaf.

## Do not

- Do not pass `--install`. Not Biome, Storybook, Radix, Zustand, Vitest, Stripe, `backend: self`.
- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Repo has `apps/api`, `apps/web`, `packages/shared` (or BFS equivalent) matching `11` §2.1. No forbidden addons in the scaffold config.
