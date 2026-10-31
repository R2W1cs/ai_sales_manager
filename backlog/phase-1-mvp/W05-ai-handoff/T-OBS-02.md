---
id: T-OBS-02
parent: T-OBS-02
wave: W5
status: done
optional: false
depends:
  - T-AI-04
fs:
  - FS-OBS-01
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/feedback/feedback.controller.ts
  - apps/api/src/ai/feedback/feedback.service.ts
  - apps/api/src/ai/dto/submit-feedback.dto.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-ORD-01
---

# Task: AI message feedback API & quality ratings

## 1. Objective & Value

Implement human feedback loop collecting thumbs up/down ratings and structured negative reason codes on AI responses.

**Why this exists**: Collect continuous feedback from sales reps to identify recurring prompt weaknesses and RAG gaps.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/feedback.*`
- `apps/api/src/ai/dto/*feedback*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /messages/:id/feedback` (201 Created) -> Body `{ rating: 'THUMBS_UP' | 'THUMBS_DOWN', reason?: FeedbackReason, comment?: string }`
- `GET /ai/feedback` (200 OK) -> Aggregate satisfaction metrics

---

## 4. Invariants & Security Guardrails

- 🛡️ **Negative Reason Mandatory**: Thumbs down rating requires structured reason code.

---

## 5. Implementation Steps

1. Implement `FeedbackService` and `FeedbackController`.
2. Author unit tests covering feedback submission and reason code validation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Feedback Submission**: Records feedback and updates satisfaction metrics.

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

- **🧪 Manual QA**: Submit thumbs down rating with reason code via Swagger.

---

## 9. Expected Deliverables

Feedback controller and service in `apps/api/src/ai`.
