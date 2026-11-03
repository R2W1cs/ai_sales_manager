# Tests

Automated tests live next to the code they protect. The full testing dossier for the course (PDF report, wave plans, k6 scripts) is in [`docs/04-testing/`](../docs/04-testing/README.md).

**PDF report:** [`docs/04-testing/AI-Sales-Manager-Testing-Report.pdf`](../docs/04-testing/AI-Sales-Manager-Testing-Report.pdf)

## Quick commands

```bash
pnpm test                 # API + shared Jest suites
pnpm eval:golden          # Tunisian commerce golden set
pnpm test:e2e             # Playwright (app must be running)
pnpm check:full           # lint + types + tests
k6 run docs/04-testing/perf/k6-load.js
```

## Suites

| Location                              | Runner                             |
| ------------------------------------- | ---------------------------------- |
| `apps/api/src/**/*.spec.ts`           | Jest                               |
| `apps/api/test/`                      | Jest (golden eval, HTTP, security) |
| `packages/shared/src/**/*.spec.ts`    | Jest                               |
| `apps/web/e2e/`                       | Playwright                         |
| `apps/web/e2e/whole-app-asma.spec.ts` | Whole-app smoke (Asma seed user)   |
| `docs/04-testing/perf/*.js`           | k6 (load, stress, spike, soak)     |

Last recorded automated result: **1,452** API tests + **39** shared tests passed. Component / endpoint / whole-app matrix (Asma): [`docs/04-testing/plans/COMPONENT_ENDPOINT_WHOLE_APP.md`](../docs/04-testing/plans/COMPONENT_ENDPOINT_WHOLE_APP.md). Ethics companion: [`docs/06-ethics/`](../docs/06-ethics/). Details and performance lab numbers: the PDF above.

**Seeded testing login:** `asma@example.com` / `Password123!` (Admin on Maison Alyssa).
