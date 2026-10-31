---
id: T-NOTIF-01
parent: T-NOTIF-01
wave: W7
status: done
optional: false
depends:
  - T-HAND-01
  - T-LEAD-01
fs:
  - FS-NOTIF-01
read:
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/notifications/dispatcher/notification-dispatcher.service.ts
  - apps/api/src/notifications/dispatcher/notifications.processor.ts
  - apps/api/src/notifications/notifications.module.ts
done_cmd: pnpm --filter api test -- src/notifications
next: T-NOTIF-02
---

# Task: Notification dispatcher & handoff/lead alert engine

## 1. Objective & Value

Implement notification dispatcher routing handoff alerts, hot lead discoveries, and quota warnings with canonical deduplication keys and user fan-out.

**Why this exists**: Ensure staff are instantly notified of high-priority events requiring immediate attention without notification spam.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/notifications/`
- `packages/shared/src/notifications/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `NotificationDispatcherService.dispatch(event)`
- **Four Canonical Notification Types** (`12` §13.1, FR-NOTIF-010):
  - `HANDOFF_REQUIRED`: Human handoff triggered (high/urgent priority).
  - `HOT_LEAD`: Shopper lead temperature elevated to `hot`.
  - `ORDER_PENDING`: Draft order ready for staff confirmation.
  - `USAGE_WARNING_85`: Quota reached 85% threshold.
- **Canonical Deduplication Keys** (`12` §13.1):
  - Hourly bucket key: `dedupe_key = {type}:{entity_id}:{yyyy-MM-ddTHH}` (e.g. `handoff_required:conv-123:2026-08-28T08`).
  - Quota key: `usage_warning_85:{businessId}:{yyyy-MM}` (one per monthly cycle).
- **Event Prioritization**: When both `HANDOFF_REQUIRED` and `HOT_LEAD` trigger on the same conversation, dispatch `HANDOFF_REQUIRED` with `hot_lead` included in the briefing context rather than duplicate notifications.
- **User Fan-Out**: Inserts one notification row per active member in the tenant (`user_id = member.userId`, `business_id = tenantId`).

---

## 4. Invariants & Security Guardrails

- 🔒 **Unique Deduplication**: Database unique constraint on `(user_id, dedupe_key)` guarantees zero duplicate rows.
- 🔒 **Per-User Isolation**: Notifications belong to individual users so read statuses do not collide across team seats.

---

## 5. Implementation Steps

1. Implement `NotificationDispatcherService` generating canonical `dedupe_key` strings.
2. Implement BullMQ `notifications.processor.ts` fanning out notification rows across active tenant members.
3. Emit `notification.new` to each user's realtime room (`user:{userId}`).
4. Author unit tests covering deduplication, prioritization, and tenant member fan-out.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Handoff Alert**: Creates notification row for all tenant members when handoff is triggered.
- [ ] **Suppression**: Subsequent alerts with identical `dedupe_key` within the hour are suppressed.
- [ ] **Priority Collapsing**: Simultaneous handoff + hot lead emits a single unified notification.

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

- **🧪 Manual QA**: Trigger handoff alert in Swagger and inspect rows created in `notifications` table per user.

---

## 9. Expected Deliverables

Notification dispatcher service, processor, and tests in `apps/api/src/notifications`.
