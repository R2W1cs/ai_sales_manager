---
name: test-everything
description: Monorepo-wide multi-gate verification workflow to run after every backlog task. Executes leaf done_cmd, architecture boundaries, forbidden addons, oxfmt/oxlint, typecheck, unit/integration tests, live API endpoint smoke probes, Playwright browser E2E tests, and React Doctor. Use when validating any backlog card, checking full regression health, or verifying end-to-end task completion.
---

# `test-everything` Verification Workflow

The `test-everything` workflow is the rigorous, end-to-end quality and regression verification standard for the `ai-sales-manager` project. It must be executed after implementing any backlog leaf task before calling `python3 backlog/_runner.py complete`.

---

## 1. Quick Start

Run the complete 8-gate test suite from anywhere in the repository:

```bash
# Recommended: Standard full test suite (all 8 gates)
pnpm test:everything

# Or via backlog runner:
python3 backlog/_runner.py test-everything
```

### Fast / Scoped Flags:
```bash
# Skip Playwright browser tests (useful for quick headless checks)
pnpm test:everything --skip-e2e

# Fast mode: Skip typecheck and Playwright browser E2E
pnpm test:everything --fast

# Explicit target for React Doctor (e.g. apps/api, apps/web)
pnpm test:everything --app apps/api
```

---

## 2. The 8 Quality Gates

The workflow runs 8 deterministic gates sequentially, stopping early if any gate fails:

```
[Gate 1: Leaf done_cmd]
       │
       ▼
[Gate 2: Architecture & Forbidden Addons]
       │
       ▼
[Gate 3: Formatting & Linting (oxfmt + oxlint)]
       │
       ▼
[Gate 4: TypeScript Monorepo Typecheck]
       │
       ▼
[Gate 5: Unit & Integration Test Suites]
       │
       ▼
[Gate 6: Live API Endpoint Smoke Probes]
       │
       ▼
[Gate 7: Playwright Browser End-to-End Tests]
       │
       ▼
[Gate 8: React Doctor Audit (apps/web)]
```

### Gate 1: Active Leaf `done_cmd`
- **Tool**: `python3 backlog/_runner.py verify`
- **Scope**: Runs the exact acceptance command defined in the card frontmatter for the active leaf (e.g. unit tests, contract checks).

### Gate 2: Architecture Boundaries & Forbidden Addons
- **Tools**: `python3 backlog/_runner.py check-arch` & `node scripts/check-forbidden-addons.mjs`
- **Enforces**:
  - `RULE-ARCH-01`: No direct web-to-API imports (`apps/web` cannot import `apps/api`).
  - `RULE-ARCH-02`: Zero unapproved dependencies (strict ban on Radix UI, axios, express, etc.).
  - `RULE-ARCH-03`: Clean NestJS module boundaries with explicit public contracts.

### Gate 3: Formatting & Linting
- **Tools**: `oxfmt --check` & `oxlint`
- **Scope**: Scans all 660+ files across the monorepo for syntax issues, unused variables, and code styling violations.

### Gate 4: TypeScript Monorepo Typecheck
- **Tool**: `pnpm check:types` (`pnpm -r --if-present check-types && tsc -p tsconfig.root.json`)
- **Scope**: Strict type checking across `@app/shared`, `@app/config`, `apps/api`, and `apps/web`.

### Gate 5: Unit & Integration Test Suites
- **Tool**: `pnpm test`
- **Scope**:
  - `@app/shared`: Contract tests, DTO schemas, regex validators.
  - `@app/api`: Controller unit tests, auth tests, security headers, guard suites.

### Gate 6: Live API Endpoint Smoke Probes
- **Tool**: Built-in HTTP probe runner targeting active local servers:
  - `GET /` (Fastify root probe → 200)
  - `GET /api/v1/auth/get-session` (Anonymous probe → 401 Unauthorized)
  - `GET /api/v1/conversations` (Protected inbox route probe → 401 Unauthorized)
- **Note**: If dev servers are not currently running, Gate 6 logs an advisory notice without hard-blocking non-daemon environments.

### Gate 7: Playwright Browser End-to-End Tests
- **Tool**: `npx playwright test --project=chromium --workers=1`
- **Test Suites**:
  - `apps/web/e2e/inbox.spec.ts`: 3-pane command center, takeover/resume toggle, draft approval & manual reply dismissal, error rollbacks, AI suggestion drawer, order confirmation/cancellation, internal commercial notes.
  - `apps/web/e2e/auth.spec.ts`: Register validation & password meter, successful signup & HttpOnly cookies, zero localStorage token leak invariant, duplicate email conflict, URL password sanitization, valid login & session restoration, invite token error boundaries, logout cookie clearing.

### Gate 8: React Doctor Audit
- **Tool**: `pnpx react-doctor@latest <target> -y --scope changed --json-compact --no-telemetry --no-color`
- **Dynamic Scope**: Automatically detects changed packages via git (`apps/web`, `apps/api`, `apps/worker`). If changes touch `apps/api`, it audits `apps/api`. If changes touch both `apps/web` and `apps/api`, it audits both sequentially. Can also be overridden explicitly with `--app <target>`. Must pass with 0 issues.

---

## 3. Backlog Integration Protocol

When working on any card in the backlog, replace manual spot-checks with `test-everything`:

1. **Start Task**: `python3 backlog/_runner.py start` + `python3 backlog/_runner.py scaffold`
2. **Implement Scope**: Edit allowlisted files only.
3. **Verify Everything**:
   ```bash
   pnpm test:everything
   ```
4. **Complete Card**:
   ```bash
   python3 backlog/_runner.py complete --note "Implement <feature> + verified via test-everything"
   ```

---

## 4. Troubleshooting & Remediation Playbook

### Issue: Playwright E2E fails with `401` or database conflict
- **Root Cause**: Playwright workers running in parallel can create race conditions on shared test users or rate limit keys.
- **Remediation**:
  Always ensure `--workers=1` is specified (already the default in `test-everything.mjs` and `pnpm test:e2e`).
  Clear rate limit keys if testing repeated rapid logins:
  ```bash
  docker exec ai-sales-redis redis-cli del rate_limit:auth:ip:127.0.0.1
  ```

### Issue: Token reuse detection triggered (`401: Refresh token has been revoked`)
- **Root Cause**: Navigating before an in-flight `/api/v1/auth/refresh` request completes causes the browser to send an already-rotated refresh token.
- **Remediation**:
  In tests, always wait for the refresh promise or evaluate session restoration within the page context:
  ```typescript
  const restoredSession = await page.evaluate(async () => {
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    return res.ok ? await res.json() : null;
  });
  ```

### Issue: React Doctor reports issues
- **Remediation**:
  Review the line numbers output by `react-doctor`. Common fixes include:
  - Adding missing hook dependencies to `useMemo` / `useCallback` / `useEffect`.
  - Adding `suppressHydrationWarning` on dynamic timestamp or date elements.
  - Ensuring form controls have associated accessible labels.
