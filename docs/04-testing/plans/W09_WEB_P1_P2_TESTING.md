# Wave W9 Testing Specification — Frontend Web P1 / P2 (Catalog, Analytics, Settings)

| Field       | Value                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Wave ID     | `W9`                                                                                        |
| Wave Title  | Frontend Web P1 / P2 (Catalog, Analytics, Settings)                                         |
| Cards       | `T-WEB-07` through `T-WEB-10` (8 leaves)                                                    |
| Status      | Canonical AI Testing Guide for Wave W9 Completion Gate                                      |
| Focus Areas | Catalog management UI, Knowledge editor, Analytics dashboard, Team members, Settings panels |

---

## 1. Automated Verification Suites

```bash
# 1. Web App Check & Build
pnpm --filter web check-types
pnpm --filter web build

# 2. Playwright Admin Flows E2E Suite
pnpm exec playwright test tests/e2e/p1-admin-flows.spec.ts

# 3. Monorepo Full Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Catalog & Media Management UI (`22_UX_FLOWS.md` §19)

- **Product Form Validations**:
  - Currency displayed in Tunisian Dinars (`DT` formatted in French locale).
  - Drag-and-drop image upload integrates presigned S3 upload with progress indicator.
  - CSV upload dialog triggers `POST /catalog/import` and renders polling progress bar.

### B. Knowledge Base & Rules Configurator

- **Conflict Visualization**:
  - Displays overlapping rule warnings when merchant attempts to save conflicting policies.

### C. Team Member Administration & RBAC UI

- **Role Invariants in UI**:
  - Only `OWNER` can view member deletion/demotion options for other admins.
  - Demote action disabled with locked state on the sole remaining `OWNER`.
  - Inviting a new member checks seat quota limit before submission.

### D. Analytics 4 KPI Visualizations

- **KPI Tile Accuracy**:
  - Revenue formatted as `XX XXX DT` without decimal loss.
  - Automation rate chart renders bounded percentages (`0%–100%`).

---

## 3. Playwright Admin E2E Scenarios

```typescript
// tests/e2e/p1-admin-flows.spec.ts
import { test, expect } from "@playwright/test";

test.describe("P1 Admin Management Flows", () => {
  test("Owner creates a new product with price and stock", async ({ page }) => {
    await page.goto("http://localhost:3000/catalog");
    await page.click('button:has-text("Add Product")');
    await page.fill('input[name="name"]', "Chaussures Sport");
    await page.fill('input[name="price"]', "120.000");
    await page.fill('input[name="stock"]', "25");
    await page.click('button:has-text("Save")');

    await expect(page.locator("text=Chaussures Sport")).toBeVisible();
  });
});
```

---

## 4. Wave W9 Completion Gate Checklist

- [ ] All 8 leaves in W9 marked `status: done`.
- [ ] Admin management Playwright suite passes cleanly.
- [ ] `pnpm check:full` exits 0.
