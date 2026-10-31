---
id: T-CONV-03
parent: T-CONV-03
wave: W4
status: done
optional: false
depends:
  - T-CONV-02
fs:
  - FS-CONV-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/conversations/state-machine/state-machine.service.ts
  - apps/api/src/conversations/state-machine/state-machine.spec.ts
done_cmd: pnpm --filter api test -- src/conversations
next: T-CONV-04
---

# Task: Conversation state machine & legal transitions engine

## 1. Objective & Value

Implement formal conversation lifecycle state machine with legal transition validation matrix and audit logging.

**Why this exists**: Prevent race conditions and illegal status transitions (e.g. AI responding in closed threads or unrecorded takeovers) per `14_SYSTEM_DESIGN.md` §4.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/conversations/state-machine.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- States: `AI_ACTIVE`, `AI_DRAFTING`, `HUMAN_REQUIRED`, `HUMAN_ACTIVE`, `ORDER_PENDING`, `CLOSED`, `ARCHIVED`
- `StateMachineService.transition(conversationId, toState, actor, reason)`: Validates transition matrix, logs to `conversation_status_events`, updates conversation status.
- Illegal transitions throw `InvalidTransitionException` (HTTP 409 Conflict).

---

## 4. Invariants & Security Guardrails

- 🔒 **Strict Transition Matrix**: State changes can only occur through validated legal edges.
- 🛡️ **Status Audit**: Every status change creates an immutable `conversation_status_events` row.

---

## 5. Implementation Steps

1. Define formal transition graph matrix in TypeScript.
2. Implement `StateMachineService` with database event recording.
3. Author exhaustive test matrix verifying every legal edge and every illegal edge.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Legal Transitions**: All valid state changes succeed and record status events.
- [ ] **Illegal Transitions (409)**: Illegal state changes throw 409 Conflict.
- [ ] **Audit Trail**: Every transition records actor (`AI`, `HUMAN`, `SYSTEM`) and reason.

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

- **🧪 Manual QA**: Test state machine transitions in Jest test runner.
- **👁️ Review & Sign-off**: Verify transition matrix matches `14_SYSTEM_DESIGN.md` §4.

---

## 9. Expected Deliverables

State machine service and exhaustive test suite in `apps/api/src/conversations`.
