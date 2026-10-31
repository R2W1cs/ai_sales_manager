---
id: T-WEB-08
parent: T-WEB-08
wave: W9
status: done
optional: false
depends:
  - T-WEB-02
  - T-CAT-02
fs:
  - FS-WEB-04
read:
  - docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md
  - docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
files:
  - apps/web/src/app/(dashboard)/products/page.tsx
  - apps/web/src/components/products/product-list.tsx
  - apps/web/src/components/products/product-form-dialog.tsx
  - apps/web/src/components/products/variant-editor.tsx
  - apps/web/src/components/products/image-uploader.tsx
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-09
---

# Task: Web Products & Catalog Management UI (`/products`)

## 1. Objective & Value

Implement Products and Catalog management interface with variant editor, stock badges, secure presigned image uploads, and CSV import modal.

**Why this exists**: Allow merchants to add products, adjust stock levels, edit prices, and upload photos securely in the web app.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(dashboard)/products/`
- `apps/web/src/components/products/`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- **Product Table**: Title, Category, Variant Count, Physical Stock, Available Stock, Status Badge, Actions.
- **Product Dialog**: Multi-variant editor (SKU, Price, Stock, Options) + Photo upload.
- **Secure Image Upload**:
  - Image uploader requests a short-lived presigned PUT URL from API via `POST /api/v1/uploads/presigned` (`{ "filename": string, "contentType": "image/jpeg" | "image/png" | "image/webp", "sizeBytes": number }`).
  - Strict client and server validation: 10 MB maximum size cap, mime allowlist (`image/jpeg`, `image/png`, `image/webp`).
  - Uploads file bytes directly to S3 via presigned PUT, then attaches S3 object key / public URL to product record.

---

## 4. Invariants & Security Guardrails

- 🔒 **Zero Direct S3 Credentials**: Client never holds AWS credentials; all uploads use signed short-lived URLs scoped to tenant prefix (`tenants/{businessId}/products/...`).
- 🛡️ **RBAC Guard**: Product edit and archive controls are visible but disabled with an explanatory tooltip for `EMPLOYEE` role.

---

## 5. Implementation Steps

1. Implement `ProductList` table with search and category filters.
2. Implement `ProductFormDialog` and `VariantEditor`.
3. Implement `ImageUploader` requesting presigned URLs and uploading directly to S3 with progress indicator and size checks.
4. Author component tests covering validation, upload flows, and RBAC disabled states.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Product CRUD**: Merchant can add, edit, and archive products with variants.
- [ ] **Presigned Upload**: Images upload securely to S3 via signed PUT URLs with mime and size verification.
- [ ] **RBAC Disabled Controls**: Edit/archive buttons are disabled for Employee role.

---

## 7. Verification Commands

```bash
# 1. Run typecheck & lint
pnpm --filter web check-types && pnpm --filter web lint

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Navigate to `http://localhost:3000/products`; add new product with variants and upload product photo.

---

## 9. Expected Deliverables

Products management page and components in `apps/web`.
