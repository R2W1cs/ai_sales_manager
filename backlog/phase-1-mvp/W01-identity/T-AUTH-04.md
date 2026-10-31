---
id: T-AUTH-04
parent: T-AUTH-04
wave: W1
status: done
optional: false
depends:
  - T-AUTH-01/c
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/auth/guards/auth-throttler.guard.ts
  - apps/api/src/auth/auth.module.ts
done_cmd: pnpm --filter api test -- src/auth
next: T-BIZ-01
---

# Task: Auth rate limiting / throttles 5/min

## 1. Objective & Value

Implement Redis-backed rate limiting on authentication routes (5 requests/min per IP) to prevent credential stuffing.

**Why this exists**: Protect public authentication endpoints from automated brute-force attacks and credential stuffing per NFR-SEC-09.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/auth/guards/auth-throttler.guard.ts`
- `apps/api/src/auth/auth.module.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/platform/`

---

## 3. Technical Contract & Interfaces

- Rate Limit: 5 requests per 60 seconds per client IP on `/auth/login`, `/auth/register`, `/auth/forgot`.
- Breach Response: HTTP 429 Too Many Requests with `Retry-After: <seconds>` header and error envelope `{ error: { code: 'RATE_LIMIT_EXCEEDED' } }`.

---

## 4. Invariants & Security Guardrails

- 🔒 **Redis State**: Rate limit counters are stored in Redis with TTL to avoid memory leaks.
- 🛡️ **Fail Safe**: If Redis is temporarily unreachable, fail open with warning log rather than dropping valid auth traffic.

---

## 5. Implementation Steps

1. Configure NestJS `ThrottlerModule` with Redis storage driver.
2. Implement `AuthThrottlerGuard` with custom error envelope and `Retry-After` header.
3. Apply guard to `/auth/login`, `/auth/register`, and `/auth/forgot` routes.
4. Author unit/integration tests verifying 429 response on 6th request within window.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Normal Traffic**: 5 requests within 1 minute succeed normally.
- [ ] **Rate Limit Breach (429)**: 6th request returns 429 Too Many Requests.
- [ ] **Header Invariant**: Response includes `Retry-After` integer header indicating remaining seconds.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/auth

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 Environment variables**: Ensure Redis connection URL is set in `.env` (`REDIS_URL`).
- **🧪 Manual QA & Smoke test**: Send 6 rapid curl requests to `/auth/login` and observe 429 response on 6th attempt.
- **👁️ Review & Sign-off**: Verify other non-auth endpoints are unaffected by the 5/min limit.

---

## 9. Expected Deliverables

Redis-backed auth rate limiter guard and unit tests in `apps/api/src/auth`.
