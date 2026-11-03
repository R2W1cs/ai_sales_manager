# Wave W0 Testing Specification — Monorepo Bootstrap & Foundations

| Field       | Value                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Wave ID     | `W0`                                                                                        |
| Wave Title  | Monorepo Bootstrap & Foundations                                                            |
| Cards       | `T-BOOT-01` through `T-BOOT-06` (15 leaves)                                                 |
| Status      | Canonical AI Testing Guide for Wave W0 Completion Gate                                      |
| Focus Areas | Monorepo structure, shared schemas, DB models, migrations, Docker Compose, Nest boilerplate |

---

## 1. Automated Verification Suites

```bash
# 1. Monorepo-Wide Typecheck & Linting
pnpm -r check-types
pnpm lint
pnpm format

# 2. Shared Kernel & Envelope Unit Tests
pnpm --filter @repo/shared test

# 3. Prisma Schema & Forward Migration Validation
pnpm --filter @repo/api exec prisma validate

# 4. Dependency & Architectural Boundaries Audit
node scripts/check-forbidden-addons.mjs
python3 backlog/_runner.py check-arch
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Shared Kernel & Zod Envelopes

- **Error Envelope Contract (`13` §2.6)**:
  - Verify every API error maps to `{ error: { code: string, message: string, details?: object }, request_id: string }`.
  - Validate all 22 closed error codes in `error.ts`: `validation_error`, `unauthorized`, `forbidden`, `no_business`, `not_found`, `conflict`, `idempotency_key_conflict`, `quota_exceeded`, `rate_limited`, `ai_paused`, etc.
- **Money Representation (`13` §2.8)**:
  - Exact Decimal `(12,3)` string serialization (e.g. `"12.540"`).
  - Floating-point JS numbers strictly rejected by schema.
- **Cursor Pagination (`13` §2.7)**:
  - Base64url opaque encoding of `(created_at, id)` tuples.
  - Zero SQL `OFFSET` used across any query.

### B. Database Schema & Migration Integrity (`12_DATABASE_DESIGN.md`)

- **Forward-Only Migration**:
  - `prisma/migrations/20260817000000_init` runs cleanly forward on Postgres 16 with `pgvector`.
- **Enum Completeness**:
  - `MemberRole` (`owner`, `admin`, `employee`).
  - `ConversationStatus` (`BOT_ACTIVE`, `HUMAN_REQUIRED`, `HUMAN_HANDLING`, `RESOLVED`, `EXPIRED`).
  - `MessageDeliveryStatus` (`draft`, `queued`, `sent`, `delivered`, `failed`).
  - `OrderStatus` (`PENDING_CONFIRMATION`, `CONFIRMED`, `COMPLETED`, `CANCELLED`).
- **Composite Foreign Keys & Multi-Tenancy**:
  - Validate all child tables include `business_id` composite foreign keys.

### C. Dependency Hygiene

- **Forbidden Packages Gate**:
  - Zero occurrences of `baileys`, `whatsapp-web.js`, `zustand`, `radix-ui`, `storybook`, `biome`, `vitest`, `msw`.

---

## 3. CLI Smoke & Infrastructure Validation

```bash
# Verify Docker Compose Postgres + Redis + MinIO health
docker compose ps

# Verify Redis PING
redis-cli -h localhost -p 6379 ping
# Expected: PONG

# Verify MinIO S3 Endpoint readiness
curl -f -s http://localhost:9000/minio/health/live
```

---

## 4. Wave W0 Completion Gate Checklist

- [ ] All 15 leaves (`T-BOOT-01/a` through `T-BOOT-06`) marked `status: done`.
- [ ] `pnpm check:full` exits 0 with zero warnings.
- [ ] Shared package tests (`packages/shared/src/*.spec.ts`) pass at 100%.
- [ ] Architectural boundary check reports 0 violations.
