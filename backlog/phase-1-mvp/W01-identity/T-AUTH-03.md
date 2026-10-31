---
id: T-AUTH-03
parent: T-AUTH-03
wave: W1
status: done
optional: false
depends:
  - T-AUTH-02/c
fs:
  - FS-AUTH-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/auth/core/auth.controller.ts
  - apps/api/src/auth/core/auth.service.ts
  - apps/api/src/auth/dto/accept-invitation.dto.ts
done_cmd: pnpm --filter api test -- src/auth
next: T-AUTH-04
---

# Task: Accept invitation API (`POST /auth/invitations/accept`)

## 1. Objective & Value

Implement invitation acceptance endpoint allowing invited teammates to join a business workspace securely via token.

**Why this exists**: Store owners must be able to invite managers and staff into their workspace with predefined roles without manual database provisioning.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/auth/core/auth.controller.ts`
- `apps/api/src/auth/core/auth.service.ts`
- `apps/api/src/auth/dto/accept-invitation.dto.ts`
- `packages/shared/src/auth/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/businesses/`

---

## 3. Technical Contract & Interfaces

- `POST /auth/invitations/accept` (200 OK)
- Request Body: `{ token: string, name?: string, password?: string }`
- Response: `{ user: UserSessionDto, business: BusinessSummaryDto, token: string }`
- Error Codes: 400 (Invalid token format), 404 (Token not found/expired), 409 (Invitation already accepted)

---

## 4. Invariants & Security Guardrails

- 🔒 **Token Expiration**: Invitations expire after 7 days and cannot be reused after acceptance.
- 🛡️ **Role Integrity**: User membership role is strictly assigned from the invitation record (caller cannot choose role).
- 🚫 **Negative Invariants**: Never allow accepting revoked or already-consumed invitation tokens.

---

## 5. Implementation Steps

1. Create `AcceptInvitationDto` in shared and api with Zod validation.
2. Implement `AuthService.acceptInvitation(dto)` with Prisma transaction: lookup invitation, check expiry/status, create/link User, insert Membership, update invitation status=ACCEPTED.
3. Add `POST /auth/invitations/accept` in `AuthController` with rate limiting.
4. Write unit tests covering valid acceptance, expired tokens, duplicate acceptance, and new vs existing user join.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Happy Path**: Valid invitation token creates active membership and returns updated session JWT.
- [ ] **Expired Token (404)**: Expired token returns 404 error envelope.
- [ ] **Duplicate Acceptance (409)**: Already accepted invitation returns 409 Conflict.
- [ ] **New User Onboarding**: Unregistered email creates password and user account upon accept.

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

- **🔑 Environment variables**: None.
- **🧪 Manual QA & Smoke test**: Use Swagger at `http://localhost:3001/api/docs` to test `POST /auth/invitations/accept` with a seed invitation token.
- **👁️ Review & Sign-off**: Verify invitation status transitions to `ACCEPTED` and cannot be re-used.

---

## 9. Expected Deliverables

Invitation acceptance endpoint, DTOs, and unit test suite in `apps/api/src/auth`.
