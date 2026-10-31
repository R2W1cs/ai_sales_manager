---
id: T-AI-02
parent: T-AI-02
wave: W5
status: done
optional: false
depends:
  - T-AI-01
fs:
  - FS-AI-01
read:
  - docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md
  - docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/guardrails/guardrails.service.ts
  - apps/api/src/ai/guardrails/guardrails.spec.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-AI-03
---

# Task: AI guardrails & commercial safety validators (discount, refund, promises)

## 1. Objective & Value

Implement pre/post-generation commercial guardrails intercepting unauthorized discounts, refund promises, false delivery guarantees, and complaint upselling.

**Why this exists**: Protect merchant liability and financial risk from unapproved LLM commercial promises.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/guardrails.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GuardrailsService.validateProposedOutput(output, businessRules): GuardrailCheckResult`
- Violations trigger immediate suppression and escalate to `requestHumanHandoff`.

---

## 4. Invariants & Security Guardrails

- 🚫 **Forbidden Promises**: Zero tolerance for unauthorized discounts, refunds, or payment promises.

---

## 5. Implementation Steps

1. Implement regex and semantic classification validators.
2. Intercept proposed output in orchestrator pipeline.
3. Author exhaustive test suite covering all commercial safety rules.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Discount Intercept**: Blocks unauthorized discount requests.
- [ ] **Refund Intercept**: Escalates refund inquiries to human agent.
- [ ] **Complaint Safety**: Suppresses product upselling during customer complaints.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/ai

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Ask AI for 50% discount in test conversation; verify refusal and handoff.

---

## 9. Expected Deliverables

Guardrails service and validation test suite in `apps/api/src/ai`.
