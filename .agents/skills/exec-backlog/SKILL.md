---
name: exec-backlog
description: Step-by-step workflow for executing Phase 1 backlog tasks according to the project specifications and constraints. Executes strictly ONE backlog task per run. Use when the user asks to implement, execute, or continue the backlog, work on the next backlog task, or run backlog execution.
---

# Backlog Execution Workflow

This skill executes Phase 1 backlog cards step-by-step using the canonical `backlog/` board and the `backlog/_runner.py` tool.

> [!IMPORTANT]
> **Strict Invariant: Exactly One Card Per Run**
> Each `/exec-backlog` run or agent session must implement and complete **EXACTLY ONE** backlog task card.
> Once Step 7 (Complete Task) — and Step 8 if at the final card of a wave — finishes, the agent MUST **STOP IMMEDIATELY**.
> Do NOT call `start`, `scaffold`, or inspect the next task card in the same session. Report the completed work, present human QA instructions, and await user direction.

---

## The 7-Step Gold Standard Execution Cycle

Every backlog task strictly follows this 7-step cycle:

```
[1. Inspect] ──> [2. Start & Scaffold] ──> [3. Read Specs] ──> [4. Implement Scope] ──> [5. Verify & Audit] ──> [6. Human QA] ──> [7. Complete]
```

---

### Step 1: Inspect Current Task & QA Plan

Inspect the active card from `CURSOR.md`:

```bash
# 1. Print full card metadata, contracts, and guardrails
python3 backlog/_runner.py current

# 2. View 1-click human QA plan and local dashboards
python3 backlog/_runner.py qa
```

Review the output:
- **Leaf ID & Title**: Exact unit of work for this session.
- **Dependencies**: Confirm all dependencies are marked `✓ DONE`.
- **Technical Contract**: Exact HTTP endpoints, DTO shapes, and status codes.
- **Invariants & Security Guardrails**: Multi-tenant isolation (`WHERE business_id = ...`) and RBAC permissions.
- **Read List**: Exact specification documents to reference (max 5).
- **Files Allowlist**: Explicit paths you are permitted to touch (plus colocated `*.spec.ts`).
- **Human Contribution**: API keys/env vars, external dashboard URLs, and manual smoke test instructions.

---

### Step 2: Start Task & Scaffold TDD Test Suite

1. Mark the task as `in_progress` in the card frontmatter and update `CURSOR.md`:

```bash
python3 backlog/_runner.py start
```

_Note: If any dependencies are still pending, the runner will refuse to start and list the blockers._

2. Automatically scaffold the test suite from the card's acceptance criteria for pure TDD development:

```bash
python3 backlog/_runner.py scaffold
```

- Generates skeleton `*.spec.ts` files containing pre-filled `describe()` and `it()` assertion blocks directly mapped from the card's **`## 6. Acceptance Criteria & Test Scenarios`**.
- Eliminates missing edge cases and validates 400 (bad input), 403 (tenancy/RBAC), and 409 (conflict) branches.

---

### Step 3: Read Specifications

Use the `Read` tool on the exact files listed in `read:` on the card (maximum 5 files).

- Trace every entity schema, route shape, and UI requirement to frozen docs in `docs/`.
- Do not guess or invent fields, routes, models, or types.

---

### Step 4: Implement Scope

Implement the required functionality strictly within the allowlisted `files:` (plus colocated test files):

- **Touch ONLY files in the allowlist**.
- Follow the **Technical Contract** and **Invariants** specified on the task card.
- Enforce **Multi-Tenant Isolation**: Every database query must filter by `business_id = request.tenantId`.
- Enforce **RBAC Rigor**: Guard state-changing endpoints with `@RequirePermission(...)` from the 22 closed permissions list.
- Adhere to the **Global Prohibitions**:
  - No MSW, no second test framework (Vitest forbidden in API; use Jest / Playwright).
  - No Radix custom overrides, no Storybook, no Biome, no Zustand, no Stripe HTTP.
  - No unofficial WhatsApp scraping clients (`baileys`, `whatsapp-web.js`).
  - No `snooze` / `SNOOZED` status.
  - No line-item PATCH, no `POST /orders/:id/confirm`, no `view=unread`.
  - No Employee playground, no fifth KPI tile.

---

### Step 5: Verify Quality, Invariants & Architecture Gate (Test Everything)

Run the unified 8-gate verification suite:

```bash
pnpm test:everything
```
*(Or run `python3 backlog/_runner.py test-everything`)*

This master runner deterministically validates all quality dimensions:
1. **Leaf `done_cmd`**: Acceptance tests for the current card.
2. **Architecture & Addon Guard**: `check-arch` + `check-forbidden-addons.mjs`.
3. **Formatting & Linting**: `oxfmt --check` + `oxlint` across 660+ files.
4. **Typecheck**: Full monorepo TypeScript verification (`pnpm check:types`).
5. **Unit & Integration Tests**: `@app/shared` and `apps/api` test suites.
6. **Live API Smoke Probes**: Fastify root, auth session, and conversations endpoints.
7. **Playwright Browser E2E**: Headless Chromium browser automation (`inbox.spec.ts` & `auth.spec.ts`).
8. **React Doctor Audit**: Strict zero-issue React diagnostics in `apps/web`.

For rapid intermediate cycles during development, you may use `pnpm test:everything --fast` or `pnpm fix && pnpm check:full`.

---

### Step 6: Human QA & Smoke Testing

Display the human QA instructions and verify with the user:

```bash
python3 backlog/_runner.py qa
```

- If external credentials or `.env` variables are needed, prompt the user.
- Provide direct URLs for manual smoke testing (e.g. Swagger at `http://localhost:3001/api/docs`, Prisma Studio at `http://localhost:5555`, Web app at `http://localhost:3000`).

---

### Step 7: Complete Task & Stop

When all verification steps pass, mark the card as complete:

```bash
python3 backlog/_runner.py complete --note "Brief summary of what was implemented"
```

This command automatically:
1. Re-verifies `done_cmd` exits 0.
2. Updates the leaf card frontmatter to `status: done`.
3. Advances `backlog/CURSOR.md` to the next required leaf.
4. Appends a session record to `backlog/LOG.md`.
5. Refreshes `backlog/INDEX.md`, wave status, and phase status via `_build.py --refresh`.
6. Updates the AST knowledge graph via `graphify update .`.

> [!CAUTION]
> **MANDATORY STOP POINT**: Do NOT begin the next task!
> Conclude the run now. Report to the user:
> - Summary of completed work.
> - Verification test results.
> - Human QA instructions (from Step 6).
> - The next queued leaf ID.
> Wait for explicit user instructions before beginning another task.

---

### Step 8: Wave Completion Testing Gate (End of Wave)

Whenever the completed task is the final card of a wave (W0 through W10), the agent MUST run a comprehensive wave-wide testing suite before concluding the session:

1. **Full Workspace Check**: `pnpm check:full`
2. **Domain Integration Test Run**: Run all tests for the modules touched in this wave (`pnpm --filter api test`, `pnpm --filter shared test`, etc.).
3. **Automated End-to-End / CLI Smoke Verification**: Execute automated CLI verification of the wave's key user journeys (authentication, tenant isolation, catalog, integrations, etc.).
4. **Architectural Guard**: `python3 backlog/_runner.py check-arch`
5. Report the full wave testing summary to the user, then **STOP**.

---

## Multi-Agent Parallel Lane Execution

To work on independent parallel branches without merge conflicts:

1. **Check Live Lane Status**:
   ```bash
   python3 backlog/_runner.py lanes
   ```
   Displays the 6 independent execution lanes:
   - **Lane A**: Knowledge & RAG (`T-KNOW-01` -> `T-KNOW-03`)
   - **Lane B**: Catalog Management (`T-CAT-01` -> `T-CAT-04`)
   - **Lane C**: Channels & Meta Integration (`T-INT-01` -> `T-INT-07`)
   - **Lane D**: Customer CRM (`T-CUST-01` -> `T-CUST-04`)
   - **Lane E**: Production Infra & Ops (`T-OPS-01` -> `T-OPS-06`)
   - **Lane F**: Frontend Web P0 (`T-WEB-01` -> `T-WEB-06`)

2. **Start and Scaffold a Parallel Leaf**:
   ```bash
   python3 backlog/_runner.py start <leaf_id>
   python3 backlog/_runner.py scaffold <leaf_id>
   ```

3. **Verify and Complete Parallel Leaf**:
   ```bash
   python3 backlog/_runner.py verify <leaf_id>
   python3 backlog/_runner.py complete <leaf_id> --note "..."
   ```
   _Completing a parallel leaf updates its card and index without disrupting the main serial cursor. Stop after completing the parallel leaf._

---

## Handling Blockers and Optional Leaves

### If a Task is Blocked:
Mark it blocked with an explicit reason:
```bash
python3 backlog/_runner.py block --reason "External dependency X1 Meta review pending"
```

### Skipping Optional Should Tasks:
For `optional: true` cards that will not be shipped in the launch gate:
```bash
python3 backlog/_runner.py skip <leaf_id> --note "Omitted from MVP launch gate"
```

---

## Autonomous Looping (External Cron Only)

Multi-task sequential execution is ONLY permitted when explicitly triggered via the external `/loop` or `/schedule` commands:

```
/loop 1m execute the next backlog task following execute-backlog skill
```

In standard, single-session executions, **NEVER** execute more than one task card per turn.
