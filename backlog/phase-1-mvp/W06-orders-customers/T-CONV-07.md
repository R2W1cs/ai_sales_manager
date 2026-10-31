---
id: T-CONV-07
parent: T-CONV-07
wave: W6
status: done
optional: false
depends:
  - T-LEAD-01
  - T-ORD-01
fs:
  - FS-CONV-02
read:
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/conversations/pipeline/pipeline.controller.ts
  - apps/api/src/conversations/pipeline/pipeline.service.ts
  - apps/api/src/conversations/conversations.module.ts
  - packages/shared/src/conversations/index.ts
done_cmd: pnpm --filter api test -- src/conversations
next: T-HAND-02
---

# Task: Sales pipeline Kanban board API (`GET /pipeline`)

## 1. Objective & Value

Implement 4-stage commercial sales pipeline Kanban aggregation endpoint (`GET /api/v1/pipeline`) projecting real-time conversation and order states into canonical columns (`new_leads`, `qualified`, `payment_pending`, `sold`).

**Why this exists**: Give store owners a high-level visual pipeline of all active deals and conversion velocity without manual drag-and-drop state drift.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/conversations/`
- `packages/shared/src/conversations/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /api/v1/pipeline` (200 OK) — Permission: `@RequirePermission('inbox.read')`.
- **4 Canonical Columns (Dynamic Projection)**:
  - `new_leads`: Conversations with status `NEW` or `AI_ACTIVE`, not hot, no pending order.
  - `qualified`: Conversations with status `ORDER_INTENT_DETECTED` OR `lead_temperature = 'hot'` still on AI side.
  - `payment_pending`: Orders with status `PENDING_CONFIRMATION` (excluding test orders; UI label: awaits staff confirmation).
  - `sold`: Orders with status `CONFIRMED` / `COMPLETED`, or conversations with status `ORDER_CONFIRMED`.
- **Response Shape**:
  ```json
  {
    "columns": {
      "new_leads": { "count": 12, "totalValue": 0, "cards": [...] },
      "qualified": { "count": 5, "totalValue": 245000, "cards": [...] },
      "payment_pending": { "count": 3, "totalValue": 180000, "cards": [...] },
      "sold": { "count": 28, "totalValue": 1420000, "cards": [...] }
    }
  }
  ```
- **Card Payload**: `conversationId`, optional `orderId`, `customerName`, `productSnapshot`, `value` (in millimes), `temperature` (`cold`|`warm`|`hot`), `lastActivityAt`.
- **Limits**: `count` and `totalValue` are full aggregates; `cards[]` preview is capped at `limit` (default 50, max 100).

---

## 4. Invariants & Security Guardrails

- 🔒 **Read-Only Dynamic Projection**: Pipeline is strictly a read-only projection derived from `conversations` and `orders`. No `pipeline_column` column in DB, no `PATCH /pipeline`, and no drag-and-drop status mutation.
- 🚫 **No 5th Column**: Strictly 4 columns as defined in `13_API_DESIGN.md` §7.
- 🛡️ **Tenancy Boundary**: Scoped strictly to caller's `business_id`.

---

## 5. Implementation Steps

1. Define pipeline response DTOs and card schemas in `packages/shared`.
2. Implement `PipelineService.getPipeline(businessId, limit)` querying active conversations and pending/confirmed orders in parallel.
3. Map entities into the 4 canonical columns with computed `count`, `totalValue`, and preview `cards`.
4. Implement `PipelineController` with `@RequirePermission('inbox.read')`.
5. Author unit tests verifying exact stage categorization rules, values calculation, and limit caps.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **4 Canonical Columns**: Returns `new_leads`, `qualified`, `payment_pending`, and `sold` columns.
- [ ] **Accurate Categorization**: Hot leads / order intent mapped to `qualified`; `PENDING_CONFIRMATION` orders mapped to `payment_pending`.
- [ ] **Aggregate Totals**: `count` and `totalValue` accurately sum all eligible records.
- [ ] **Tenancy Isolation (403)**: Accessing another tenant returns 403 Forbidden.

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

- **🧪 Manual QA**: Call `GET /api/v1/pipeline` in Swagger and verify deal cards distribution against seeded conversations and orders.

---

## 9. Expected Deliverables

Pipeline aggregation controller, service, and unit tests in `apps/api/src/conversations`.
