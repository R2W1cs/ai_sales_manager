# 17 — Security Design

| Field           | Value                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Document ID     | `17_SECURITY_DESIGN`                                                                                                                                                                       |
| Status          | Approved — canonical for authN, RBAC, tenancy enforcement, secrets, encryption, PII                                                                                                        |
| Owner           | Engineering                                                                                                                                                                                |
| Audience        | Auth / Businesses modules, Nest guards, worker, AI coding agents                                                                                                                           |
| Depends on      | `10_ARCHITECTURE.md`, `11_TECH_STACK.md` §5.2, `12_DATABASE_DESIGN.md`, `13_API_DESIGN.md`, `16_INTEGRATION_DESIGN.md`, `18_DEPLOYMENT.md`, `01_PRODUCT_REQUIREMENTS.md` FR-AUTH / NFR-SEC |
| Consumed by     | Nest guards in `apps/api`, `31_IMPLEMENTATION_PLAN.md`                                                                                                                                     |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Security`, `# User Permission Matrix`                                                                                                             |

---

## 1. Purpose and scope

This document is **canonical for who is allowed to do what, and how secrets and PII are held**. If a JWT claim, cookie flag, permission check, hash algorithm, or erasure step is not here, it does not exist. Add it here first, then implement.

**In scope:** password hashing, JWT crypto, refresh rotation / reuse detection, tenant resolution enforcement, RBAC guards, secret storage, encryption (and what we do **not** encrypt), PII in logs/prompts, customer erasure, audit, transport hardening, SSRF.

**Out of scope, and where it lives instead:**

| Topic                                               | Canonical location                       |
| --------------------------------------------------- | ---------------------------------------- |
| Routes, error codes, permission _code list_         | `13_API_DESIGN.md`                       |
| Tables (`users`, `refresh_tokens`, `audit_logs`, …) | `12_DATABASE_DESIGN.md`                  |
| JWT _lifetimes_ (15 min / 14 d), argon2 package     | `11_TECH_STACK.md` §5.2                  |
| Auth HTTP rate-limit **numbers**                    | `13` §2.9; AI/channel numbers in `14` §9 |
| Meta HMAC / page tokens / OAuth user-token Redis    | `16_INTEGRATION_DESIGN.md`               |
| TLS at the edge, SM paths, image scan, OIDC         | `18_DEPLOYMENT.md`                       |
| Prompt-injection (data vs instructions)             | `15_AI_ARCHITECTURE.md`                  |
| MFA, custom roles                                   | Won't (`01`)                             |

**References:** `§N` is this file. Sibling docs are filenames. This file has no competing §13.

---

## 2. Invariants

1. Authentication and identity are managed by **Better Auth** with the **Organization plugin**. Sessions are verified via secure session cookies / headers. Tenant context is `X-Business-Id` / active organization + membership verification every request (`13` §2.4).
2. UI hiding is not a control (NFR-SEC-05). Guards run on every `/api/v1` handler except `13` §2.3 public list.
3. Every tenant query is `WHERE business_id = $resolved`. Missing filter is **Sev-1** (NFR-SEC-04). Postgres RLS is **off** in MVP (OQ-54 / OQ-70).
4. No `users.security_version`, no access-JWT denylist in MVP (OQ-58). Better Auth session revocation handles immediate invalidation.
5. Page tokens stay in Secrets Manager (`16`, OQ-68). **No** application-level field encryption of messages, phones, or addresses in MVP (OQ-71). RDS + S3 at-rest encryption satisfy NFR-SEC-02.
6. Passwords, session tokens, invite tokens, and reset tokens are securely hashed and managed via Better Auth & Resend. Never log secrets or tokens.
7. Three system roles only: `owner` / `admin` / `employee` mapped cleanly to Better Auth custom organization roles. Merchant UI may say **Agent**; the code stays `employee`. No platform-admin role in MVP.
8. Worker jobs carry `businessId`; load the row and **reject** if it does not match. Jobs are not a second auth system.
9. Customer PII is not written to info logs, `audit_logs.payload`, or `ai_actions.input` (NFR-SEC-06).

---

## 3. Authentication

Routes: `13` §4. Lifetimes: `11` §5.2.

### 3.1 Passwords (FR-AUTH-002)

| Pin                                | Value                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Algorithm                          | **argon2id** (`argon2` package, library defaults)                                          |
| Min / max                          | **10** / **128** (`13` register)                                                           |
| Compare                            | `argon2.verify` only. Dummy hash on unknown email so login timing stays close              |
| Login fail                         | **401** `unauthorized`, same body for bad password and unknown email                       |
| Duplicate register                 | **409** `conflict`                                                                         |
| Composition / HIBP / lockout table | **No.** Throttler is the brute-force control (`13` §2.9: 5 / min per IP **and** per email) |
| `email_verified_at`                | Column exists. **Not** required to log in in MVP                                           |

Google-only users: `password_hash` null. They cannot use password login until they set one (reset). Should FR-AUTH-006.

### 3.2 Access Token & Verification

| Pin           | Value                                                     |
| ------------- | --------------------------------------------------------- |
| Alg           | **HS256** / Better Auth token verification. Reject `none` |
| Secret        | `BETTER_AUTH_SECRET` (SM)                                 |
| Claims        | `sub` = `users.id`, `typ: "access"`, `iat`, `exp`         |
| `iss` / `aud` | `iss: "aisales"`, `aud: "access"`                         |
| Clock skew    | **30s**                                                   |
| Storage       | `Authorization: Bearer` or Better Auth session cookie     |

Do not put roles in the token (they are per-tenant). Changing tenant does not mint a new access token.

### 3.3 Session Management & Token Storage

| Pin          | Value                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alg / secret | `BETTER_AUTH_SECRET`                                                                                                                               |
| Storage      | Better Auth `Session` / `Account` models in PostgreSQL                                                                                             |
| Cookie name  | Better Auth session cookie / `aisales_refresh`                                                                                                     |
| Cookie       | **Host-only** (no `Domain` — never sent to `app.` or `hooks.`). `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` in staging/prod (off on local HTTP) |
| Body         | Session DTO returned on login / signup / session query                                                                                             |

`app.<apex>` and `api.<apex>` are same-site (eTLD+1). Lax + CORS `credentials` is enough. **No** extra CSRF token in MVP. Do **not** set `SameSite=None`. Do **not** set `Domain=.<apex>`.

DB stores `token_hash = sha256(utf8(jwt))`, never the JWT. Unique on `token_hash`.

### 3.4 Rotation and reuse (FR-AUTH-004/005)

Login / Google / accept-invite: new `family_id`, insert one refresh row, Set-Cookie.

`POST /auth/refresh`:

1. Read cookie. Hash. Lookup row.
2. Missing / expired / `typ` ≠ `refresh` / `aud` wrong → **401**, clear cookie.
3. Row `revoked_at` set **and** the family still has (or had) siblings → **reuse**. Revoke **entire family**, **401**, clear cookie. Assume theft.
4. Else valid: set `revoked_at` on this row, insert new row **same** `family_id`, new cookie, new access JWT.

Logout: revoke **this family**, clear cookie, disconnect this session’s sockets (`13` §2.2).

Password reset: revoke **all** families for `user_id`, disconnect **all** that user’s sockets.

Member removed: do **not** revoke refresh unless it was the last membership (`12` §2.5). Next tenant call → **403**.

### 3.5 Invites and password reset

| Token          | TTL        | Store                          | Send                                     |
| -------------- | ---------- | ------------------------------ | ---------------------------------------- |
| Invitation     | **7 days** | `sha256` of 32-byte CSPRNG     | Resend email, raw once                   |
| Password reset | **1 hour** | `sha256`, single-use `used_at` | Resend; `forgot-password` always **204** |

Accept invite: cannot create a second Owner. Existing user joins; new user sets password + name (`13`).

### 3.6 Google (Should FR-AUTH-006)

`state` in Redis `oauth:google:{state}` TTL 10 min (same pattern as Meta, different key). Link `oauth_accounts` on verified email. Unverified Google email → fail, do not create a user. Callback **302** to `PUBLIC_APP_URL`. Not Must — ship email/password first.

---

## 4. Tenant enforcement (NFR-SEC-04)

Protocol: `13` §2.4. This section is how code must not cheat it.

1. Guard resolves `businessId` **once** per request into `RequestContext`. Services take `businessId` as an argument (`10` §7). Do not read `req.body.businessId` as the tenant.
2. Path `:id` on `/businesses/:id` must equal the resolved tenant or **403**.
3. Load-by-id inside a tenant: missing → **404**. Row exists for another tenant → **404** (do not leak). Wrong permission → **403**.
4. `$queryRaw` / KNN: `business_id` in `WHERE` or it does not merge (`12` §2.2).
5. Composite FKs (`12` §2.13) so a child cannot attach to another tenant’s parent.
6. Soft-deleted business: membership check fails (`deleted_at IS NULL`). Jobs no-op if the tenant is deleted.
7. **No RLS** in MVP (OQ-70). Do not add `ENABLE ROW LEVEL SECURITY` “for safety” until a Sev-1 proves the app filter failed.

Socket handshake: `auth: { token, businessId }`. Same membership load as `X-Business-Id`. Join **that** `business:{id}` + `user:{id}` only. Switching tenant = new handshake. `thread:open`: conversation `business_id` must equal handshake tenant **and** `inbox.read` (`14` §12).

---

## 5. RBAC (NFR-SEC-05)

Permission **codes** and the Owner/Admin/Employee grid: `13` §2.11. Do not fork a second matrix here.

### 5.1 Guard

Nest: JWT → tenant → `@RequirePermission('inbox.write')` (or equivalent). Load `business_members` + `role_permissions` **every request**. **No** Redis cache of the grant set in MVP (role change must not wait on TTL; sockets already re-authorize).

Missing permission → **403** `forbidden`. Do not 404 to “hide” the route.

`billing.manage` is seeded for Owner. **No HTTP** until Phase 4 (`13` §15). `GET /usage` uses `usage.read`.

Employee may `GET /integrations` **status only** (`13` §10.1) — that is `inbox.read`, not `integrations.manage`.

### 5.2 Ownership rules

| Rule                                                          | Pin                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| Fourth role / custom roles                                    | **No** (FR-BIZ-015 Won't)                                 |
| Platform operator role                                        | **No** in MVP. Ops = AWS + SQL + platform `feature_flags` |
| Transfer Owner                                                | **No** in MVP                                             |
| Demote / remove the sole Owner                                | **403**                                                   |
| Invite Owner                                                  | **403**                                                   |
| Employee traces / playground / audit / export / erase / merge | **403**                                                   |

### 5.3 `customers.erase` (NFR-SEC-10)

New code, same grant as export: Owner ✓, Admin ✓, Employee —. Route: `13` §7.

---
