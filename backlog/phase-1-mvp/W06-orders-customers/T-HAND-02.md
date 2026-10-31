---
id: T-HAND-02
parent: T-HAND-02
wave: W6
status: done
optional: false
depends:
  - T-HAND-01
  - T-ORD-01
fs:
  - FS-HAND-01
read:
  - docs/00_product/06_AI_HUMAN_HANDOFF_RULES/02-takeover-lifecycle-events.md
  - docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/handoff/purchase-handoff.service.ts
  - apps/api/src/ai/handoff/purchase-handoff.spec.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-CUST-01
---

# Task: Purchase intent handoff & order draft flow

## 1. Objective & Value

Implement end-to-end purchase intent handoff flow: AI collects customer name/phone/address, places 30-min stock reservation, drafts order, pauses AI, and generates handoff briefing for sales rep.

**Why this exists**: Automate 90% of order preparation while allowing a human sales rep to perform final confirmation with the customer.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/purchase-handoff.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `PurchaseHandoffService.handlePurchaseIntent(conversationId, intentData)`
- Creates draft order in `PENDING_CONFIRMATION`, sets `ai_enabled = false`, status = `HUMAN_REQUIRED`, inserts order briefing note in thread.

---

## 4. Invariants & Security Guardrails

- 🔒 **Stock Hold Guarantee**: Never transition to purchase handoff without successfully placing stock reservation hold.

---

## 5. Implementation Steps

1. Implement purchase intent extractor and validator.
2. Integrate order drafting and stock reservation hold.
3. Transition conversation state and generate structured briefing.
4. Author exhaustive unit tests verifying end-to-end purchase handoff.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Purchase Flow**: Inbound purchase intent creates draft order, reserves stock, and notifies human.
- [ ] **Insufficient Stock**: If stock is insufficient, triggers `STOCK_OUTAGE` handoff instead of drafting order.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/ai

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA & Smoke test**: Simulate customer purchase dialogue in test runner; verify draft order and briefing note appear.
- **👁️ Review & Sign-off**: Verify stock hold is placed prior to handoff notification.

---

## 9. Expected Deliverables

Purchase handoff service and test suite in `apps/api/src/ai`.
