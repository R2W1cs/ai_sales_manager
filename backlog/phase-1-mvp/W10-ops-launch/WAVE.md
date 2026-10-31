---
id: W10
phase: phase-1-mvp
status: pending
---

# W10 — Ops and launch gate

Start constraint from `30` §5, not a sprint name. Calendar is `31`.

**First card in this wave (depends-ready order):** [`T-OPS-01`](T-OPS-01.md)

## Cards

- [`T-OPS-01`](T-OPS-01.md) — Production Terraform infrastructure (ECS Fargate ×3, RDS Postgres 16, Redis, S3, ALB)
- [`T-OPS-02`](T-OPS-02.md) — CI/CD deployment workflow & zero-downtime rolling update pipeline
- [`T-OPS-03`](T-OPS-03.md) — CloudWatch alarms, structured logging & health endpoints (`/health/live`, `/health/ready`)
- [`T-OPS-04`](T-OPS-04.md) — Comprehensive security matrix test suite (multi-tenant isolation & RBAC)
- [`T-OPS-05`](T-OPS-05.md) — System fault injection & resilience verification suite
- [`T-OPS-06`](T-OPS-06.md) — Operational runbook, incident response guides & backup verification
- [`T-OPS-07`](T-OPS-07.md) — Phase 1 MVP Launch Gate sign-off & Must requirements verification
