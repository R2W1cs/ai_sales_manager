---
id: T-BOOT-01/c
parent: T-BOOT-01
wave: W0
status: done
optional: false
depends:
  - T-BOOT-01/b
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md
  - docs/30_execution/30_TASKS.md
files:
  - pnpm-lock.yaml
  - package.json
  - eslint.config.js
  - prettier.config.js
  - .editorconfig
  - .prettierignore
  - .vscode/settings.json
  - scripts/check-forbidden-addons.mjs
done_cmd: "node scripts/check-forbidden-addons.mjs && pnpm exec tsc --noEmit && pnpm exec eslint . --max-warnings 0"
next: T-BOOT-02
---

# T-BOOT-01/c — Lockfile + reject forbidden addons

## Do

- Generate `pnpm-lock.yaml` from the scaffold (install locally, not via MCP).
- Confirm workspace `package.json` files have no direct Storybook, Radix UI addon, Biome, Zustand, Vitest, MSW, or Stripe deps (`scripts/check-forbidden-addons.mjs`).
- ESLint + Prettier only (`11` §2.1).

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Lockfile committed; `pnpm exec tsc --noEmit` and eslint config exist; forbidden packages absent.
