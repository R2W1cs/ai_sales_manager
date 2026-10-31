---
id: T-OPS-03
parent: T-OPS-03
wave: W10
status: pending
optional: false
depends:
  - T-OPS-01
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
files:
  - apps/api/src/platform/health/health.controller.ts
  - apps/api/src/platform/health/health-indicators.service.ts
  - infra/terraform/cloudwatch.tf
done_cmd: pnpm --filter api test -- src/platform
next: T-OPS-04
---

# Task: CloudWatch alarms, structured logging & health endpoints (`/health/live`, `/health/ready`)

## 1. Objective & Value

Implement liveness/readiness health probes and CloudWatch alarms for 5xx errors, DLQ backlog, and database connection exhaustion.

**Why this exists**: Provide ALB with accurate health check signals and alert on-call engineers of system degradation.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/platform/health.*`
- `infra/terraform/cloudwatch.tf`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /health/live` (200 OK) -> Process liveness probe
- `GET /health/ready` (200 OK) -> Checks Postgres, Redis, and MinIO connectivity (returns 503 if DB down)

---

## 4. Invariants & Security Guardrails

- 🔒 **Probe Separation**: `/health/live` does not query DB; `/health/ready` validates database connectivity.

---

## 5. Implementation Steps

1. Implement health controller with Terminus health indicators.
2. Author CloudWatch alarms in Terraform.
3. Author unit tests for health probes.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Liveness Probe**: Returns 200 OK.
- [ ] **Readiness Probe**: Returns 200 when DB/Redis healthy, 503 when disconnected.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/platform

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Call `http://localhost:3001/health/ready` via curl.

---

## 9. Expected Deliverables

Health probe controller and CloudWatch alarms in `apps/api` and `infra`.
