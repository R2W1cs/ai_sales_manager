---
id: T-CONV-04
parent: T-CONV-04
wave: W4
status: done
optional: false
depends:
  - T-CONV-03
fs:
  - FS-CONV-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/conversations/threads/conversation-lock.service.ts
  - apps/api/src/conversations/threads/conversation-lock.spec.ts
done_cmd: pnpm --filter api test -- src/conversations
next: T-CONV-05
---

# Task: Redis distributed conversation lock for AI/human turns

## 1. Objective & Value

Implement Redis Redlock distributed locking to serialize message processing and prevent concurrent interleaved AI turns.

**Why this exists**: Prevent two inbound customer messages sent in rapid succession from triggering parallel AI turns that output contradictory or duplicate messages.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/conversations/conversation-lock.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `ConversationLockService.withLock(businessId, convId, handler)`
- Redis Key: `conv:lock:{business_id}:{conversation_id}` (TTL: 20 seconds with automatic renewal)

---

## 4. Invariants & Security Guardrails

- 🔒 **Guaranteed Release**: Lock must be released in `finally` block even on unhandled exceptions.
- 🛡️ **No Interleaving**: Concurrent requests wait or queue cleanly without duplicate AI turns.

---

## 5. Implementation Steps

1. Implement Redis Redlock wrapper in `ConversationLockService`.
2. Wrap turn executions in lock handler.
3. Author concurrency tests verifying serialized execution under load.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Concurrency Safety**: Concurrent executions on same conversation are serialized.
- [ ] **TTL Expiration**: Locks auto-expire safely if worker crashes.

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

- **🧪 Manual QA**: Run lock unit tests verifying lock acquisition and release.

---

## 9. Expected Deliverables

Conversation lock service and concurrency tests in `apps/api/src/conversations`.
