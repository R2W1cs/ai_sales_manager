# Wave W8 Testing Specification — Frontend Web P0 (Auth, Shell, Inbox, Onboarding)

| Field       | Value                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Wave ID     | `W8`                                                                                       |
| Wave Title  | Frontend Web P0 (Auth, Shell, Inbox, Onboarding)                                           |
| Cards       | `T-WEB-01` through `T-WEB-06` (12 leaves)                                                  |
| Status      | Canonical AI Testing Guide for Wave W8 Completion Gate                                     |
| Focus Areas | Next.js 16 App Router, Tailwind, 3-pane live inbox, Staff takeover, Onboarding gate wizard |

---

## 1. Automated Verification Suites

```bash
# 1. Web App Typecheck & Linting
pnpm --filter web check-types
pnpm --filter web lint

# 2. Critical UI Path Playwright E2E Tests (Headless)
pnpm exec playwright test tests/e2e/p0-critical-path.spec.ts

# 3. Monorepo Quality Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Next.js 16 Architectural Boundaries (`10_ARCHITECTURE.md`)

- **Zero Direct API Source Imports**:
  - `apps/web` MUST NOT import anything from `apps/api/src/`.
  - All shared types/DTOs imported strictly from `@repo/shared`.
- **Zero Forbidden Dependencies**:
  - No `radix-ui` custom overrides, no `zustand` stores, no `msw` mocks in production bundle.

### B. Live 3-Pane Inbox UI (`22_UX_FLOWS.md` §18, `23_UI_COMPONENTS.md`)

- **3-Pane Split Layout**:
  - Pane 1: Conversation List (filtered by `view=needs_me`, sorted by `sales_priority`).
  - Pane 2: Message Timeline (thread with oldest-to-newest rendering, AI badge, human takeover banner).
  - Pane 3: Customer Details & Pending Order widget.
- **Realtime Socket Event Ingestion**:
  - Inbound WebSocket message appends to thread in <50ms without full DOM reload.
  - Clicking "Takeover" syncs with API (`POST /takeover`), pauses AI badge, and unlocks message composer.

### C. Onboarding Wizard & Activation Gates (`01` §14)

- **Gates G1–G5 Checklist**:
  - `G1`: Channel connected (Instagram or Messenger).
  - `G2`: At least 1 product created.
  - `G3`: Return policy rule configured.
  - `G4`: Playground test turn completed.
  - `G5`: Handoff briefing acknowledged.
  - AI Activation button remains disabled with explanatory tooltip until all 5 gates are satisfied.

---

## 3. Playwright E2E Test Scenarios

```typescript
// tests/e2e/p0-critical-path.spec.ts
import { test, expect } from "@playwright/test";

test.describe("P0 Critical Path Flow", () => {
  test("Merchant logs in and views live inbox thread", async ({ page }) => {
    await page.goto("http://localhost:3000/login");
    await page.fill('input[type="email"]', "owner@test.com");
    await page.fill('input[type="password"]', "Password12345!");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*\/inbox/);
    await expect(page.locator("text=Needs Attention")).toBeVisible();
  });
});
```

---

## 4. Wave W8 Completion Gate Checklist

- [ ] All 12 leaves in W8 marked `status: done`.
- [ ] Playwright P0 E2E test passes cleanly in headless mode.
- [ ] Web application builds without type errors (`pnpm --filter web build`).
- [ ] `pnpm check:full` exits 0.
