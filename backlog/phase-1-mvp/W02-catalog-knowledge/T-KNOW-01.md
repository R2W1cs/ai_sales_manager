---
id: T-KNOW-01
parent: T-KNOW-01
wave: W2
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-KNOW-01
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/knowledge/rules/business-rules.controller.ts
  - apps/api/src/knowledge/rules/business-rules.service.ts
  - apps/api/src/knowledge/dto/create-business-rule.dto.ts
  - apps/api/src/knowledge/knowledge.module.ts
done_cmd: pnpm --filter api test -- src/knowledge
next: T-KNOW-02
---

# Task: Business rules versioning & validation API (`/business-rules`)

## 1. Objective & Value

Implement immutable versioned business rules management (shipping fees, return window, cash on delivery terms, discounts) with strict Zod JSONB validation.

**Why this exists**: The AI Sales Agent must follow merchant-defined commercial rules with immutable version history for decision auditability.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/knowledge/business-rules.*`
- `apps/api/src/knowledge/dto/*rule*`
- `packages/shared/src/knowledge/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /business-rules` (200 OK) -> List active rules grouped by type (`DELIVERY`, `PAYMENT`, `RETURN_POLICY`, `DISCOUNT`, `FAQ`)
- `POST /business-rules` (201 Created) -> Creates a new rule version (increments `version_number`, sets `effective_from = NOW()`)
- `PATCH /business-rules/:id` (200 OK) -> Modify `is_enabled` or `effective_to` only (never overwrite rule content in-place)

---

## 4. Invariants & Security Guardrails

- 🔒 **Immutable History**: Updating a rule content creates a new row with incremented version and marks previous version `effective_to = NOW()`.
- 🛡️ **JSONB Validation**: Validate payload schemas against strict Zod definitions in `12_DATABASE_DESIGN.md` §14.8.
- 🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.configure')`.

---

## 5. Implementation Steps

1. Define Zod schemas for delivery zones, return policies, payment terms in shared.
2. Implement `BusinessRulesService.createRuleVersion()` with version increments.
3. Implement `BusinessRulesController` with tenant and permissions guards.
4. Author unit tests covering rule creation, versioning, JSONB validation, and active rule resolution.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Versioning**: Updating rule creates version 2 and sets `effective_to` on version 1.
- [ ] **Schema Validation (400)**: Invalid JSONB payload (e.g. negative shipping fee) returns 400 Bad Request.
- [ ] **Active Rules Fetch**: Service resolves active rules as of a given timestamp.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/knowledge

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Create a return policy rule (14 days) via Swagger; update return window to 7 days and verify version 2 row in DB.
- **👁️ Review & Sign-off**: Verify old rule rows are never modified in place.

---

## 9. Expected Deliverables

Business rules controller, service, Zod schemas, and unit tests in `apps/api/src/knowledge`.
