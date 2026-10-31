---
id: T-AI-09
parent: T-AI-09
wave: W5
status: done
optional: false
depends:
  - T-AI-02
fs:
  - FS-AI-01
read:
  - docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md
  - docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/test/golden-eval/dataset.json
  - apps/api/test/golden-eval/eval-runner.spec.ts
  - apps/api/src/ai/evaluation/evaluation.service.ts
done_cmd: pnpm --filter api test -- test/golden-eval
next: T-OBS-01
---

# Task: Golden evaluation dataset & automated benchmark in CI

## 1. Objective & Value

Implement golden evaluation dataset (50-100 Tunisian Derja/French dialogues) and automated accuracy benchmark runner in CI.

**Why this exists**: Guarantee that model updates and prompt changes never regress AI sales accuracy or safety standards in CI.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/test/golden-eval/`
- `apps/api/src/ai/evaluation.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Benchmark Thresholds: Price grounding > 95%, Stock grounding > 95%, Handoff trigger accuracy > 98%, Commercial safety violation rate = 0%.

---

## 4. Invariants & Security Guardrails

- 🚫 **CI Merge Block**: Any accuracy regression below thresholds blocks CI pull request merge.

---

## 5. Implementation Steps

1. Author 50-100 realistic Tunisian Derja/French multi-turn test scenarios in `dataset.json`.
2. Implement `eval-runner.spec.ts` evaluating tool call accuracy and guardrail compliance.
3. Integrate evaluation benchmark into CI test pipeline.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Benchmark Run**: Benchmark executes all scenarios and outputs accuracy report.
- [ ] **Safety Invariant**: Zero commercial safety violations across entire dataset.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- test/golden-eval

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **Human contribution**: Review dataset scenarios in `dataset.json` for dialect accuracy.
- **🧪 Manual QA**: Run `pnpm --filter api test -- test/golden-eval` and inspect benchmark output.

---

## 9. Expected Deliverables

Golden evaluation dataset and test runner in `apps/api/test/golden-eval`.
