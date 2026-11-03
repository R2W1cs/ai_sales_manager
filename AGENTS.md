# Agent instructions

The live coding board is [`backlog/`](backlog/). Specs stay in [`docs/`](docs/).

## Every session (Automated Runner Protocol)

The step-by-step backlog execution is managed with `python3 backlog/_runner.py`:

1. **Inspect current task & QA plan**: `python3 backlog/_runner.py current` (and `python3 backlog/_runner.py qa`).
2. **Start & Scaffold TDD test**: `python3 backlog/_runner.py start` + `python3 backlog/_runner.py scaffold`.
3. **Read specs**: Read the leaf’s `read:` list (max 5 files), then implement ONLY allowlisted `files:` (plus colocated `*.spec.ts`).
4. **Verify & Audit (Test Everything)**: Run `pnpm test:everything` (or `python3 backlog/_runner.py test-everything`) to execute all 8 quality gates (leaf done_cmd, check-arch, forbidden addons, oxfmt/oxlint, typecheck, unit/integration tests, live API smoke probes, Playwright browser E2E, and React Doctor).
5. **Human smoke test**: Verify manual steps from `python3 backlog/_runner.py qa`.
6. **Complete & Stop**: `python3 backlog/_runner.py complete --note "Summary of changes"` (marks `done`, advances `CURSOR.md` to `next`, refreshes `INDEX.md`, logs to `LOG.md`, updates `graphify`). **STOP HERE**: Strictly ONE task per run. Do NOT start or scaffold the next task in the same session.
7. **Wave Completion Testing Gate (End of Wave)**: Upon completing the final card of any Wave (W0-W10), run the complete automated test suite (`pnpm check:full`, all unit, integration, and E2E smoke tests for that wave's domain) to verify wave integrity before finishing the session.
8. **On blocker**: `python3 backlog/_runner.py block --reason "Reason for blocker"` (marks `blocked`, sets `blocked_by` on cursor).

## Rules

- **Strictly ONE task per run**: Each session executes at most one backlog card. Once `complete` finishes, stop immediately and report results. Never automatically start the next card.
- [`backlog/`](backlog/) is the backlog. [`docs/30_execution/30_TASKS.md`](docs/30_execution/30_TASKS.md) is the parent-id + FR catalog, not the live board.
- Child ids (`T-BOOT-01/a`) exist only under `backlog/`. Never add them to `30`.
- `next` is the default serial path. You may start another leaf **only** if its `depends` are `done` (`python3 backlog/_runner.py lanes` shows parallel lanes). Completing a parallel leaf (`python3 backlog/_runner.py complete <leaf_id>`) does not move `CURSOR.md`.
- Skip `optional: true` leaves for the launch gate (`03` §10.1) via `python3 backlog/_runner.py skip <leaf_id>`. Required work never waits on a Should leaf.
- Do not invent routes, widgets, or stack. Bind to `13` / `12` / `23` / `11`.
- Frontend styling & design tokens: In `apps/web/`, always write in **Tailwind v4 syntax** (CSS-first `@theme inline`, `@custom-variant dark`, modern slash opacity modifiers e.g. `bg-primary/50`). All styling must strictly use **design tokens from `apps/web/src/index.css`** (`bg-background`, `text-foreground`, `bg-card`, `bg-popover`, `bg-primary`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-destructive`, `bg-warning`, `bg-success`, `border-border`, `border-input`, `ring-ring`, `rounded-lg/md/sm`, `font-sans`, `sidebar-*`, `chart-*`) rather than arbitrary/hardcoded hex, rgb, or raw palette colors (e.g. `text-gray-500`, `bg-blue-600`).
- Frontend components & registry: In frontend tasks (`apps/web`), always use the `shoogle` MCP server (`search_registry_items_scoped`) and prioritize the `devl` registry (`@devl` / `devl.dev`) for Base UI and Tailwind compatibility (see [`.agents/rules/frontend-components.md`](.agents/rules/frontend-components.md)).
- Frontend translations & RTL: Always translate components. In `apps/web/`, zero hardcoded UI strings are permitted. Every user-facing label, placeholder, and accessible name must use `next-intl` with 100% key parity across `fr.json`, `ar.json`, and `en.json`, and layouts must use CSS logical properties (`inset-s`/`inset-e`, `ms`/`me`, `ps`/`pe`, `border-s`/`border-e`, `text-start`/`text-end`) for Arabic RTL support (see [`.agents/rules/frontend-i18n.md`](.agents/rules/frontend-i18n.md)).
- Empty on purpose: `docs/00_product/07_DOMAIN_MODEL.md`, `docs/20_design/24_REFERENCE_SCREENS.md`.
- After code changes: `graphify update .` (AST-only).
