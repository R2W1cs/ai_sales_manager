---
id: W4
phase: phase-1-mvp
status: done
---

# W4 — Inbox API, scoring, realtime

Start constraint from `30` §5, not a sprint name. Calendar is `31`.

**First card in this wave (depends-ready order):** [`T-CONV-01`](T-CONV-01.md)

## Cards

- [`T-CONV-01`](T-CONV-01.md) — Conversations lifecycle, filtering & cursor pagination API (`/conversations`)
- [`T-CONV-02`](T-CONV-02.md) — Message thread, sending, actions (approve/retry/takeover/resume/assign/close/notes)
- [`T-CONV-03`](T-CONV-03.md) — Conversation state machine & legal transitions engine
- [`T-CONV-04`](T-CONV-04.md) — Redis distributed conversation lock for AI/human turns
- [`T-CONV-05`](T-CONV-05.md) — Conversation timeline projection API (`GET /conversations/:id/timeline`)
- [`T-CONV-06`](T-CONV-06.md) — Realtime WebSocket gateway & rooms (Socket.IO)
- [`T-LEAD-01`](T-LEAD-01.md) — Deterministic lead scoring engine & priority calculation
