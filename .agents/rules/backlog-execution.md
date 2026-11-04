---
description: Backlog execution protocol for step-by-step implementation of tasks
alwaysApply: true
---

# Backlog Execution Protocol

Every coding session in this repository must operate on cards from `backlog/` using the step-by-step runner workflow.

## Rules

1. **Check Position First**: Always inspect `backlog/CURSOR.md` or run `python3 backlog/_runner.py current` before coding.
2. **Never Skip Dependencies**: Never start or implement a leaf whose `depends:` are not `done`.
3. **Boundaries**: Touch ONLY allowlisted `files:` on the leaf card (plus colocated `*.spec.ts`). Read ONLY the specs listed in `read:`.
4. **No Forbidden Stack / Features**:
   - Monorepo pins: Nest 11, Next 16, Prisma 7, pnpm workspaces, Base UI / Tailwind (not Radix/Biome/Vitest/Storybook/Zustand).
   - No unofficial WhatsApp, no Stripe HTTP in MVP, no snooze / SNOOZED, no line-item PATCH, no `POST /orders/:id/confirm`, no `view=unread`.
5. **Verification & Completion**:
   - Always run `python3 backlog/_runner.py verify` to execute `done_cmd`.
   - On success, complete with `python3 backlog/_runner.py complete --note "..."`.
   - This automatically advances `CURSOR.md`, logs to `LOG.md`, updates `INDEX.md`, and runs `graphify update .`.
6. **Strict Single-Task Limit (One Task Per Run)**:
   - Each backlog execution run or `/exec-backlog` session must implement and complete **EXACTLY ONE** task card.
   - Once `python3 backlog/_runner.py complete` (and any wave completion gate) finishes, the agent must **STOP IMMEDIATELY**.
   - **NEVER** automatically start, scaffold, or begin implementing the next card in the same run without explicit user instructions.
