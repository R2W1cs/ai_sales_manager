---
id: W6
phase: phase-1-mvp
status: done
---

# W6 — Orders and customers

Start constraint from `30` §5, not a sprint name. Calendar is `31`.

**First card in this wave (depends-ready order):** [`T-ORD-01`](T-ORD-01.md)

## Cards

- [`T-ORD-01`](T-ORD-01.md) — Orders domain layer, lifecycle & stock reservation management (`/orders`)
- [`T-ORD-02`](T-ORD-02.md) — Stock reservation TTL worker & automated expiration sweeper
- [`T-ORD-03`](T-ORD-03.md) — Orders query API, filtering & detail view (`GET /orders`)
- [`T-ORD-04`](T-ORD-04.md) — Manual order draft creation from inbox conversation drawer
- [`T-CONV-07`](T-CONV-07.md) — Sales pipeline Kanban board API (`GET /pipeline`)
- [`T-HAND-02`](T-HAND-02.md) — Purchase intent handoff & order draft flow
- [`T-CUST-01`](T-CUST-01.md) — Customer profile resolution & multi-channel identity linking
- [`T-CUST-02`](T-CUST-02.md) — Customer profile management, tags & VIP flags (`/customers/:id`)
- [`T-CUST-03`](T-CUST-03.md) — Customer manual merge API & duplicate consolidation (`/customers/merge`)
- [`T-CUST-04`](T-CUST-04.md) — Customer lifecycle stage automated classification
