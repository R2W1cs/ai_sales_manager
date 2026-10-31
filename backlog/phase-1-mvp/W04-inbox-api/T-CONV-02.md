---
id: T-CONV-02
parent: T-CONV-02
wave: W4
status: done
optional: false
depends:
  - T-CONV-01
fs:
  - FS-CONV-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/conversations/messages/messages.controller.ts
  - apps/api/src/conversations/messages/messages.service.ts
  - apps/api/src/conversations/threads/thread-actions.service.ts
  - apps/api/src/conversations/dto/send-message.dto.ts
  - apps/api/src/conversations/dto/create-internal-note.dto.ts
done_cmd: pnpm --filter api test -- src/conversations
next: T-CONV-03
---

# Task: Message thread, sending, actions (approve/retry/takeover/resume/assign/close/notes)

## 1. Objective & Value

Implement complete conversation thread endpoints and human agent management actions suite.

**Why this exists**: Provide sales reps with all controls required to review message history, send replies, approve AI drafts, take over conversations, resume AI control, and collaborate via internal notes.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/conversations/messages.*`
- `apps/api/src/conversations/thread-actions.*`
- `apps/api/src/conversations/dto/*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /conversations/:id/messages` (200 OK) -> Paginated thread messages (GET does NOT mark read)
- `POST /conversations/:id/read` (200 OK) -> Explicit mark read endpoint
- `POST /conversations/:id/messages` (201 Created) -> Send human reply (sets implicit takeover, transitions to HUMAN_ACTIVE)
- `POST /messages/:id/approve` (200 OK) -> Approves AI draft message and enqueues to outbound delivery
- `POST /messages/:id/retry` (200 OK) -> Retries failed message send
- `POST /conversations/:id/takeover` (200 OK) -> Human takeover, sets `ai_enabled = false`
- `POST /conversations/:id/resume` (200 OK) -> Resumes AI (returns 409 if pending order exists)
- `POST /conversations/:id/assign` (200 OK) -> Assigns conversation to teammate
- `POST /conversations/:id/close` (200 OK) -> Closes conversation (returns 409 if pending order exists)
- `POST /conversations/:id/notes` (201 Created) -> Adds internal team note

---

## 4. Invariants & Security Guardrails

- 🔒 **Implicit Takeover**: When a human sends a message, `ai_enabled` is automatically set to false.
- 🛡️ **Order Invariant (409)**: Reject resume or close with 409 Conflict if an unconfirmed order draft exists.
- 🚫 **Negative Invariants**: Never mark conversations read on GET request.

---

## 5. Implementation Steps

1. Implement `MessagesController` and `MessagesService` with pagination and read markers.
2. Implement `ThreadActionsService` with all 10 action endpoints and state checks.
3. Enforce 409 conflict checks on active unconfirmed orders.
4. Author exhaustive unit tests for every action endpoint and error branch.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Send Human Message**: Sets implicit takeover and stops AI auto-turns.
- [ ] **Approve Draft**: Marks draft approved and enqueues to outbound worker.
- [ ] **Pending Order Guard (409)**: Resume and close return 409 when pending order is open.
- [ ] **Internal Notes**: Internal notes are saved without dispatching to customer.

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

- **🧪 Manual QA & Smoke test**: Send human message in Swagger; verify `ai_enabled = false` in DB; test approving AI draft.
- **👁️ Review & Sign-off**: Verify `GET /messages` does not modify `read_at` timestamps.

---

## 9. Expected Deliverables

Messages controller, thread actions service, and test suite in `apps/api/src/conversations`.
