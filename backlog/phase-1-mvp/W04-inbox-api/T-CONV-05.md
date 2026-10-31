---
id: T-CONV-05
parent: T-CONV-05
wave: W4
status: done
optional: false
depends:
  - T-CONV-02
fs:
  - FS-CONV-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/conversations/timeline/timeline.controller.ts
  - apps/api/src/conversations/timeline/timeline.service.ts
done_cmd: pnpm --filter api test -- src/conversations
next: T-CONV-06
---

# Task: Conversation timeline projection API (`GET /conversations/:id/timeline`)

## 1. Objective & Value

Implement on-demand unified conversation activity timeline projection.

**Why this exists**: Provide merchant UI with a single chronological activity stream of messages, status transitions, handoff events, and internal notes.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/conversations/timeline.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /conversations/:id/timeline` (200 OK) -> Merged chronological stream of `TimelineItem` (`MESSAGE`, `STATUS_CHANGE`, `HANDOFF`, `NOTE`, `ORDER`)

---

## 4. Invariants & Security Guardrails

- 🚫 **Projection Only**: Compute projection dynamically from source tables; do NOT create a timeline database table.

---

## 5. Implementation Steps

1. Implement `TimelineService` querying messages, status events, and notes with common timestamp sort.
2. Implement `TimelineController`.
3. Author unit tests covering merged chronological projection.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Timeline Stream**: Returns chronological interleaved event items.

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

- **🧪 Manual QA**: Call `GET /timeline` via Swagger and verify chronological sorting.

---

## 9. Expected Deliverables

Timeline projection controller and service in `apps/api/src/conversations`.
