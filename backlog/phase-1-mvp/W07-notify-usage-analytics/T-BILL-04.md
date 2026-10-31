---
id: T-BILL-04
parent: T-BILL-04
wave: W7
status: done
optional: false
depends:
  - T-OBS-01
  - T-BILL-02
fs:
  - FS-BILL-01
read:
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/usage/usage.controller.ts
  - apps/api/src/ai/usage/usage.service.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-ANL-01
---

# Task: AI inference cost & token consumption monitoring API (`/ai/usage`)

## 1. Objective & Value

Implement AI token consumption and estimated inference cost monitoring endpoint (`GET /api/v1/ai/usage`) with exact pricing tables.

**Why this exists**: Allow store owners to inspect total prompt/completion tokens consumed and estimated LLM costs per model.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/usage/`
- `packages/shared/src/ai/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/ai/orchestrator/`
- `apps/api/src/ai/playground/`

---

## 3. Technical Contract & Interfaces

- `GET /api/v1/ai/usage` (200 OK) — Permission: `@RequirePermission('ai.traces.read')` (restricted to `OWNER` / `ADMIN` role).
  - Query params: `from`, `to` (ISO dates, defaults to current billing month).
  - Response:
    ```json
    {
      "periodStart": "2026-08-01T00:00:00Z",
      "periodEnd": "2026-08-31T23:59:59Z",
      "totalTokens": 1450000,
      "promptTokens": 1100000,
      "completionTokens": 350000,
      "estimatedUsd": 0.32,
      "estimatedTnd": 0.99,
      "byModel": [
        {
          "modelId": "gemini-1.5-flash",
          "promptTokens": 1100000,
          "completionTokens": 350000,
          "costUsd": 0.32
        }
      ]
    }
    ```
- **Pricing Catalog (Shared Constant)**:
  - `gemini-1.5-flash`: $0.075 / 1M prompt tokens, $0.30 / 1M completion tokens.
  - Currency conversion rate: 1 USD = 3.10 TND.

---

## 4. Invariants & Security Guardrails

- 🛡️ **Role Restricted**: `EMPLOYEE` role receives 403 Forbidden.
- 🔒 **Tenancy Boundary**: Data grouped and filtered strictly by caller's `business_id`.

---

## 5. Implementation Steps

1. Define pricing constants and DTO schemas in `packages/shared`.
2. Implement `UsageService` querying `ai_usage` grouped by model and token type.
3. Compute USD and TND cost estimates from fixed pricing tables.
4. Implement `UsageController` with role guard.
5. Author unit tests covering token breakdown, cost calculations, and permission checks.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Cost Report**: Returns monthly prompt/completion token breakdown and USD/TND cost.
- [ ] **Pricing Math**: Cost calculation accurately applies the model pricing catalog.
- [ ] **Employee Block (403)**: Accessing as `EMPLOYEE` returns 403 Forbidden.

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

- **🧪 Manual QA**: Call `GET /api/v1/ai/usage` via Swagger as Owner and verify token counts.

---

## 9. Expected Deliverables

AI usage reporting controller, service, and tests in `apps/api/src/ai`.
