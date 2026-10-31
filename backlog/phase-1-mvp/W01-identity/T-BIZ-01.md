---
id: T-BIZ-01
parent: T-BIZ-01
wave: W1
status: done
optional: false
depends:
  - T-AUTH-02/c
fs:
  - FS-BIZ-01
read:
  - docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md
  - docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/workspace/businesses.controller.ts
  - apps/api/src/businesses/workspace/businesses.service.ts
  - apps/api/src/businesses/dto/create-business.dto.ts
  - apps/api/src/businesses/businesses.module.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-AI-10
---

# Task: Business workspace creation (`POST /businesses`) + seed agent, ai_settings, rules, onboarding

## 1. Objective & Value

Implement atomic business workspace provisioning creating tenant record, owner membership, default AI agent, AI settings, starter business rules, and onboarding tracker in a single database transaction.

**Why this exists**: Every merchant needs a fully initialized store environment immediately upon registration with pre-configured AI sales behavior.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/workspace/businesses.controller.ts`
- `apps/api/src/businesses/workspace/businesses.service.ts`
- `apps/api/src/businesses/dto/create-business.dto.ts`
- `apps/api/src/businesses/businesses.module.ts`
- `packages/shared/src/businesses/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/catalog/`

---

## 3. Technical Contract & Interfaces

- `POST /businesses` (201 Created)
- Headers: `Idempotency-Key: <uuid>`
- Request Body: `{ name: string, currency?: string, timezone?: string, phone?: string }`
- Response: `{ business: BusinessDto, membership: MembershipDto, aiAgent: AiAgentDto, onboarding: OnboardingDto }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Atomic Transaction**: All 6 entities (`businesses`, `memberships`, `ai_agents`, `ai_settings`, `business_rules`, `business_onboarding`) must be inserted in a single Prisma `$transaction`.
- 🛡️ **Owner Assignment**: Caller is automatically assigned role `OWNER` with active status.
- 🚫 **Negative Invariants**: Never allow creating orphaned businesses without an Owner membership.

---

## 5. Implementation Steps

1. Create `CreateBusinessDto` in shared and api with name, currency (default 'TND'), timezone (default 'Africa/Tunis').
2. Implement `BusinessesService.createBusiness(userId, dto, idempotencyKey)` with Prisma transaction.
3. Seed default AI Agent ('Sales Assistant'), AI Settings (`reply_mode = 'approval_required'`), starter rules, and onboarding step 1.
4. Add `POST /businesses` route in `BusinessesController` with JWT guard.
5. Author unit/integration tests verifying atomic creation and idempotency duplicate prevention.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Happy Path (201)**: Creates business and seeds all 6 entities atomically.
- [ ] **Idempotency Key**: Repeated call with same idempotency key returns cached response without duplicate creation.
- [ ] **Owner Role**: Authenticated caller is granted OWNER role.
- [ ] **Transaction Rollback**: Any database error during seeding rolls back the entire business creation.

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

- **🔑 Environment variables**: None.
- **🧪 Manual QA & Smoke test**: Call `POST /businesses` via Swagger with `Idempotency-Key` header; open Prisma Studio (`pnpm --filter api exec prisma studio`) to visually inspect that all 6 entities were created.
- **👁️ Review & Sign-off**: Verify default `reply_mode` is set to `approval_required` (never auto-send on creation).

---

## 9. Expected Deliverables

Business provisioning controller, service, DTOs, and unit tests in `apps/api/src/businesses`.
