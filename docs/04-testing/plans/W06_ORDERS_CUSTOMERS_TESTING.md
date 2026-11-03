# Wave W6 Testing Specification — Orders, Stock Reservations & Customers

| Field       | Value                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Wave ID     | `W6`                                                                                     |
| Wave Title  | Orders, Stock Reservations & Customers                                                   |
| Cards       | `T-ORD-01` through `T-ORD-04`, `T-CUST-01` through `T-CUST-04`, `T-HAND-02`, `T-CONV-07` |
| Status      | Canonical AI Testing Guide for Wave W6 Completion Gate                                   |
| Focus Areas | Order state machine, stock reservation sweep, customer identities, merge, erasure (GDPR) |

---

## 1. Automated Verification Suites

```bash
# 1. Orders & Stock Reservations Suite
pnpm --filter api test -- src/orders

# 2. Customer CRM & Identities Suite
pnpm --filter api test -- src/customers

# 3. Full Monorepo Quality Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Order Lifecycle & Idempotency (`12` §9, `13` §7)

- **Allowed Order State Transitions**:
  - `PENDING_CONFIRMATION` -> `CONFIRMED` -> `COMPLETED` / `CANCELLED`.
  - Creating an order requires `Idempotency-Key` header (`orders.idempotency_key` unique per business).
  - Confirmed orders cannot be mutated via line-item PATCH.
- **Stock Reservation & Auto-Sweep (15 min)**:
  - Placing an order creates stock reservations for item variants.
  - Periodic background sweep job cancels expired reservations (>15 mins) and returns stock to available pool.

### B. Customer CRM & Social Identities (`12` §7)

- **Cross-Platform Identity Linking**:
  - Customer identified by phone/email or social PSID/IGSID.
  - Merging customer B into customer A moves historical conversations and identities to customer A; marks customer B `merged_into_customer_id = customer_A.id`.

### C. Right to Erasure / GDPR Compliance (`17_SECURITY_DESIGN.md` §8.3)

- **`POST /customers/:id/erase` Invariants**:
  - Sets `customers.erased_at = NOW()`, `name = 'Deleted customer'`, `phone`/`email`/`address` = null.
  - Deletes all rows in `customer_identities`, `customer_notes`, and `customer_tags`.
  - Anonymizes message bodies on threads (`content = '[redacted]'`).
  - Monetary order records and item snapshots preserved for fiscal compliance (PII stripped).

---

## 3. CLI Smoke & Integration Simulation

```bash
# 1. Create Pending Order
curl -s -X POST http://localhost:3001/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"$CUST_ID","conversationId":"$CONV_ID","items":[{"variantId":"$VAR_ID","quantity":1,"unitPrice":"85.000"}],"currency":"TND"}'

# 2. Test Customer Erasure
curl -i -s -X POST "http://localhost:3001/api/v1/customers/$CUST_ID/erase" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID"
# Verify status: HTTP/1.1 200 OK
```

---

## 4. Wave W6 Completion Gate Checklist

- [ ] All required leaves in W6 marked `status: done`.
- [ ] Order state transition and reservation sweep tests pass 100%.
- [ ] Customer erasure GDPR unit tests verify complete PII redaction.
- [ ] `pnpm check:full` exits 0.
