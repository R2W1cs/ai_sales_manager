---
id: T-BIZ-03
parent: T-BIZ-03
wave: W1
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-BIZ-02
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/members/members.controller.ts
  - apps/api/src/businesses/members/members.service.ts
  - apps/api/src/businesses/dto/invite-member.dto.ts
  - apps/api/src/businesses/dto/update-member-role.dto.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-BIZ-04
---

# Task: Members + invitations management (`/businesses/:id/members`, `/invitations`)

## 1. Objective & Value

Implement team membership management, role updates, member removal, and tokenized invitations with subscription seat limit enforcement.

**Why this exists**: Allow merchants to collaborate with managers and sales reps while maintaining sole-owner safety invariants and subscription tier seat quotas.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/members/members.controller.ts`
- `apps/api/src/businesses/members/members.service.ts`
- `apps/api/src/businesses/dto/invite-member.dto.ts`
- `apps/api/src/businesses/dto/update-member-role.dto.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /businesses/:id/members` (200 OK) -> List active team members and roles
- `POST /businesses/:id/invitations` (201 Created) -> `{ email: string, role: 'MANAGER' | 'EMPLOYEE' }`
- `DELETE /businesses/:id/invitations/:inviteId` (204 No Content) -> Revoke pending invite
- `PATCH /businesses/:id/members/:userId/role` (200 OK) -> Update role
- `DELETE /businesses/:id/members/:userId` (204 No Content) -> Remove member

---

## 4. Invariants & Security Guardrails

- 🔒 **Sole Owner Protection**: Demoting or deleting the last active OWNER returns 409 Conflict.
- 🛡️ **Invite Role Constraint**: Forbid inviting role `OWNER` (returns 400 Bad Request).
- 📊 **Seat Limit**: Check subscription plan seat quota before creating new invite (returns 403 quota_exceeded if breached).

---

## 5. Implementation Steps

1. Implement `MembersService` with seat count verification and owner count checks.
2. Implement `MembersController` with `@RequirePermission('members.manage')`.
3. Author unit tests covering seat quota breach, sole owner demote block, and invite creation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Team Invite**: Owner invites Manager; returns invitation token.
- [ ] **Forbid Owner Invite (400)**: Attempting to invite role `OWNER` returns 400 Bad Request.
- [ ] **Sole Owner Protection (409)**: Demoting or removing sole Owner returns 409 Conflict.
- [ ] **Quota Enforcement (403)**: Exceeding plan seat limit returns 403 quota_exceeded.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/businesses

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA & Smoke test**: Invite a test employee via Swagger; attempt to invite an Owner role to verify 400 rejection.
- **👁️ Review & Sign-off**: Confirm workspace always maintains >= 1 active Owner.

---

## 9. Expected Deliverables

Team management controller, service, DTOs, and unit tests.
