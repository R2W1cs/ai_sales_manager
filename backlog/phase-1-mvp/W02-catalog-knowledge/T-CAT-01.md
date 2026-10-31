---
id: T-CAT-01
parent: T-CAT-01
wave: W2
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-CAT-01
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/catalog/categories/categories.controller.ts
  - apps/api/src/catalog/categories/categories.service.ts
  - apps/api/src/catalog/dto/create-category.dto.ts
  - apps/api/src/catalog/dto/update-category.dto.ts
done_cmd: pnpm --filter api test -- src/catalog
next: T-CAT-02
---

# Task: Categories CRUD API (`/categories`)

## 1. Objective & Value

Implement category hierarchy management API with slug generation and tree retrieval.

**Why this exists**: Organize merchant products into structured categories for catalog navigation and AI context filtering.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/catalog/categories.*`
- `apps/api/src/catalog/dto/*category*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/orders/`

---

## 3. Technical Contract & Interfaces

- `GET /categories` (200 OK) -> Nested category tree or flat list with parent IDs
- `POST /categories` (201 Created) -> Body `{ name: string, parentId?: string, description?: string }`
- `PATCH /categories/:id` (200 OK) -> Update category name/parent
- `DELETE /categories/:id` (204 No Content) -> Delete category (checks for child products)

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Isolation**: Every category is strictly scoped to `business_id`.
- 🛡️ **RBAC Permission**: Writes require `@RequirePermission('catalog.write')`.
- 🚫 **Negative Invariants**: Forbid cyclic parent-child category relationships.

---

## 5. Implementation Steps

1. Define DTOs with Zod validation in `packages/shared` and `apps/api`.
2. Implement `CategoriesService` with tree builder and slug uniqueness per tenant.
3. Implement `CategoriesController` with tenant and permissions guards.
4. Author unit tests covering category CRUD, hierarchy, and tenant isolation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Create & List**: Parent and child categories create and return hierarchical tree.
- [ ] **Unique Slug**: Duplicate category name within same tenant generates unique slug or 409.
- [ ] **Employee (403)**: Employee role receives 403 Forbidden on create/update/delete.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/catalog

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA & Smoke test**: Create parent category ('Vêtements') and child category ('Robes') in Swagger at `http://localhost:3001/api/docs`.
- **👁️ Review & Sign-off**: Verify category query filters by `business_id`.

---

## 9. Expected Deliverables

Categories controller, service, DTOs, and unit tests in `apps/api/src/catalog`.
