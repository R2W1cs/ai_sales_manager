---
id: T-CUST-03
parent: T-CUST-03
wave: W6
status: done
optional: false
depends:
  - T-CUST-01
  - T-BIZ-07
fs:
  - FS-CUST-01
read:
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/customers/customers.module.ts
  - apps/api/src/customers/identity/merge.controller.ts
  - apps/api/src/customers/identity/merge.service.ts
  - apps/api/src/customers/dto/merge-customers.dto.ts
done_cmd: pnpm --filter api test -- src/customers
next: T-CUST-04
---

# Task: Customer manual merge API & duplicate consolidation (`/customers/:id/merge`)

## 1. Objective & Value

Implement manual customer merge API consolidating duplicate customer records, orders, identities, and conversation histories in an atomic transaction with row locking, idempotency, and collision handling.

**Why this exists**: Allow store managers and admins to merge duplicate profiles created before phone numbers were identified into a single canonical customer record.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/customers/`
- `packages/shared/src/customers/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `POST /api/v1/customers/:id/merge` (200 OK) -> Body `{ "sourceCustomerId": string }` (`:id` is the survivor, `sourceCustomerId` is the duplicate).
- **Idempotency-Key**: Required header; recorded in `idempotency_keys` table.
- **Pessimistic Locking**: `SELECT ... FOR UPDATE` on both customer records ordered by UUID to prevent deadlocks and concurrent merge races.
- **Cycle & Guardrails**:
  - Rejects if `id === sourceCustomerId` (400 Bad Request).
  - Rejects if either customer is soft-deleted/erased (`erased_at IS NOT NULL`) or already merged (`merged_into_customer_id IS NOT NULL`) (409 Conflict).
- **Consolidation**:
  - Re-points foreign keys on `orders`, `conversations`, and `notes` to survivor ID (`:id`).
  - Merges `customer_identities`: If duplicate identity with same `(platform, platform_user_id)` exists on survivor, delete duplicate identity; otherwise re-point identity to survivor.
  - **Explicit Field-Level Conflict Matrix**:
    - `name`: Survivor non-null value wins; fallback to duplicate `name` if survivor `name` is null.
    - `phone`: Survivor verified phone wins; fallback to duplicate `phone` if survivor has no verified phone.
    - `email`: Survivor email wins; fallback to duplicate `email` if survivor `email` is null.
    - `address`: Survivor address wins; fallback to duplicate `address` if survivor `address` is null.
    - `language`: Survivor language preference wins.
    - `notes`: Concatenates duplicate notes to survivor notes with a timestamp separator (`\n--- Merged from [date] ---\n`).
    - `tags`: Set union (`Array.from(new Set([...survivorTags, ...duplicateTags]))`).
  - Loser record: Sets `merged_into_customer_id = :id` (not hard-deleted).
  - Recalculates survivor lifecycle metrics (`confirmed_order_count`, `last_confirmed_order_at`, `lifecycle_stage`).
  - **Structured Audit Log Payload**: Records entry in `audit_logs` table:
    ```json
    {
      "action": "customer.merge",
      "entity_type": "customer",
      "entity_id": ":id",
      "actor_user_id": "user-uuid",
      "payload": {
        "survivorId": ":id",
        "duplicateId": "sourceCustomerId",
        "ordersMoved": 3,
        "conversationsMoved": 2,
        "identitiesMoved": 1,
        "fieldsMerged": ["phone", "tags", "notes"]
      }
    }
    ```

---

## 4. Invariants & Security Guardrails

- 🔒 **Atomic Merge Transaction**: All FK updates, identity resolution, audit logging, and loser marking execute in a single DB transaction.
- 🛡️ **RBAC Permission**: Requires `@RequirePermission('customers.merge')`. `EMPLOYEE` role returns 403 Forbidden.
- 🔒 **Tenancy Boundary**: Both survivor and duplicate must belong to caller's `business_id`. Cross-tenant merge returns 403 Forbidden.

---

## 5. Implementation Steps

1. Define merge DTO and validation schema in shared/api.
2. Implement `MergeService.merge()` with ordered row locking (`FOR UPDATE`), cycle validation, identity collision resolution, and lifecycle aggregate recalculation.
3. Mark duplicate `merged_into_customer_id = survivorId` and create audit log entry.
4. Implement `MergeController` with `@RequirePermission('customers.merge')` and idempotency guard.
5. Author unit/integration tests covering atomic merge, rollback on error, identity deduplication, and role checks.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Merge Profiles**: Orders, conversations, and non-colliding identities transfer to survivor profile.
- [ ] **Identity Deduplication**: Identical platform identities on both profiles are deduplicated cleanly without unique constraint violation.
- [ ] **Self-Merge & Cycle Guard (400/409)**: Attempting to merge a customer into itself or an already merged customer returns 400/409.
- [ ] **RBAC (403)**: Employee attempting merge receives 403 Forbidden.
- [ ] **Audit Entry**: Logs `customer.merge` audit action with actor user ID.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/customers

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Call `POST /api/v1/customers/:id/merge` via Swagger with 2 test customer IDs as Owner; verify merged orders and loser `merged_into_customer_id` in Prisma Studio.

---

## 9. Expected Deliverables

Customer merge controller, service, and comprehensive tests in `apps/api/src/customers`.
