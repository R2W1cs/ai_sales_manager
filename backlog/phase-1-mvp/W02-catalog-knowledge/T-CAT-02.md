---
id: T-CAT-02
parent: T-CAT-02
wave: W2
status: done
optional: false
depends:
  - T-CAT-01
fs:
  - FS-CAT-01
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md
  - docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md
files:
  - apps/api/src/catalog/products/products.controller.ts
  - apps/api/src/catalog/products/products.service.ts
  - apps/api/src/catalog/products/variants.service.ts
  - apps/api/src/catalog/products/images.service.ts
  - apps/api/src/catalog/dto/create-product.dto.ts
  - apps/api/src/catalog/dto/update-product.dto.ts
  - apps/api/src/catalog/dto/create-variant.dto.ts
  - apps/api/src/catalog/catalog.module.ts
done_cmd: pnpm --filter api test -- src/catalog
next: T-CAT-03
---

# Task: Products & variants domain layer (`/products`, `/variants`, S3 images, pricing/stock)

## 1. Objective & Value

Implement full products and multi-attribute variants domain layer with variant-level pricing/stock, dynamic availableStock calculation, and S3 image attachments.

**Why this exists**: The AI Sales Agent and merchant web dashboard require an accurate product catalog to look up prices, check real-time stock availability, and display product media in conversation threads.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/catalog/`
- `packages/shared/src/catalog/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/orders/`
- `apps/api/src/conversations/`

---

## 3. Technical Contract & Interfaces

- `POST /products` (201 Created) -> Body `{ title: string, description?: string, categoryId?: string, variants: CreateVariantDto[], images?: string[] }`
- `GET /products` (200 OK) -> Paginated product list with search, category, status filters
- `GET /products/:id` (200 OK) -> Product detail with all variants and calculated availableStock
- `PATCH /products/:id` (200 OK) -> Update title, description, status
- `DELETE /products/:id` (200 OK) -> Archive product (`status = 'ARCHIVED'`) if referenced in orders
- `POST /products/:id/variants` (201 Created) -> Add variant (sku, price, stock, options)

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Isolation**: Every database query must filter by `business_id`.
- 🛡️ **RBAC Permission**: Writes require `@RequirePermission('catalog.write')`.
- 🚫 **Negative Invariants**: Never store price or physical stock on parent product (variants only). Never allow direct client PATCH to `availableStock`.

---

## 5. Implementation Steps

1. Author Zod schemas and DTOs for products, variants, and image metadata in shared.
2. Implement `ProductsService` and `VariantsService` with atomic transactions.
3. Implement dynamic `availableStock` calculator (`physical_stock - active_reservations`).
4. Implement `ImagesService` with S3 signed upload URL generation.
5. Implement `ProductsController` with tenant and permissions guards.
6. Author exhaustive unit and integration tests covering CRUD, stock math, and archival safety.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Happy Path**: Product with 2 variants and images creates successfully.
- [ ] **Dynamic Available Stock**: Active reservations deduct from `availableStock` in real time.
- [ ] **Archival Safety**: Product with historical orders is archived on delete instead of hard-deleted.
- [ ] **Tenancy (403)**: Accessing another tenant's product returns 403 Forbidden.
- [ ] **Employee (403)**: Employee role receives 403 Forbidden on write operations.

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

- **🔑 Environment variables**: Ensure MinIO / S3 credentials (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) are set in `.env`.
- **🌐 External setup**: Verify local MinIO bucket `catalog-images` is accessible.
- **🧪 Manual QA & Smoke test**: Create a product with 2 variants in Swagger at `http://localhost:3001/api/docs`; open Prisma Studio (`pnpm --filter api exec prisma studio`) to verify DB records.
- **👁️ Review & Sign-off**: Confirm price/stock exist strictly on variant records and `availableStock` is never client-writable.

---

## 9. Expected Deliverables

Complete, tested Catalog domain module in `apps/api/src/catalog` with >90% test coverage.
