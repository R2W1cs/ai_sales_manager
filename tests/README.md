# Tests

Automated tests live next to the code they protect. The written testing dossier for the course is in [`docs/04-testing/`](../docs/04-testing/README.md).

## Quick commands

```bash
pnpm test                 # API + shared Jest suites
pnpm eval:golden          # Tunisian commerce golden set
pnpm test:e2e             # Playwright (app must be running)
pnpm check:full           # lint + types + tests
```

## Suites

| Location                           | Runner                             |
| ---------------------------------- | ---------------------------------- |
| `apps/api/src/**/*.spec.ts`        | Jest                               |
| `apps/api/test/`                   | Jest (golden eval, HTTP, security) |
| `packages/shared/src/**/*.spec.ts` | Jest                               |
| `apps/web/e2e/`                    | Playwright                         |

Wave plans and the last measured results: [`docs/04-testing/`](../docs/04-testing/README.md).
