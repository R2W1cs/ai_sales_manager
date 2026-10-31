---
id: T-AI-05
parent: T-AI-05
wave: W5
status: done
optional: false
depends:
  - T-AI-01
fs:
  - FS-AI-01
read:
  - docs/10_engineering/11_TECH_STACK/03-llm-routing-models.md
  - docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/gateway/model-fallback.service.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-HAND-01
---

# Task: LLM fallback routing & graceful degradation handler

## 1. Objective & Value

Implement multi-provider LLM fallback chain and outage escalation.

**Why this exists**: Ensure platform continuous uptime even during third-party AI provider outages per NFR-REL-07.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/model-fallback.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Chain: Primary Model (Claude 3.5 Sonnet) -> Secondary Model (GPT-4o) -> Fallback (GPT-4o-mini) -> Handoff (`MODEL_OUTAGE`)

---

## 4. Invariants & Security Guardrails

- 🚫 **Never Send Degraded**: Never send raw error messages or partial text to customers.

---

## 5. Implementation Steps

1. Implement fallback retry chain with timeout handling.
2. Escalate to human handoff if all models fail.
3. Author unit tests verifying failover sequence.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Failover**: Switches to backup model on 5xx or rate limit.
- [ ] **Total Outage**: Triggers handoff with reason MODEL_OUTAGE on total failure.

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

- **🧪 Manual QA**: Simulate model error and verify automatic fallback.

---

## 9. Expected Deliverables

Model fallback service in `apps/api/src/ai`.
