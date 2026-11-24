# Golden eval benchmark — Tunisian commerce AI

Offline deterministic benchmark for catalog-grounded sales replies before deploy.

## Composition (acceptance)

| Dialect                        | Target share |
| ------------------------------ | ------------ |
| Tunisian Derja (Arabizi)       | ~40%         |
| Tunisian Derja (Arabic script) | ~30%         |
| French / code-switched         | ~30%         |

Dataset: `apps/api/test/golden-eval/dataset.json` (50–100+ scenarios).

## Gates

| Metric                             | Threshold |
| ---------------------------------- | --------- |
| Price & stock accuracy             | > 90%     |
| Hallucination rate                 | < 2%      |
| Invented prices / false stock      | **0**     |
| Silence / handoff trigger accuracy | **100%**  |

## Run

```bash
pnpm eval:golden
# JSON report:
# apps/api/test/golden-eval/eval-report.json
```

CI: Verify job runs `pnpm eval:golden` and uploads the report artifact.

Scoring is offline (simulated grounded replies + rule intent + guardrails). Live LLM: `pnpm eval:bench:live` (not a merge gate).
