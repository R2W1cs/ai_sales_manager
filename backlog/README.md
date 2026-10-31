# Backlog

This folder **is the coding board**. Status, order, resume, and “what to code next” live here.

Specs stay in [`docs/`](../docs/). This folder implements them. It does not copy acceptance criteria, routes, or widgets.

[`docs/30_execution/30_TASKS.md`](../docs/30_execution/30_TASKS.md) is the **parent-id + FR coverage catalog** (what exists, wave, size). It is not the live board: no `status`, no session cursor, no `/a` `/b` splits. Do not run a parallel sprint board.

Child ids (`T-BOOT-01/a`) exist only here. Never add them to `30`.

## Step-by-Step Runner CLI

Execute the backlog card-by-card using `backlog/_runner.py`:

| Command                                                        | Action                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `python3 backlog/_runner.py status`                            | Show overall progress, active cursor, and ready unblocked leaves                         |
| `python3 backlog/_runner.py current`                           | Print full details of current cursor leaf (specs, allowlist, Do/Don't, cmd)              |
| `python3 backlog/_runner.py info <leaf_id>`                    | Print full details for any specific card                                                 |
| `python3 backlog/_runner.py ready`                             | List all tasks whose dependencies are satisfied                                          |
| `python3 backlog/_runner.py start [<leaf_id>]`                 | Verify dependencies and set `status: in_progress`                                        |
| `python3 backlog/_runner.py verify [<leaf_id>]`                | Execute the card's `done_cmd`                                                            |
| `python3 backlog/_runner.py complete [<leaf_id>]`              | Run verify, mark `done`, advance cursor, log to `LOG.md`, refresh INDEX, update graphify |
| `python3 backlog/_runner.py block [<leaf_id>] --reason <text>` | Set `status: blocked` and record blocker on cursor                                       |
| `python3 backlog/_runner.py skip <leaf_id>`                    | Skip optional Should leaf and advance cursor                                             |
| `python3 backlog/_runner.py reset-cursor <leaf_id>`            | Point cursor to specific leaf                                                            |

## Session Protocol

1. **Inspect**: `python3 backlog/_runner.py current` (or read [`CURSOR.md`](CURSOR.md)).
2. **Start**: `python3 backlog/_runner.py start` (sets `status: in_progress`).
3. **Read**: Read that leaf’s `read:` list (max 5), then touch only allowlisted `files:` (plus a colocated `*.spec.ts` beside any of those paths).
4. **Verify**: `python3 backlog/_runner.py verify` (runs `done_cmd`).
5. **Complete**: `python3 backlog/_runner.py complete --note "..."` (marks `done`, advances `CURSOR.md` to `next`, refreshes `INDEX.md`, logs to `LOG.md`, updates graphify).
6. **Block**: If blocked on external wait, `python3 backlog/_runner.py block --reason "..."`.

`next` is the default serial path. You may start another leaf **only** if its `depends` are `done` (`31` parallel lanes). Completing a parallel leaf (`python3 backlog/_runner.py complete <leaf_id>`) does **not** move `CURSOR.md`. `T-WEB-01` / `T-WEB-05` may start after `W1` on the real auth API. `T-OPS-01` may start after `T-BOOT-04`. `T-OPS-04` may start after `T-AUTH-02`.

Skip `optional: true` for the launch gate (`03` §10.1). Mark them `skipped` if you pass. Required leaves never `depends:` on an optional leaf.

## Split rules

| `30` size | Card                                    |
| --------- | --------------------------------------- |
| **S / M** | One leaf file in the wave folder. Stop. |
| **L**     | Parent + 2–4 leaves.                    |
| **XL**    | Parent + 4–8 leaves.                    |

A leaf is the right size when it has one primary spec section, ≤8 `files:`, one `done_cmd`, and does not mix API with full inbox UI.

## Status values

`pending` | `in_progress` | `done` | `blocked` | `skipped`

Parents (L/XL) close when every **required** child is `done`. `--refresh` rolls that up.

## Forbidden on every card

MSW, new `C-*`, extra routes, Storybook, Radix, Zustand, Vitest, Stripe HTTP, unofficial WhatsApp, snooze/`SNOOZED`, line-item PATCH, `POST /orders/:id/confirm`, `view=unread`, Clients/Commandes/Tableau de bord nav, Employee playground, fifth KPI, `25_DESIGN_TOKENS.md`.

Empty on purpose: `07_DOMAIN_MODEL.md`, `24_REFERENCE_SCREENS.md`.

## Phases 2–5

Closed swimlanes. Each `PHASE.md` is blocked until `04` exit + specs exist. Do not invent Shopify, WhatsApp connect, or Stripe cards.

## Generator

[`_build.py`](_build.py) + [`_tasks.py`](_tasks.py) emit the Phase 1 snapshot.

| Command                                    | Effect                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `python3 backlog/_build.py`                | Rewrite cards. **Refuses** if any card is not `pending`.                                                               |
| `python3 backlog/_build.py --force`        | Rewrite anyway (wipes live status). Also resets `CURSOR.md`.                                                           |
| `python3 backlog/_build.py --refresh`      | Safe. Rewrites [`INDEX.md`](INDEX.md) and parent/wave/phase `status` from files. Does not touch leaves or `CURSOR.md`. |
| `python3 backlog/_build.py --check`        | Depends graph, optional-blocking, `read:` paths.                                                                       |
| `python3 backlog/_build.py --check-launch` | Every **required** leaf is `done` (`T-OPS-07` `done_cmd`).                                                             |

Do not use a full emit after any `status:` change unless you pass `--force` on purpose.

## Layout

```
backlog/
  README.md
  CURSOR.md          board position
  LOG.md             append-only session log
  INDEX.md           every card id + status snapshot
  _runner.py         step-by-step execution CLI tool
  _build.py          board generator and refresh utility
  _tasks.py          Phase 1 tasks definition
  _templates/
  phase-1-mvp/       W00–W10 — live Phase 1 cards
  phase-2-catalog-whatsapp/PHASE.md
  phase-3-depth/PHASE.md
  phase-4-payments/PHASE.md
  phase-5-platform/PHASE.md
```
