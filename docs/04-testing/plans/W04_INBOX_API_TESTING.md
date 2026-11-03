# Wave W4 Testing Specification — Conversations, Inbox API & Realtime

| Field       | Value                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Wave ID     | `W4`                                                                                       |
| Wave Title  | Conversations, Inbox API & Realtime                                                        |
| Cards       | `T-CONV-01` through `T-CONV-06`, `T-LEAD-01` (13 leaves)                                   |
| Status      | Canonical AI Testing Guide for Wave W4 Completion Gate                                     |
| Focus Areas | State machine, sales priority sort, staff takeover, Socket.IO rooms, deterministic scoring |

---

## 1. Automated Verification Suites

```bash
# 1. Conversations Module Tests
pnpm --filter api test -- src/conversations

# 2. Lead Scoring Deterministic Rules
pnpm --filter api test -- src/lead-scoring

# 3. Realtime Socket.IO Gateway Tests
pnpm --filter api test -- src/realtime

# 4. Workspace Full Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Inbox Sales Priority Ranking (`13` §6.1, `FR-LEAD-009`)

- **Sorting Comparator Tuple**:
  - `GET /conversations?sort=sales_priority` ranks strictly in this order:
    1. `HUMAN_REQUIRED` / `HUMAN_HANDLING` prioritized by `handoff_priority` (high -> medium -> low), then oldest `handoff_at`.
    2. `lead_temperature` (`hot` -> `warm` -> `cold`).
    3. `lead_score` descending (`0–100`).
    4. `last_message_at` descending.
  - Escalations always appear ahead of normal bot conversations regardless of lead score.

### B. Conversation State Machine & Staff Takeover (`14_SYSTEM_DESIGN.md` §2)

- **Allowed State Transitions**:
  - `BOT_ACTIVE` -> Staff sends message -> `ai_enabled = false` and status becomes `HUMAN_HANDLING`.
  - `HUMAN_REQUIRED` -> Staff clicks takeover -> `HUMAN_HANDLING` (sync SLA <500ms).
  - `resume-ai` -> Fails with `409 pending_order_blocks_resume` if an unconfirmed pending order exists on the thread.
- **Prohibited Statuses**:
  - `snooze` / `SNOOZED` status is strictly forbidden in this product model.

### C. Socket.IO Multi-Tenant Room Isolation (`13` §14, `17` §4)

- **Handshake & Room Authorization**:
  - Client authenticates with access JWT and joins `business:{business_id}`.
  - Client attempting to subscribe or listen to another tenant's room receives immediate disconnect.
  - Member removal immediately disconnects user socket from tenant room.

---

## 3. CLI Smoke & Integration Simulation

```bash
# 1. Fetch Conversations in Sales Priority Order
curl -s -X GET "http://localhost:3001/api/v1/conversations?sort=sales_priority&view=needs_me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" | jq '.data[] | {id, status, handoffPriority, leadScore}'

# 2. Staff Takeover Simulation
curl -s -X POST "http://localhost:3001/api/v1/conversations/$CONV_ID/takeover" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" \
  -H "Idempotency-Key: $(uuidgen)"
```

---

## 4. Wave W4 Completion Gate Checklist

- [ ] All 13 leaves in W4 marked `status: done`.
- [ ] Sorting comparator unit tests verify all 4 ranking tiers.
- [ ] State transition and takeover tests pass 100%.
- [ ] `pnpm check:full` exits 0.
