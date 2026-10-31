---
id: T-AI-03
parent: T-AI-03
wave: W5
status: done
optional: false
depends:
  - T-AI-01
fs:
  - FS-AI-01
read:
  - docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md
  - docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/prompts/prompt-versions.service.ts
  - apps/api/src/ai/prompts/prompt-versions.controller.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-AI-04
---

# Task: AI prompt versions management & audit linking

## 1. Objective & Value

Implement immutable prompt versioning and link every generated AI message to the exact prompt version ID used.

**Why this exists**: Maintain full auditability of historical AI outputs for prompt regression analysis.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/prompt-versions.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /ai/prompts` (201 Created) -> Creates new immutable prompt version
- `messages.prompt_version_id` foreign key stored on every generated message.

---

## 4. Invariants & Security Guardrails

- 🔒 **Immutability**: Never overwrite prompt rows in place.

---

## 5. Implementation Steps

1. Implement `PromptVersionsService` inserting versioned rows.
2. Attach `prompt_version_id` during message creation.
3. Author unit tests covering prompt versioning and linking.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Traceable Message**: AI messages store exact `prompt_version_id` in database.

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

- **🧪 Manual QA**: Update prompt template; send message; check DB `messages.prompt_version_id`.

---

## 9. Expected Deliverables

Prompt versioning service and controller in `apps/api/src/ai`.
