---
id: T-CAT-03
parent: T-CAT-03
wave: W2
status: done
optional: false
depends:
  - T-CAT-02
fs:
  - FS-CAT-02
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/catalog/csv-import/csv-import.controller.ts
  - apps/api/src/catalog/csv-import/csv-import.service.ts
  - apps/api/src/catalog/csv-import/csv-import.processor.ts
done_cmd: pnpm --filter api test -- src/catalog
next: T-CAT-04
---

# Task: Catalog CSV bulk import/export worker & API (`/products/import`, `/products/export`)

## 1. Objective & Value

Implement two-phase bulk CSV catalog import (validate -> preview -> confirm) and inventory CSV export pipeline via BullMQ worker.

**Why this exists**: Allow merchants to bulk onboard hundreds of products and variants with detailed row-level error validation before committing data.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/catalog/csv-import.*`
- `apps/api/src/catalog/dto/*import*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /products/import/template` (200 OK) -> Returns canonical CSV template header
- `POST /products/import` (202 Accepted) -> Uploads CSV, creates `catalog_import_runs` row, enqueues parse job
- `GET /products/import/:jobId` (200 OK) -> Poll status, row error summary, and parsed item preview
- `POST /products/import/:jobId/confirm` (202 Accepted) -> Commits valid items (SKU upsert in transaction)
- `GET /products/export` (200 OK) -> Streams CSV file of all active products and variants

---

## 4. Invariants & Security Guardrails

- 🔒 **Two-Phase Commit**: Never write records to catalog tables before explicit merchant confirmation.
- 🛡️ **RBAC Permission**: Requires `@RequirePermission('catalog.write')`.

---

## 5. Implementation Steps

1. Implement CSV parser validating columns: title, category, sku, price, stock, options.
2. Implement BullMQ `csv-import` processor validating rows and saving error report in `catalog_import_runs`.
3. Implement confirm action executing SKU upserts in chunked transactions.
4. Implement CSV streaming export endpoint.
5. Author unit tests covering CSV parsing, error reporting, and commit transactions.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Template**: Returns valid CSV template headers.
- [ ] **Row Validation**: Invalid rows report exact error messages and line numbers.
- [ ] **Confirmed Import**: Confirmed import creates products, categories, and variants in DB.
- [ ] **Export**: Generates valid CSV matching full catalog.

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

- **🧪 Manual QA**: Download template from `GET /products/import/template`, add sample rows with 1 intentional error, upload and test preview.
- **👁️ Review & Sign-off**: Verify no catalog rows are created before calling `/confirm`.

---

## 9. Expected Deliverables

CSV import/export controller, service, BullMQ processor, and tests in `apps/api/src/catalog`.
