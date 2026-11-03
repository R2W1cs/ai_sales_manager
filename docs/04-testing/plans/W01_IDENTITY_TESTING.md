# Wave W1 Testing Specification — Identity, Auth & Workspace

| Field       | Value                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------- |
| Wave ID     | `W1`                                                                                         |
| Wave Title  | Identity, Auth & Workspace                                                                   |
| Cards       | `T-AUTH-01` through `T-AUTH-06`, `T-BIZ-01` through `T-BIZ-08`, `T-AI-10` (22 leaves)        |
| Status      | Canonical AI Testing Guide for Wave W1 Completion Gate                                       |
| Focus Areas | Argon2id auth, JWT refresh rotation, X-Business-Id tenancy, RBAC 22 codes, Onboarding, Audit |

---

## 1. Automated Verification Suites

```bash
# 1. Platform & Guards (Tenancy + RBAC) Suite
pnpm --filter api test -- src/platform

# 2. Auth Controller & Service Suite
pnpm --filter api test -- src/auth

# 3. Businesses & Members Suite
pnpm --filter api test -- src/businesses

# 4. Full Workspace Monorepo Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Authentication & Cryptography (`17_SECURITY_DESIGN.md` §3)

- **Argon2id Password Hashing**:
  - Minimum 10 characters, maximum 128 characters.
  - Sub-10 char password throws `400 validation_error`.
  - Duplicate registration (case-insensitive) throws `409 conflict`.
- **Timing-Safe Login**:
  - Unknown email and wrong password return identical response `{ "error": { "code": "unauthorized", "message": "Invalid email or password" } }`.
  - Dummy hash evaluation prevents side-channel timing enumeration attacks.
- **Refresh Token Rotation & Reuse Detection (Family Revocation)**:
  - Refresh cookie: `aisales_refresh`, `HttpOnly`, `Path=/api/v1/auth`, `SameSite=Lax`.
  - Using a previously revoked token within a family triggers theft alarm: revokes entire token family and returns `401`.
- **Access JWT Payload (OQ-57)**:
  - Payload contains `{ "sub": "<user_id>", "typ": "access" }`.
  - Zero `business_id` or roles stored in access token (resolved per-request).

### B. Multi-Tenancy Resolution (`13` §2.4, `17` §4)

- **`TenantGuard` Header Checks**:
  - `X-Business-Id` present + user is active member -> passes and attaches `req.tenantId`.
  - `X-Business-Id` present + user not member / soft-deleted business -> throws `403 forbidden`.
  - `X-Business-Id` omitted + user in 1 business -> auto-resolves that business.
  - `X-Business-Id` omitted + user in >1 business -> throws `400 business_required`.
  - `X-Business-Id` omitted + user in 0 businesses -> throws `403 no_business`.
  - URL route param `/businesses/:id` mismatch with header -> throws `403 forbidden`.

### C. Closed RBAC Matrix (`13` §2.11, `17` §5)

- **22 Closed Permissions Verification**:
  - `OWNER`: Superuser bypass on all 22 permissions.
  - `ADMIN`: Allowed 19 permissions; rejected with `403` on `billing.manage`, `business.delete`, `usage.read`.
  - `EMPLOYEE`: Allowed only 5 permissions (`inbox.read`, `inbox.write`, `orders.write`, `customers.write`, `analytics.read`).
  - `EMPLOYEE` attempting `ai.configure`, `customers.erase`, `customers.merge`, or `members.manage` throws `403 forbidden`.
- **Sole Owner Protection**:
  - Demoting or deleting the last active Owner of a business returns `403 forbidden`.

### D. Rate Limiting / Abuse Throttles (`13` §2.9)

- 5 requests / minute per IP and per email on `/auth/login`, `/auth/register`, `/auth/forgot-password`. 6th attempt returns `429 rate_limited` with `Retry-After` header.

---

## 3. CLI Smoke & Integration Simulation

```bash
# 1. Register User A
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner_a@test.com","password":"Password12345!","name":"Owner Alpha"}'

# 2. Login User A and store cookie
curl -s -c /tmp/cookies_a.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner_a@test.com","password":"Password12345!"}'

# 3. Create Business A with Idempotency Key
TOKEN_A=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner_a@test.com","password":"Password12345!"}' | jq -r '.accessToken')

BIZ_A=$(curl -s -X POST http://localhost:3001/api/v1/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"Alpha Store","currency":"TND"}' | jq -r '.id')

# 4. Cross-Tenant Attack (User B tries to access Business A) -> Must return 403
curl -i -s -X GET http://localhost:3001/api/v1/businesses/$BIZ_A \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Business-Id: $BIZ_A"
# Verify status: HTTP/1.1 403 Forbidden
```

---

## 4. Wave W1 Completion Gate Checklist

- [ ] All 22 required leaves in W1 marked `status: done`.
- [ ] `pnpm --filter api test -- src/platform src/auth src/businesses` 100% pass rate.
- [ ] `pnpm check:full` exits 0.
- [ ] Full RBAC grid and Multi-Tenant header guards pass unit assertions.
