---
id: T-HAND-01
parent: T-HAND-01
wave: W5
status: done
optional: false
depends:
  - T-AI-01
fs:
  - FS-HAND-01
read:
  - docs/00_product/06_AI_HUMAN_HANDOFF_RULES/01-triggers-briefing.md
  - docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/handoff/handoff.service.ts
  - apps/api/src/ai/handoff/briefing-generator.service.ts
  - apps/api/src/ai/handoff/handoff.spec.ts
  - packages/shared/src/handoff.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-AI-06
---

# Task: AI-to-Human handoff triggers engine (all 15 triggers) & briefing generator

## 1. Objective & Value

Implement detection for all 15 canonical `HUMAN_REQUIRED` triggers from `06_AI_HUMAN_HANDOFF_RULES.md` and automated AI context briefing generation.

**Why this exists**: Seamless handoff to human agents is the core differentiator of the platform, ensuring shoppers never get stuck with unhelpful AI.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/handoff.*`
- `apps/api/src/ai/briefing-generator.*`
- `packages/shared/src/handoff.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Triggers (15): `EXPLICIT_HUMAN_REQUEST`, `COMPLEX_NEGOTIATION`, `COMPLAINT_OR_DISPUTE`, `RETURN_OR_REFUND`, `CUSTOM_MODIFICATION`, `BULK_ORDER`, `REPEATED_CONFUSION`, `LOW_CONFIDENCE`, `PAYMENT_FAILURE`, `STOCK_OUTAGE`, `OUT_OF_SCOPE`, `SENSITIVE_TOPIC`, `POLICY_CONFLICT`, `HIGH_VALUE_LEAD`, `MANUAL_OVERRIDE`
- Action: Sets `conversation.ai_enabled = false`, status = `HUMAN_REQUIRED`, inserts briefing system note, emits `conversation.handoff_triggered` event.

---

## 4. Invariants & Security Guardrails

- 🔒 **Complete Coverage**: All 15 triggers must be implemented with explicit unit tests.
- 🛡️ **Immediate Pause**: AI turns must immediately halt once a handoff trigger fires.

---

## 5. Implementation Steps

1. Define the 15 trigger enum and briefing schema in shared.
2. Implement `HandoffService` evaluating message and conversation state.
3. Implement `BriefingGeneratorService` summarizing customer intent and cart.
4. Author exhaustive unit tests verifying detection of all 15 triggers.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **15 Triggers**: Every one of the 15 triggers reliably initiates handoff.
- [ ] **AI Paused**: Sets `ai_enabled = false` and status = `HUMAN_REQUIRED`.
- [ ] **Briefing Generated**: Inserts structured briefing note in conversation.

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

- **🧪 Manual QA & Smoke test**: Send test message 'n7eb n7ki m3a agent'; verify AI pauses and briefing note appears in conversation.
- **👁️ Review & Sign-off**: Verify all 15 triggers from `06_AI_HUMAN_HANDOFF_RULES.md` are covered.

---

## 9. Expected Deliverables

Handoff service, briefing generator, and 15-trigger test suite in `apps/api/src/ai`.
