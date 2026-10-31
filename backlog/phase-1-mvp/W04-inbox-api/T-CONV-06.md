---
id: T-CONV-06
parent: T-CONV-06
wave: W4
status: done
optional: false
depends:
  - T-CONV-02
  - T-AUTH-02/c
fs:
  - FS-CONV-01
read:
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/realtime/realtime.gateway.ts
  - apps/api/src/realtime/realtime.service.ts
  - apps/api/src/realtime/realtime.module.ts
  - packages/shared/src/realtime.ts
done_cmd: pnpm --filter api test -- src/realtime
next: T-LEAD-01
---

# Task: Realtime WebSocket gateway & rooms (Socket.IO)

## 1. Objective & Value

Implement Socket.IO WebSocket gateway with JWT handshake authentication, tenant room isolation, and live inbox event dispatchers.

**Why this exists**: Sales reps must receive live messages, typing indicators, AI drafts, and lead score updates in real time without polling.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/realtime/`
- `packages/shared/src/realtime.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Handshake: JWT token in auth payload -> Joins room `business:{business_id}` and `user:{user_id}`. Client emits `thread:open` to subscribe to `conversation:{conversation_id}`.
- **Canonical Events Emitted**:
  - `conversation.message` (`message.new`): New inbound/outbound message persisted.
  - `conversation.status` (`conversation.status_changed`): Conversation status transition.
  - `conversation.assigned`: Thread assignment update.
  - `conversation.score` (`lead.score_updated`): Lead temperature score update.
  - `conversation.suggestion`: AI suggestion draft ready for staff review.
  - `notification.new`: High-priority in-app notification row for bell indicator.

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenant Isolation**: Sockets can only join rooms belonging to their authenticated `business_id`.
- 🛡️ **REST Source of Truth**: WebSocket is strictly an event delivery channel; all state mutations occur via REST.

---

## 5. Implementation Steps

1. Implement `RealtimeGateway` with JWT authentication and room joining.
2. Implement `RealtimeService` providing event dispatch helpers.
3. Author unit tests covering authentication, room isolation, and event emission.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Authenticated Connection**: Valid JWT establishes WebSocket connection.
- [ ] **Tenant Room**: Events broadcast strictly within tenant room.
- [ ] **Unauthenticated Reject (401)**: Invalid token rejects connection handshake.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/realtime

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA & Smoke test**: Connect Socket.IO client with JWT and test receiving `message.new` event.
- **👁️ Review & Sign-off**: Verify no cross-tenant room subscriptions are possible.

---

## 9. Expected Deliverables

WebSocket gateway, realtime module, and tests in `apps/api/src/realtime`.
