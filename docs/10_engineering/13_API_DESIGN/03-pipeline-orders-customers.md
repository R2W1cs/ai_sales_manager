## 7. Pipeline

`GET /api/v1/pipeline` — `inbox.read`. Read-only (FR-CONV-050–053). **No PATCH, no drag.**

Columns are a **projection** — no `pipeline_column` field:

| id                | Cards                                                                 | Copy                                                        |
| ----------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `new_leads`       | `NEW` or `AI_ACTIVE`, not hot, no pending order                       |                                                             |
| `qualified`       | `ORDER_INTENT_DETECTED` **or** `lead_temperature=hot` still AI-side   |                                                             |
| `payment_pending` | Orders `PENDING_CONFIRMATION` (not `is_test`)                         | UI: awaits **staff confirmation**, never “awaiting payment” |
| `sold`            | Orders `CONFIRMED` or `COMPLETED`, or conversations `ORDER_CONFIRMED` |                                                             |

Each column: `count` and `totalValue` are **full** aggregates; `cards[]` is a preview capped at `limit` (default 50, max 100, §2.7). Cards: `conversationId` and/or `orderId`, customer name, product snapshot, value, temperature. No `next_cursor` on the pipeline in MVP.

Do not add a fifth column.

---

## 8. Orders

Perm list/detail: `inbox.read` (employees see orders they need to close). Create/status: `orders.write`.

| Method  | Path                        | Notes                                                                                                                                                                                                                                                                                                             |
| ------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/v1/orders`            | Query: `status`, `from`, `to`, `created_by` (`ai` \| `user`), `cursor`                                                                                                                                                                                                                                            |
| `GET`   | `/api/v1/orders/:id`        |                                                                                                                                                                                                                                                                                                                   |
| `POST`  | `/api/v1/orders`            | Manual create (FR-ORD-003). Body: `customerId`, optional `conversationId`, `items[]` (`variantId`, `quantity`), optional `deliveryAddress`, `customerSnapshot`. Totals computed server-side from variants + delivery rule. **Idempotency-Key required**. Stock reserve/commit in one DB transaction (`12` §6.5)   |
| `PATCH` | `/api/v1/orders/:id/status` | Body: `{ "status": "CONFIRMED" \| "CANCELLED" \| "COMPLETED" }`, optional `paymentStatus`. Canonical writer. Confirm sets `order_confirmed_at` and emits `order.confirmed` so Conversations can move to `ORDER_CONFIRMED` (FR-ORD-005). Cancel releases reservations (FR-ORD-008). Invalid → `invalid_transition` |

No payment-provider routes. No fulfilment statuses.

---

## 9. Customers

| Method   | Path                              | Perm               | Notes                                                                                                                   |
| -------- | --------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/customers`               | `inbox.read`       | Query: `q`, `lifecycle_stage`, `tag`, `cursor`. Skip merged losers **and** `erased_at`                                  |
| `GET`    | `/api/v1/customers/export`        | `customers.export` | Stream `text/csv` (FR-CUST-009 Should). Skip erased. Do not buffer the whole file in memory. Register **before** `/:id` |
| `GET`    | `/api/v1/customers/:id`           | `inbox.read`       | Include identities, tags, notes, order + conversation summaries. Erased → **404**                                       |
| `PATCH`  | `/api/v1/customers/:id`           | `customers.write`  | Profile fields. VIP via tag `vip` (FR-CUST-008)                                                                         |
| `POST`   | `/api/v1/customers/:id/tags`      | `customers.write`  | `{ "tag": "vip" }`                                                                                                      |
| `DELETE` | `/api/v1/customers/:id/tags/:tag` | `customers.write`  |                                                                                                                         |
| `POST`   | `/api/v1/customers/:id/notes`     | `customers.write`  |                                                                                                                         |
| `GET`    | `/api/v1/customers/:id/notes`     | `inbox.read`       |                                                                                                                         |
| `POST`   | `/api/v1/customers/:id/merge`     | `customers.merge`  | Body: `{ "sourceCustomerId" }`. `:id` survives. Audited. Employee 403                                                   |
| `POST`   | `/api/v1/customers/:id/erase`     | `customers.erase`  | NFR-SEC-10. Tombstone + strip PII (`17` §8.3). **204**. Idempotent if already erased. Employee 403                      |

---
