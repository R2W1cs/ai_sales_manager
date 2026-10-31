---
id: T-BOOT-01/b
parent: T-BOOT-01
wave: W0
status: done
optional: false
depends:
  - T-BOOT-01/a
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/18_DEPLOYMENT/01-infrastructure-topology-ecs.md
  - docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md
files:
  - apps/worker
  - apps/api/Dockerfile
  - pnpm-workspace.yaml
  - package.json
done_cmd: test -d apps/worker
next: T-BOOT-01/c
---

# T-BOOT-01/b — Worker process same Nest image

## Do

- Add `apps/worker` (or equivalent entry) that uses the **same** Nest image as `apps/api` (`18` §1, `11`). Different entrypoint only.
- Workspace packages: `apps/api`, `apps/web`, `apps/worker`, `packages/shared`, `packages/config`.

## Do not

- MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe, unofficial WhatsApp.
- snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`.
- Clients / Commandes / Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

## Done when

- Worker package exists; Dockerfile/image name shared with API; no fourth app.
