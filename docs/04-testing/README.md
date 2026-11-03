# Testing

This folder is the testing record. Automated tests stay next to the code so the runners can find them. The written plans for each delivery wave are in [`plans/`](./plans/).

## How to run

From the repository root:

| Command                       | What it runs                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm test`                   | Every workspace package that has a test script. Today that is the API (Jest) and `packages/shared` (Jest). |
| `pnpm --filter @app/api test` | API only.                                                                                                  |
| `pnpm eval:golden`            | The Tunisian commerce golden set, 104 scenarios, offline.                                                  |
| `pnpm test:e2e`               | Playwright, Chromium, one worker. Needs the app running.                                                   |
| `pnpm check:full`             | Lint, format, types, then `pnpm test`. This is the pre-commit hook.                                        |
| `pnpm check:ci`               | The same checks, then the production build. This is the pre-push hook and the GitHub CI job.               |

GitHub also has a separate Playwright job. See `.github/workflows/ci.yml`.

## Last full run on this branch

The pre-push hook on the refactor commit ran the suites that `pnpm test` includes:

| Suite             | Result                        |
| ----------------- | ----------------------------- |
| `apps/api`        | 89 suites, 1,452 tests passed |
| `packages/shared` | 5 suites, 39 tests passed     |

The golden benchmark inside that run scored 100 of 104 scenarios. The four misses are `eval-044` and `eval-098` (stock claim), and `eval-054` and `eval-083` (intent). The gates that fail the build still passed: price grounding 100%, stock grounding 98.1% (floor 95%), handoff 100% (floor 98%), commercial safety violations 0%, tool compliance 100%, script match 100%.

Coverage of the files changed by the refactor is in [`../05-refactoring/report.md`](../05-refactoring/report.md). There is no whole-repository coverage number, and this dossier does not invent one.

## Where the automated tests live

| Location                           | Role                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/**/*.spec.ts`        | Unit and controller tests, next to the module.                                                                                  |
| `apps/api/test/golden-eval/`       | Golden dataset, runner, and saved `eval-report.json`.                                                                           |
| `apps/api/test/http/`              | Health, raw-body limit, and Fastify adapter checks.                                                                             |
| `apps/api/test/w1-*.spec.ts`       | Security, throttling, concurrency, and negative cases.                                                                          |
| `packages/shared/src/**/*.spec.ts` | Shared schemas: env, errors, phone, jsonb, analytics.                                                                           |
| `apps/web/e2e/`                    | Playwright: auth, inbox, admin, and the core journey.                                                                           |
| `apps/web/src/**/*.spec.ts`        | Web component specs. The web package has no `test` script, so `pnpm test` does not run them. Playwright is the web check in CI. |

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
