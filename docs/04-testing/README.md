# Testing

Asma’s phase dossier for AI Sales Manager. Automated suites stay next to the code. This folder holds the written plans, the performance lab scripts, and the PDF report for the defense.

## Start here

| Artifact                                                                           | What it is                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`AI-Sales-Manager-Testing-Report.pdf`](./AI-Sales-Manager-Testing-Report.pdf)** | Full testing report: unit, integration, E2E, golden AI eval, smoke, regression, security, a11y, contract, **k6 load / stress / spike**, **soak**, and chaos |
| [`plans/`](./plans/)                                                               | Wave plans W0–W10 plus manual QA checklists                                                                                                                 |
| [`perf/`](./perf/)                                                                 | k6 scripts used for the performance sections of the PDF                                                                                                     |
| [`../../tests/README.md`](../../tests/README.md)                                   | Short index of where the automated tests live                                                                                                               |

Regenerate the PDF after edits:

```bash
python docs/04-testing/build_testing_report_pdf.py
```

## Test types covered

| Type                 | Tool / location                          | Status                              |
| -------------------- | ---------------------------------------- | ----------------------------------- |
| Unit / controller    | Jest `apps/api/src/**/*.spec.ts`         | 1,452 passed                        |
| Shared schemas       | Jest `packages/shared`                   | 39 passed                           |
| Integration / HTTP   | Jest `apps/api/test/`                    | Included in API suite               |
| AI golden evaluation | `pnpm eval:golden` (104 scenarios)       | Gates PASS                          |
| End-to-end UI        | Playwright `apps/web/e2e/`               | CI job                              |
| Smoke                | `/health`, web `:3000`, seed logins      | PASS                                |
| Regression           | Husky + GitHub `check:ci`                | PASS                                |
| Security / tenancy   | `w1-*` suites, SSRF media tests          | PASS                                |
| Accessibility        | oxlint jsx-a11y + manual checks          | PASS                                |
| Contract / schema    | Zod + Prisma validate                    | PASS                                |
| Load                 | k6 `perf/k6-load.js`                     | Lab PASS (p95 &lt; 300 ms @ 50 VUs) |
| Stress               | k6 `perf/k6-stress.js`                   | Lab documented                      |
| Spike                | k6 `perf/k6-spike.js`                    | Lab PASS with notes                 |
| Soak                 | k6 `perf/k6-soak.js` (2 h steady)        | Lab PASS                            |
| Chaos / resilience   | Redis down, LLM fallback, webhook dedupe | PASS                                |

Jest and golden-set numbers come from the last full offline pre-push run. k6 / soak / stress / spike figures in the PDF are **course lab profiles** on the local Docker stack (see the evidence policy on page 1 of the PDF).

## How to run

From the repository root:

| Command                                  | What it runs                                     |
| ---------------------------------------- | ------------------------------------------------ |
| `pnpm test`                              | API + shared Jest                                |
| `pnpm --filter @app/api test`            | API only                                         |
| `pnpm eval:golden`                       | Tunisian commerce golden set (offline)           |
| `pnpm test:e2e`                          | Playwright (app must be running)                 |
| `pnpm check:full`                        | Lint, format, types, tests (pre-commit)          |
| `pnpm check:ci`                          | Full check + production build (pre-push / CI)    |
| `k6 run docs/04-testing/perf/k6-load.js` | Load lab                                         |
| `k6 run docs/04-testing/perf/k6-soak.js` | Soak lab (use `-e SOAK_MINUTES=5` for a dry run) |

Unset `GROQ_API_KEY` / `ORCA_API_KEY` when you want Jest to stay offline. Live keys make some suites call the real provider and can hit rate limits.

## Last full automated run

| Suite             | Result                            |
| ----------------- | --------------------------------- |
| `apps/api`        | 89 suites, **1,452 tests passed** |
| `packages/shared` | 5 suites, **39 tests passed**     |

Golden benchmark: **100 / 104** scenarios. Gates still passed — price grounding 100%, stock grounding 98.1% (floor 95%), handoff 100%, commercial safety violations 0%, tool compliance 100%, script match 100%. Soft misses: `eval-044`, `eval-098` (stock), `eval-054`, `eval-083` (intent).

Refactor slice coverage (not whole-repo): [`../05-refactoring/report.md`](../05-refactoring/report.md).

## Where the automated tests live

| Location                           | Role                                                |
| ---------------------------------- | --------------------------------------------------- |
| `apps/api/src/**/*.spec.ts`        | Unit and controller tests                           |
| `apps/api/test/golden-eval/`       | Golden dataset and runner                           |
| `apps/api/test/http/`              | Health, body limit, Fastify adapter                 |
| `apps/api/test/w1-*.spec.ts`       | Security, throttling, concurrency, fuzz             |
| `packages/shared/src/**/*.spec.ts` | Shared schemas                                      |
| `apps/web/e2e/`                    | Playwright journeys                                 |
| `apps/web/src/**/*.spec.ts`        | Web component specs (Playwright is the CI web gate) |

## Wave plans

| Plan                                                                                 | Wave                                            |
| ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [`plans/W00_BOOTSTRAP_TESTING.md`](./plans/W00_BOOTSTRAP_TESTING.md)                 | Monorepo, shared schemas, database, Docker      |
| [`plans/W01_IDENTITY_TESTING.md`](./plans/W01_IDENTITY_TESTING.md)                   | Auth and workspace identity                     |
| [`plans/W02_CATALOG_KNOWLEDGE_TESTING.md`](./plans/W02_CATALOG_KNOWLEDGE_TESTING.md) | Catalog and knowledge                           |
| [`plans/W03_CHANNELS_TESTING.md`](./plans/W03_CHANNELS_TESTING.md)                   | Instagram, Messenger, webhooks                  |
| [`plans/W04_INBOX_API_TESTING.md`](./plans/W04_INBOX_API_TESTING.md)                 | Inbox API                                       |
| [`plans/W05_AI_HANDOFF_TESTING.md`](./plans/W05_AI_HANDOFF_TESTING.md)               | AI replies and human handoff                    |
| [`plans/W06_ORDERS_CUSTOMERS_TESTING.md`](./plans/W06_ORDERS_CUSTOMERS_TESTING.md)   | Orders and customers                            |
| [`plans/W07_NOTIFY_ANALYTICS_TESTING.md`](./plans/W07_NOTIFY_ANALYTICS_TESTING.md)   | Notifications and analytics                     |
| [`plans/W08_WEB_P0_TESTING.md`](./plans/W08_WEB_P0_TESTING.md)                       | Web, first release                              |
| [`plans/W09_WEB_P1_P2_TESTING.md`](./plans/W09_WEB_P1_P2_TESTING.md)                 | Web, later slices                               |
| [`plans/W10_OPS_LAUNCH_TESTING.md`](./plans/W10_OPS_LAUNCH_TESTING.md)               | Launch and operations                           |
| [`plans/MANUAL_QA_PLAN.md`](./plans/MANUAL_QA_PLAN.md)                               | Manual pass across the product                  |
| [`plans/MANUAL_QA_PLAN_W6.md`](./plans/MANUAL_QA_PLAN_W6.md)                         | Manual pass for orders, stock, and the pipeline |
