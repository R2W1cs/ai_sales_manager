---
id: T-LEAD-01
parent: T-LEAD-01
wave: W4
status: done
optional: false
depends:
  - T-CONV-02
fs:
  - FS-LEAD-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/conversations/lead-scoring/lead-scoring.service.ts
  - apps/api/src/conversations/lead-scoring/lead-scoring.processor.ts
  - apps/api/src/conversations/lead-scoring/lead-scoring.spec.ts
done_cmd: pnpm --filter api test -- src/conversations
next: T-AI-01
---

# Task: Deterministic lead scoring engine & priority calculation

## 1. Objective & Value

Implement deterministic lead scoring formula (0–100 score + HOT/WARM/COLD temperature) and nightly decay worker.

**Why this exists**: Automatically prioritize conversations by purchase intent so sales reps focus on hot commercial deals first.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/conversations/lead-scoring.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Scoring Formula: Product inquiry (+15), Price question (+20), Phone shared (+25), Cart intent (+35), Negative sentiment (-20)
- Temperature: HOT (>= 70), WARM (40–69), COLD (< 40)
- Nightly Decay: -10 points after 24h of customer inactivity.

---

## 4. Invariants & Security Guardrails

- 🚫 **No LLM in Calculation**: Numeric score is computed 100% deterministically from verified intent signals, never hallucinated by LLM.

---

## 5. Implementation Steps

1. Implement `LeadScoringService.computeScore()` with factor weights.
2. Implement BullMQ nightly decay worker.
3. Author unit tests covering scoring factors, temperature thresholds, and decay.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Deterministic Score**: Verified factor inputs produce exact mathematical score.
- [ ] **Temperature Pill**: Ranges accurately map to HOT, WARM, and COLD.
- [ ] **Nightly Decay**: Inactive leads decay score by 10 points after 24h.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/conversations

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Send customer messages with pricing and phone inquiries; verify lead score increases to 60+ (WARM/HOT).

---

## 9. Expected Deliverables

Lead scoring service, decay processor, and tests in `apps/api/src/conversations`.
