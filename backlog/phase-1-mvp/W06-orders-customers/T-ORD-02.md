---
id: T-ORD-02
parent: T-ORD-02
wave: W6
status: done
optional: false
depends:
  - T-ORD-01
fs:
  - FS-ORD-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/orders/reservations/reservation-sweeper.service.ts
  - apps/api/src/orders/reservations/reservation-sweeper.processor.ts
done_cmd: pnpm --filter api test -- src/orders
next: T-ORD-03
---

# Task: Stock reservation TTL worker & automated expiration sweeper

## 1. Objective & Value

Implement background worker to automatically expire unconfirmed 30-minute stock reservations and restore available inventory.

**Why this exists**: Prevent abandoned order drafts from indefinitely locking up merchant stock.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/orders/reservation-sweeper.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Worker runs every 1 minute via BullMQ repeatable job.
- Finds `stock_reservations` with `status = 'ACTIVE'` and `expires_at < NOW()`.
- Marks `status = 'EXPIRED'`, updates linked order to `CANCELLED` (reason: `EXPIRED_RESERVATION`).

---

## 4. Invariants & Security Guardrails

- 🔒 **Idempotent Sweeper**: Running sweeper multiple times must produce identical results without double-restoring stock.

---

## 5. Implementation Steps

1. Implement `ReservationSweeperService` with batch expiry query.
2. Implement BullMQ repeatable sweeper processor.
3. Author unit tests covering reservation expiry and order cancellation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Automated Expiry**: Expired holds transition to EXPIRED status.
- [ ] **Inventory Restoration**: Available stock restores immediately upon hold expiry.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/orders

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Create draft order, set expiration timestamp to past in DB, run sweeper worker and verify status updates to EXPIRED.

---

## 9. Expected Deliverables

Reservation sweeper service and background processor in `apps/api/src/orders`.
