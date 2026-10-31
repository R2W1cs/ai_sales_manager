---
id: T-WEB-03
parent: T-WEB-03
wave: W8
status: done
optional: false
depends:
  - T-WEB-02
  - T-CONV-02
  - T-ORD-01
  - T-AI-08
fs:
  - FS-WEB-02
read:
  - docs/20_design/22_UX_FLOWS/02-inbox-three-pane-command-center.md
  - docs/20_design/23_UI_COMPONENTS/03-inbox-command-center.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/web/src/app/(dashboard)/inbox/page.tsx
  - apps/web/src/components/inbox/conversation-list.tsx
  - apps/web/src/components/inbox/conversation-thread.tsx
  - apps/web/src/components/inbox/message-bubble.tsx
  - apps/web/src/components/inbox/draft-approval-card.tsx
  - apps/web/src/components/inbox/order-drawer.tsx
  - apps/web/src/components/inbox/inbox-action-bar.tsx
  - apps/web/src/hooks/use-realtime-inbox.ts
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-04
---

# Task: Web Realtime Inbox UI (threads, messages, actions, draft approval, order drawer)

## 1. Objective & Value

Implement web Realtime Inbox interface with conversation list, real-time message stream, AI draft approval cards, API-bound takeover/resume toggle, lead score pills, AI suggest trigger, and order confirmation drawer.

**Why this exists**: The primary operational surface for merchants to manage conversations, approve AI drafts, chat with shoppers, and convert orders.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(dashboard)/inbox/`
- `apps/web/src/components/inbox/`
- `apps/web/src/hooks/use-realtime-inbox.*`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- **3-Pane Layout**:
  - Pane 1 (Left): Filter/search tabs (`all`, `needs_me`), conversation list with lead score temperature badges (`hot` | `warm` | `cold`).
  - Pane 2 (Middle): Active conversation thread with message bubbles, takeover banner, draft approval card, and action bar.
  - Pane 3 (Right): Customer snapshot, commercial notes, and Order Drawer (`POST /api/v1/orders` / `PATCH /api/v1/orders/:id/status`).
- **Takeover & Resume API Binding**:
  - Takeover button calls `POST /api/v1/conversations/:id/takeover` (sets state to `HUMAN_REQUIRED` / pauses AI).
  - Resume button calls `POST /api/v1/conversations/:id/resume-ai` (resumes AI handling).
- **Draft vs Human Send Race Resolution**:
  - Sending a manual human message automatically dismisses pending draft card.
- **WebSocket Reconnection & Backfill**:
  - Listens to canonical events (`conversation.message`, `conversation.status`, `conversation.score`, `conversation.suggestion`).
  - On socket disconnect/reconnect, triggers backfill: `GET /api/v1/conversations/:id/messages?after={lastMessageId}` to avoid dropped messages.
- **Optimistic UI & Rollback**:
  - Sent messages render optimistically; on send error, bubble shows red error state with retry/delete action.

---

## 4. Invariants & Security Guardrails

- 🔒 **API-Bound Takeover State**: Takeover banner (`AI Paused / Mode Humain`) is visible strictly when `conversation.status === 'HUMAN_REQUIRED'` or `aiEnabled === false`, verified directly from server state and realtime `conversation.status` events.
- 🛡️ **Zero Polling When Connected**: Relies on WebSocket for live updates; falls back to cursor fetch on reconnect.
- 🚫 **No State Desync**: Human messages automatically cancel pending drafts and trigger takeover mode on server.

---

## 5. Implementation Steps

1. Implement `useRealtimeInbox` hook handling Socket.IO connection, room join, event dispatch, and reconnect backfill.
2. Implement `ConversationList` with search, `needs_me` filter, and lead badges.
3. Implement `ConversationThread` with message bubbles, error retry states, and draft approval card (`POST /api/v1/conversations/:id/approve`).
4. Implement `InboxActionBar` with input, AI suggest trigger (`POST /api/v1/conversations/:id/suggest`), and takeover toggle.
5. Implement `OrderDrawer` connecting to orders API.
6. Author component tests covering draft approval, takeover toggle, optimistic rollback, and reconnect backfill.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **3-Pane Inbox**: Renders conversation list, active thread, and details drawer.
- [ ] **API Takeover**: Clicking Takeover calls `/takeover` and shows persistent takeover banner; clicking Resume calls `/resume-ai`.
- [ ] **Draft Action**: Approving draft dispatches message and clears draft card.
- [ ] **Reconnect Backfill**: Reconnecting socket fetches any messages received during disconnection.
- [ ] **Optimistic Rollback**: Failed message send displays retry indicator.

---

## 7. Verification Commands

```bash
# 1. Run typecheck & lint
pnpm --filter web check-types && pnpm --filter web lint

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA & Smoke test**: Open `http://localhost:3000/inbox`; select thread, approve AI draft, send reply, toggle takeover, confirm draft order in drawer.
- **👁️ Review & Sign-off**: Verify WebSocket reconnect logic and optimistic UI rollback on error.

---

## 9. Expected Deliverables

Realtime Inbox page, components, and tests in `apps/web`.
