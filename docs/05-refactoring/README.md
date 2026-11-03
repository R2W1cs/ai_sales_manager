# Refactoring and optimization

This folder is the record for the measured refactor. Read [`report.md`](./report.md) for the before and after numbers.

The report covers the four metrics that were asked for:

| Metric                | Where it is measured                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Cyclomatic complexity | `node scripts/complexity.mjs apps/api/src apps/web/src packages/shared/src`                                               |
| Lint issues           | `pnpm exec oxlint apps/api/src apps/web/src packages/shared/src`                                                          |
| Test coverage         | Jest `json-summary` on the files the refactor touches. Commands are in the report. This is not a whole-repository figure. |
| Latency and memory    | `node scripts/bench-overview-series.mjs <api env file>`                                                                   |

Run both scripts from the repository root. The bench script reads `DATABASE_URL` from the env file you pass and prints timings only.

What landed:

1. The offline intent fallback is a phrase table. Complexity of that method went from 53 to 1.
2. The SSRF address check is one predicate per range. Complexity of that method went from 43 to 2.
3. The operator chart counts rows per local day in Postgres. On the measured window the payload went from 4,874 bytes to 194 bytes, and p95 from 1.43 ms to 0.88 ms.
4. Six oxlint errors were fixed in code. The inbox attachment image stays an `<img>`, with a documented exception, because it is a blob URL from an authenticated download.

Suggestions that were reviewed and not applied, including splits of the order and AI pipelines, are listed in the report. Maximum complexity stays 65 on purpose.
