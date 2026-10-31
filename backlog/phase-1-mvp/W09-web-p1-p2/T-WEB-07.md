---
id: T-WEB-07
parent: T-WEB-07
wave: W9
status: done
optional: false
depends:
  - T-WEB-02
  - T-CONV-07
fs:
  - FS-WEB-04
read:
  - docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md
  - docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
files:
  - apps/web/src/app/(dashboard)/pipeline/page.tsx
  - apps/web/src/components/pipeline/pipeline-board.tsx
  - apps/web/src/components/pipeline/pipeline-column.tsx
  - apps/web/src/components/pipeline/pipeline-card.tsx
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-08
---

# Task: Web Sales Pipeline Kanban Board UI (`/pipeline`)

## 1. Objective & Value

Implement 4-stage visual Kanban board interface for commercial sales pipeline with deal value summaries and direct navigation to inbox threads.

**Why this exists**: Give store owners a high-level view of all active conversations and conversion stages without drag-and-drop state corruption.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(dashboard)/pipeline/`
- `apps/web/src/components/pipeline/`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- **4 Canonical Columns**:
  - `new_leads`: Inbound leads awaiting AI/staff interaction.
  - `qualified`: Purchase intent or hot lead score.
  - `payment_pending`: Orders in `PENDING_CONFIRMATION` (awaits staff confirmation).
  - `sold`: Confirmed/completed orders.
- **Card Action**: Clicking card navigates to `/inbox?conversationId=...`.
- **Totals**: Column headers render `count` and formatted TND currency sum (`totalValue`).
- **Realtime Updates**: Listens to Socket.IO events (`conversation.status`, `conversation.score`, `notification.new`) and refreshes pipeline state without manual page reload.

---

## 4. Invariants & Security Guardrails

- 🔒 **Read-Only Projection**: Drag-and-drop between columns is STRICTLY PROHIBITED. Pipeline stages are server-computed projections of underlying conversations and orders.
- 🔒 **Tenancy Boundary**: Displays data strictly for active workspace.

---

## 5. Implementation Steps

1. Implement `PipelineBoard` fetching data from `GET /api/v1/pipeline`.
2. Implement `PipelineColumn` with deal count and value sum headers.
3. Implement `PipelineCard` with customer name, product snapshot, temperature badge, and click router.
4. Author component tests covering column rendering, totals, and navigation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Kanban View**: Renders 4 canonical columns (`new_leads`, `qualified`, `payment_pending`, `sold`) with totals.
- [ ] **Navigation**: Clicking deal card opens corresponding thread in `/inbox`.
- [ ] **No Drag**: Cards are non-draggable to reflect server projection model.

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

- **🧪 Manual QA**: Navigate to `http://localhost:3000/pipeline` in browser and test card navigation to inbox.

---

## 9. Expected Deliverables

Sales pipeline Kanban page and components in `apps/web`.
