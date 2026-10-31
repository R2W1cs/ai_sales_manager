---
id: T-CONV-01
parent: T-CONV-01
wave: W4
status: done
optional: false
depends:
  - T-INT-03
fs:
  - FS-CONV-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/conversations/threads/conversations.controller.ts
  - apps/api/src/conversations/threads/conversations.service.ts
  - apps/api/src/conversations/dto/list-conversations.dto.ts
  - apps/api/src/conversations/conversations.module.ts
done_cmd: pnpm --filter api test -- src/conversations
next: T-CONV-02
---

# Task: Conversations lifecycle, filtering & cursor pagination API (`/conversations`)

## 1. Objective & Value

Implement conversations listing and query API supporting `needs_me` vs `all` views, priority sort, multi-attribute filters, and opaque cursor pagination.

**Why this exists**: Sales reps and managers need an organized inbox view that immediately surfaces high-intent leads and conversations requiring urgent human response.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/conversations/threads/conversations.controller.ts`
- `apps/api/src/conversations/threads/conversations.service.ts`
- `apps/api/src/conversations/dto/list-conversations.dto.ts`
- `apps/api/src/conversations/conversations.module.ts`
- `packages/shared/src/conversations/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/ai/`

---

## 3. Technical Contract & Interfaces

- `GET /conversations` (200 OK)
- Query params: `view` ('needs_me' | 'all'), `sort` ('sales_priority' | 'recent'), `channel`, `status`, `assigneeId`, `leadTemperature`, `cursor`, `limit`
- Response: `{ items: ConversationSummaryDto[], nextCursor?: string, totalUnread: number }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Boundary**: Query must filter by `business_id`.
- 🛡️ **Playground Isolation**: Exclude `is_test = true` conversations by default.
- 🚫 **Negative Invariants**: Never sort on the client; return strict server-ordered streams.

---

## 5. Implementation Steps

1. Define `ListConversationsDto` with Zod validation in shared and api.
2. Implement `ConversationsService.listConversations()` with dynamic query builder and cursor pagination.
3. Implement `ConversationsController` with `@RequirePermission('inbox.read')`.
4. Author unit/integration tests covering views, filters, priority sorting, and cursor pagination.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Priority Sort**: Returns conversations ordered by descending `lead_score`.
- [ ] **Needs Me View**: Filters to conversations requiring human action.
- [ ] **Cursor Pagination**: Correctly traverses large datasets using cursor tokens.
- [ ] **Test Isolation**: Excludes playground test conversations.

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

- **🧪 Manual QA**: Call `GET /conversations?view=needs_me` in Swagger and verify priority order.
- **👁️ Review & Sign-off**: Verify database indexes support efficient cursor and tenant filtering.

---

## 9. Expected Deliverables

Conversations query controller, service, DTOs, and unit tests in `apps/api/src/conversations`.
