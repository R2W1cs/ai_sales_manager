---
id: T-BOOT-05
parent: T-BOOT-05
wave: W0
status: done
optional: false
depends:
  - T-BOOT-01/c
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md
  - docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md
  - docs/10_engineering/10_ARCHITECTURE/01-modular-monolith-domains.md
files:
  - .github/workflows/ci.yml
done_cmd: test -f .github/workflows/ci.yml
next: T-BOOT-06
---

# T-BOOT-05 — GitHub Actions quality gates

## Do

- GHA: ESLint, `tsc --noEmit`, Jest, Playwright install, vuln scan (`NFR-SEC-08`).
- PRs fail on typecheck + lint. Not Biome. Playwright may install browsers without running the full inbox spec yet.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Workflow file exists; a dry run of the typecheck/lint jobs is documented in the README or workflow comments.
