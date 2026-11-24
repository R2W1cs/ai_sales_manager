# How we use GitHub on this project (company-style)

This note is for the course defense: it shows the same process a product team uses when shipping a launch-gate feature — **issues → branches → PRs → CI failure → bugfix → merge**.

## Board (issues)

| Issue                                                       | Type    | Purpose                                            |
| ----------------------------------------------------------- | ------- | -------------------------------------------------- |
| [#14](https://github.com/R2W1cs/ai_sales_manager/issues/14) | Epic    | Commercial launch gate — 3 Tunisia design partners |
| [#15](https://github.com/R2W1cs/ai_sales_manager/issues/15) | Feature | Seed 3 tenants + TND catalogs                      |
| [#16](https://github.com/R2W1cs/ai_sales_manager/issues/16) | Feature | Gate tracker + interaction report                  |
| [#17](https://github.com/R2W1cs/ai_sales_manager/issues/17) | Docs    | This workflow write-up                             |

Never push straight to `main` for product work. Open an issue first so the “why” is visible.

## Branch naming

| Prefix     | When                                                |
| ---------- | --------------------------------------------------- |
| `feat/*`   | New capability (seed, gate evaluator, fixtures)     |
| `bugfix/*` | Fix a defect found on another branch / in CI        |
| `docs/*`   | Documentation-only                                  |
| `phase/*`  | Course phase deliveries (already used historically) |

## Happy path (feature)

```text
main
  └─ feat/commercial-launch-gate
        ├─ implement seed + fixtures + gate tests
        ├─ open [PR #18](https://github.com/R2W1cs/ai_sales_manager/pull/18) → CI (check:ci, Playwright, audit)
        └─ squash-merge to main when green
```

Commands used:

```powershell
git checkout main
git pull origin main
git checkout -b feat/commercial-launch-gate
# ... commit work ...
git push -u origin HEAD
gh pr create --title "..." --body "Closes #15 ..."
gh pr merge --squash --delete-branch
```

## Error path (what the professor asked to see)

When CI or a review finds a bug on a feature branch, we **do not hide it on `main`**. We keep the failing signal visible, then fix on a dedicated branch:

```text
feat/commercial-launch-gate          (or main)
  └─ bugfix/pilot-csv-price-column ([PR #20](https://github.com/R2W1cs/ai_sales_manager/pull/20))
        ├─ PR opens → GitHub Actions job "Pilot fixtures" goes RED
        ├─ engineer reads the failed job log
        ├─ push fix commit on the same bugfix branch
        ├─ CI goes GREEN
        └─ merge bugfix → then continue / re-merge feature
```

What “solve it” looks like in practice:

1. **Reproduce** — open the failed check URL on the PR; note the exact error (`FAIL sara-stores.csv: missing columns price_tnd` — [failed job](https://github.com/R2W1cs/ai_sales_manager/actions/runs/45385388825/job/138414843328)).
2. **Isolate** — `git checkout -b bugfix/...` from the failing tip (or push a fix commit if the PR already is the bugfix).
3. **Fix + lock** — correct the fixture/code and keep `scripts/pilot/validate-fixtures.mjs` so the same class of error fails CI next time.
4. **Verify** — local `pnpm` hooks + GitHub checks green.
5. **Merge** — squash or merge commit; delete the branch; close linked issues with `Closes #N` in the PR body.

## Artifacts produced for the launch gate

| Path                                      | Role                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/shared/src/pilot/gate.ts`       | Pure gate evaluator (≥20 interactions, 3 merchants, channels, COD, zero criticals) |
| `fixtures/pilot/*.csv`                    | TND catalogs for 3 verticals                                                       |
| `apps/api/prisma/seed-pilot-partners.ts`  | `pnpm pilot:seed`                                                                  |
| `scripts/pilot/interaction-report.mjs`    | `pnpm pilot:report`                                                                |
| `scripts/pilot/validate-fixtures.mjs`     | CI guard for CSV schema                                                            |
| `docs/30_execution/PILOT_GATE_TRACKER.md` | Ops checklist for live Meta proof                                                  |

## Live Meta vs engineering

Connecting real Instagram/Messenger pages requires Meta App credentials in **environment variables** (never committed). After seed:

1. Merchant logs in → Settings → Canaux → OAuth.
2. Founder runs [`META_LIVE_LOOP.md`](./META_LIVE_LOOP.md) once per shop.
3. Track volume with `pnpm pilot:report` until each merchant ≥ 20 inbound interactions and ≥ 1 confirmed COD order.

That split mirrors a real company: engineering ships the gate tooling; ops/founders complete live channel proof outside git.
