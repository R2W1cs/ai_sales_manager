---
id: T-OPS-06
parent: T-OPS-06
wave: W10
status: pending
optional: false
depends:
  - T-OPS-03
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md
  - docs/10_engineering/18_DEPLOYMENT/01-infrastructure-topology-ecs.md
files:
  - docs/10_engineering/RUNBOOK.md
done_cmd: "pnpm check:full"
next: T-OPS-07
---

# Task: Operational runbook, incident response guides & backup verification

## 1. Objective & Value

Author comprehensive engineering operational runbook detailing on-call incident response procedures, Meta webhook re-synchronization, and RDS backup restoration steps.

**Why this exists**: Equip on-call engineers with clear operational procedures for production maintenance and incident recovery.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `docs/10_engineering/RUNBOOK.md`

### Do Not Modify (Forbidden boundaries)

- `apps/`

---

## 3. Technical Contract & Interfaces

- Runbook Sections: System Architecture Overview, Alert Response Playbooks, Meta Token Refresh, Redis Recovery, RDS Point-in-Time Restore.

---

## 4. Invariants & Security Guardrails

- 🔒 **No Plaintext Secrets**: Ensure runbook references AWS Secrets Manager without raw credentials.

---

## 5. Implementation Steps

1. Author `docs/10_engineering/RUNBOOK.md` with step-by-step incident resolution workflows.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Runbook Documentation**: Complete, actionable runbook in repository docs.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm check:full

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **👁️ Review & Sign-off**: Review operational runbook with engineering on-call team.

---

## 9. Expected Deliverables

Production operational runbook in `docs/10_engineering/RUNBOOK.md`.
