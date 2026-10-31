---
id: W7
phase: phase-1-mvp
status: done
---

# W7 — Notifications, usage, analytics

Start constraint from `30` §5, not a sprint name. Calendar is `31`.

**First card in this wave (depends-ready order):** [`T-NOTIF-01`](T-NOTIF-01.md)

## Cards

- [`T-NOTIF-01`](T-NOTIF-01.md) — Notification dispatcher & handoff/lead alert engine
- [`T-NOTIF-02`](T-NOTIF-02.md) — In-app notifications feed API & WebSocket bell push (`/notifications`)
- [`T-BILL-01`](T-BILL-01.md) — Billing subscription plans seed & database repository
- [`T-BILL-02`](T-BILL-02.md) — Usage events metering pipeline & hourly aggregation worker
- [`T-BILL-03`](T-BILL-03.md) — Quota enforcement engine, 85% warning & 100% hard limit gate (`/billing/usage`)
- [`T-BILL-04`](T-BILL-04.md) — AI inference cost & token consumption monitoring API (`/ai/usage`)
- [`T-ANL-01`](T-ANL-01.md) — Daily analytics aggregation worker & materialization pipeline
- [`T-ANL-02`](T-ANL-02.md) — Analytics dashboard summary & timeseries overview API (`/analytics/overview`)
