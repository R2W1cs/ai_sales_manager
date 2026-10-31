---
id: T-NOTIF-02
parent: T-NOTIF-02
wave: W7
status: done
optional: false
depends:
  - T-NOTIF-01
  - T-CONV-06
fs:
  - FS-NOTIF-01
read:
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/notifications/core/notifications.controller.ts
  - apps/api/src/notifications/core/notifications.service.ts
done_cmd: pnpm --filter api test -- src/notifications
next: T-BILL-01
---

# Task: In-app notifications feed API & WebSocket bell push (`/notifications`)

## 1. Objective & Value

Implement in-app notifications query API and real-time WebSocket push for the navigation header bell with per-user unread isolation.

**Why this exists**: Allow staff to view unread notification count, browse recent alert history, and mark alerts as read without affecting colleagues' read status.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/notifications/`
- `packages/shared/src/notifications/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /api/v1/notifications` (200 OK) — Query: `unread=true`, `cursor`.
  - Filters: `WHERE user_id = request.userId AND business_id = request.tenantId`.
  - Sort: `handoff_priority` (urgent first), then `created_at DESC` (FR-NOTIF-003).
  - Response: `{ items: NotificationItem[], unreadCount: number, nextCursor: string | null }`.
- `PATCH /api/v1/notifications/:id/read` (204 No Content) — Marks single notification read (`read_at = NOW()`) for calling user.
- `POST /api/v1/notifications/read-all` (204 No Content) — Marks all unread notifications read for `WHERE user_id = request.userId AND business_id = request.tenantId`.
- **Realtime Push**: Emits `notification.new` to user room `user:{userId}` and tenant room `business:{businessId}`.

---

## 4. Invariants & Security Guardrails

- 🔒 **User Read Isolation**: Read status is strictly per user; marking a notification as read does NOT mark it read for other members of the tenant.
- 🔒 **Tenancy Boundary**: Queries strictly scoped to caller's `business_id` and `user_id`.

---

## 5. Implementation Steps

1. Implement `NotificationsService.getFeed(userId, businessId, unreadOnly, cursor)` and unread counter.
2. Implement `NotificationsService.markRead(id, userId, businessId)` and `markAllRead(userId, businessId)`.
3. Implement `NotificationsController` with HTTP routes returning 200/204.
4. Author unit tests verifying user-level read isolation, unread count accuracy, and tenant boundaries.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Notification Feed**: Returns unread count and recent notifications scoped to calling user.
- [ ] **Per-User Mark Read**: Marking a notification read updates `read_at` for that user only.
- [ ] **Read All**: Clears unread count for calling user without impacting other tenant members.
- [ ] **Realtime Push**: Dispatches `notification.new` event to user's WebSocket room.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/notifications

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Call `GET /api/v1/notifications` as User A, call mark-read, verify User B still sees unread count via Swagger.

---

## 9. Expected Deliverables

Notifications feed controller, service, and tests in `apps/api/src/notifications`.
