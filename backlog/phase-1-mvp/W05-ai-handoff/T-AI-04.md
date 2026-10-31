---
id: T-AI-04
parent: T-AI-04
wave: W5
status: done
optional: false
depends:
  - T-AI-01
  - T-AI-10
fs:
  - FS-AI-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md
  - docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/reply-mode/reply-mode.service.ts
  - apps/api/src/ai/reply-mode/reply-mode.spec.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-AI-05
---

# Task: AI reply modes engine (approval_required, auto_send, draft_only)

## 1. Objective & Value

Implement AI reply mode dispatcher (`APPROVAL_REQUIRED`, `AUTO_SEND`, `DRAFT_ONLY`) with confidence-based safety downgrades.

**Why this exists**: Allow merchants to review AI messages as drafts while onboarding, then switch to automated sending when confident.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/reply-mode.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `APPROVAL_REQUIRED`: Saves message with `status = 'DRAFT'`, emits `message.new` to inbox.
- `AUTO_SEND`: Saves message with `status = 'SENT'`, enqueues to outbound delivery queue.
- Confidence Fallback: If AI confidence < threshold, downgrade `AUTO_SEND` to `APPROVAL_REQUIRED`.

---

## 4. Invariants & Security Guardrails

- 🛡️ **Default Draft**: Default reply mode for newly created stores is strictly `APPROVAL_REQUIRED`.

---

## 5. Implementation Steps

1. Implement `ReplyModeService` branching logic.
2. Enforce confidence threshold fallback.
3. Author unit tests covering all 3 modes and low-confidence fallback.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Approval Required**: Creates draft message requiring human approval.
- [ ] **Auto Send**: Dispatches message directly to outbound queue.
- [ ] **Low Confidence**: Automatically downgrades auto-send to draft on low confidence.

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

- **🧪 Manual QA**: Test both approval_required and auto_send modes in Swagger.

---

## 9. Expected Deliverables

Reply mode service and tests in `apps/api/src/ai`.
