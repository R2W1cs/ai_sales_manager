# Wave W10 Testing Specification — Production Infrastructure & Launch Gate

| Field       | Value                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Wave ID     | `W10`                                                                                    |
| Wave Title  | Production Infrastructure & Launch Gate                                                  |
| Cards       | `T-OPS-01` through `T-OPS-07` (14 leaves)                                                |
| Status      | Canonical AI Testing Guide for Wave W10 Final Launch Gate                                |
| Focus Areas | ECS Fargate, ALB health checks, Tenancy Stress Suite, CloudWatch Alarms, MVP Launch Gate |

---

## 1. Automated Verification Suites

```bash
# 1. Tenancy Attack Suite (100% Pass Required)
pnpm --filter api test -- src/platform/security/tenancy-attack.spec.ts

# 2. ALB Backend Readiness Check
curl -f -s http://localhost:3001/ready || exit 1

# 3. Final Full Launch Gate Command
python3 backlog/_build.py --check-launch
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Master Cross-Tenant Attack Suite (`17_SECURITY_DESIGN.md` §4)

- **Automated Tenancy Fuzzing**:
  - Executes 1,000 automated attack requests across all 45+ endpoints.
  - Passes valid tokens for Tenant A while querying/mutating Tenant B resources (`/businesses/:id`, `/conversations/:id`, `/orders/:id`, `/catalog/products/:id`, `/customers/:id`).
  - **Zero Leak Invariant**: Every request MUST return either `403 Forbidden` or `404 Not Found`. Not a single byte of Tenant B data may leak.

### B. ALB & Infrastructure Health Checks (`18_DEPLOYMENT.md` §6)

- **Readiness vs Liveness Endpoints**:
  - `GET /ready`: ALB matcher. Returns `200 OK` ONLY if Postgres AND Redis are reachable. If DB is down, returns `503 Service Unavailable`.
  - `GET /health/live`: Terminus process liveness check.

### C. Final Launch Gate Integrity (`T-OPS-07`)

- **Launch Gate Criteria**:
  - 100% of required backlog cards across Waves W0 through W10 verified in `status: done`.
  - `python3 backlog/_build.py --check-launch` exits 0.
  - Zero TypeScript compiler errors (`tsc -b`).
  - Zero ESLint errors or warnings across all packages.
  - Zero failing unit, integration, or E2E tests.

---

## 3. CLI Smoke & Launch Verification

```bash
# 1. Verify ALB Readiness Endpoint
curl -i -s http://localhost:3001/ready
# Expected: HTTP/1.1 200 OK {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}}

# 2. Execute Full Launch Gate Verification
python3 backlog/_runner.py verify T-OPS-07
```

---

## 4. Wave W10 / Final Launch Gate Checklist

- [ ] All required Phase 1 MVP cards marked `done`.
- [ ] Master cross-tenant attack suite passes with 0 leaks.
- [ ] ALB `/ready` health check operational.
- [ ] `python3 backlog/_build.py --check-launch` succeeds.
- [ ] `pnpm check:full` passes cleanly.
