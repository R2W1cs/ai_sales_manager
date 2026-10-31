---
id: T-AREA-NN
parent: T-AREA-NN
wave: W0
status: pending # pending | in_progress | done | blocked | skipped
optional: false
depends: [] # Prerequisites required before starting this task
fs: [] # Functional specification tags from 30_TASKS.md
read: [] # Ordered spec files from docs/ (max 5)
files: [] # Allowlisted implementation paths (max 8)
done_cmd: "pnpm --filter api test -- src/..."
next: T-AREA-NN+1
---

# Task: T-AREA-NN — Title

## 1. Objective & Value

Direct statement of what is being built and why it matters to merchants/architecture.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/...`

### Do Not Modify (Forbidden boundaries)

- `apps/...`

---

## 3. Technical Contract & Interfaces

- Endpoints: `METHOD /path` (HTTP Status) -> Request/Response shapes
- Schemas: Exact fields, relationships, and dynamic computations

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Isolation**: Multi-tenant database boundary rules (`WHERE business_id = request.tenantId`)
- 🛡️ **RBAC Rigor**: Exact permission codes required
- 🚫 **Negative Invariants**: Prohibited shortcuts or forbidden operations

---

## 5. Implementation Steps

1. Numbered, ordered step-by-step engineering plan
2. Schemas/DTOs -> Service Logic -> Controller/Guards -> Unit Tests

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Happy Path**: Expected successful execution
- [ ] **Validation (400)**: Malformed input or invalid parameters
- [ ] **Tenancy Isolation (403)**: Cross-tenant access blocked
- [ ] **Role Permissions (403)**: Unauthorized role blocked

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
[done_cmd]

# 2. Audit architectural boundaries
python3 backlog/_runner.py check-arch

# 3. Full monorepo quality gate
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 Environment variables**: Required `.env` keys
- **🌐 External setup**: Third-party developer consoles / credentials
- **🧪 Manual QA & Smoke test**: Step-by-step manual test in Swagger/Prisma Studio/Browser
- **👁️ Review & Sign-off**: Code review checklists

---

## 9. Expected Deliverables

Concrete list of files, services, and test suites produced.
