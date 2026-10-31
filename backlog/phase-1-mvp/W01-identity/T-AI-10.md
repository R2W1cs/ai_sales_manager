---
id: T-AI-10
parent: T-AI-10
wave: W1
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-AI-04
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/config/ai-config.controller.ts
  - apps/api/src/ai/config/ai-config.service.ts
  - apps/api/src/ai/dto/update-ai-settings.dto.ts
  - apps/api/src/ai/dto/update-ai-agent.dto.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-BIZ-02
---

# Task: AI Agent configuration & settings CRUD (`/ai/agents/:id`, `/ai/settings`)

## 1. Objective & Value

Implement AI agent personality and settings configuration endpoints with dynamic model ID validation.

**Why this exists**: Merchants must customize agent tone, language, model selection, and reply mode (approval-required vs auto-send) dynamically without server restarts.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/config/ai-config.controller.ts`
- `apps/api/src/ai/config/ai-config.service.ts`
- `apps/api/src/ai/dto/update-ai-settings.dto.ts`
- `apps/api/src/ai/dto/update-ai-agent.dto.ts`
- `packages/shared/src/ai/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/conversations/`

---

## 3. Technical Contract & Interfaces

- `GET /ai/agents/:id` (200 OK) -> Retrieve agent configuration (name, personality, tone, model_id)
- `PATCH /ai/agents/:id` (200 OK) -> Update agent attributes (reject unknown model IDs with 400)
- `GET /ai/settings` (200 OK) -> Retrieve tenant AI settings (reply_mode, confidence_threshold)
- `PATCH /ai/settings` (200 OK) -> Update AI reply mode and thresholds

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Scope**: Agent and settings updates must match caller's `business_id`.
- 🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.configure')` (Owner/Manager only).
- 🚫 **Negative Invariants**: Reject unpinned or arbitrary model ID strings with 400 Bad Request.

---

## 5. Implementation Steps

1. Define `UpdateAiAgentDto` and `UpdateAiSettingsDto` with model ID validation enum.
2. Implement `AiConfigService` and `AiConfigController` with tenant and permission guards.
3. Author unit tests covering CRUD, permission checks, and invalid model rejection.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Happy Path**: Owner/Manager updates agent personality and reply mode.
- [ ] **Invalid Model (400)**: Passing unrecognized model string returns 400 Bad Request.
- [ ] **Employee Access (403)**: Employee role receives 403 Forbidden.

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

- **🔑 Environment variables**: None.
- **🧪 Manual QA**: Test updating agent tone to 'Friendly Tunisian' via Swagger and verify immediate DB update.
- **👁️ Review & Sign-off**: Verify model ID list matches allowed pins in `11_TECH_STACK.md` §9.3.

---

## 9. Expected Deliverables

AI configuration controller, service, DTOs, and unit tests in `apps/api/src/ai`.
