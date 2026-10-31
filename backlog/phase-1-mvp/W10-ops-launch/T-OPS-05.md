---
id: T-OPS-05
parent: T-OPS-05
wave: W10
status: pending
optional: false
depends:
  - T-INT-04
  - T-AI-05
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
files:
  - apps/api/test/resilience/fault-injection.spec.ts
done_cmd: pnpm --filter api test -- test/resilience
next: T-OPS-06
---

# Task: System fault injection & resilience verification suite

## 1. Objective & Value

Implement automated resilience and fault injection test suite testing webhook duplicate deduplication, Redis failover, LLM fallback failover, and DLQ retries.

**Why this exists**: Verify system stability and error handling under external simulated failures per NFR-REL-07.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/test/resilience/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Resilience Scenarios: Meta webhook duplicate storm, AI primary provider 500 error, Redis transient drop, Outbound delivery 5xx backoff.

---

## 4. Invariants & Security Guardrails

- 🔒 **Graceful Recovery**: System recovers automatically without dropped turns or data corruption.

---

## 5. Implementation Steps

1. Author resilience test scenarios injecting simulated network and provider faults.
2. Run resilience test suite.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Resilience Pass**: All fault injection scenarios handle errors cleanly.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- test/resilience

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Run `pnpm --filter api test -- test/resilience`.

---

## 9. Expected Deliverables

Resilience test suite in `apps/api/test/resilience`.
