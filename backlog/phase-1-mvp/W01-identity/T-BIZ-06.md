---
id: T-BIZ-06
parent: T-BIZ-06
wave: W1
status: done
optional: false
depends:
  - T-AUTH-02/c
fs:
  - FS-FLAG-01
read:
  - docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md
  - docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/businesses/flags/flags.controller.ts
  - apps/api/src/businesses/flags/flags.service.ts
done_cmd: pnpm --filter api test -- src/businesses
next: T-BIZ-07
---

# Task: Feature flags API (`GET/PATCH /businesses/:id/flags`)

## 1. Objective & Value

Implement per-tenant feature flags management with strict closed key validation.

**Why this exists**: Allow safe, progressive rollout of advanced capabilities (e.g. WhatsApp beta, advanced analytics) on a per-merchant basis.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/businesses/flags/flags.controller.ts`
- `apps/api/src/businesses/flags/flags.service.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /businesses/:id/flags` (200 OK) -> `{ flags: Record<string, boolean> }`
- `PATCH /businesses/:id/flags` (200 OK) -> Body `{ key: string, enabled: boolean }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Closed Enum**: Validate flag keys against approved `DomainFeatureFlag` enum (reject arbitrary strings with 400).
- 🛡️ **RBAC Permission**: Requires `@RequirePermission('flags.write')`.

---

## 5. Implementation Steps

1. Implement `FlagsService` and `FlagsController`.
2. Author unit tests verifying flag updates and rejection of unknown keys.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Toggle Flag**: Owner enables `whatsapp_enabled` flag.
- [ ] **Unknown Key (400)**: Passing unrecognized flag key returns 400 Bad Request.

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

- **🧪 Manual QA**: Toggle feature flag via Swagger.

---

## 9. Expected Deliverables

Feature flags controller and service.
