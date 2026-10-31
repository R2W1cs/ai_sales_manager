---
id: T-WEB-06
parent: T-WEB-06
wave: W8
status: done
optional: false
depends:
  - T-WEB-03
  - T-WEB-04
fs:
  - FS-WEB-01
read:
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
  - docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md
  - docs/20_design/22_UX_FLOWS/04-journeys-states-accessibility.md
files:
  - apps/web/playwright.config.ts
  - apps/web/e2e/core-journey.spec.ts
done_cmd: pnpm --filter web exec playwright test
next: T-WEB-07
---

# Task: Playwright end-to-end core user journey test suite

## 1. Objective & Value

Implement Playwright E2E test executing the complete P0 merchant lifecycle: Signup -> Onboarding -> Inbox -> AI Draft Approval -> Order Drawer Confirmation.

**Why this exists**: Automated regression verification of the primary user journey across the frontend and backend stack without external dependencies.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/e2e/`
- `apps/web/playwright.config.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- **E2E Isolated Journey Flow**:
  1. Signup & Auth: Register new merchant account via `/register`.
  2. Onboarding: Progress through Store Setup, Meta Connect (fixture), Catalog CSV upload (Step 3), Playground Simulation (Step 4), and Gate G5 Acknowledgment + Live Activation (Step 5).
  3. Realtime Inbox: Navigate to `/inbox`, trigger simulated inbound message via API test fixture helper.
  4. Draft Review: Review proposed AI draft, click `[Approve & Send]`.
  5. Order Confirmation: Open Order Drawer in Pane 3, verify line items and totals, click `[Confirm Order]`.
- **Fixture Strategy**: Tests execute against clean isolated tenant database state seeded with product variants and simulate inbound webhook events via REST test fixture endpoints, without requiring W9 standalone catalog or settings pages.

---

## 4. Invariants & Security Guardrails

- 🔒 **Clean Fixtures & Teardown**: Each test run creates an isolated tenant and cleans up on completion.
- 🚫 **Zero External Network Calls**: Meta OAuth and WhatsApp/Instagram API calls are intercepted by local mock fixtures.

---

## 5. Implementation Steps

1. Configure Playwright configuration with web server and API baseURL.
2. Author helper fixtures for test tenant generation and inbound message injection.
3. Author `core-journey.spec.ts` executing the 5-step registration-to-order flow.
4. Verify execution in CI headless mode.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **E2E Success**: Playwright test completes full registration-to-order journey with 0 errors.
- [ ] **Draft to Order**: Verifies draft approval sends message and order drawer confirmation completes.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter web exec playwright test

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Run `pnpm --filter web exec playwright test --headed` and observe automated browser execution.

---

## 9. Expected Deliverables

Playwright E2E configuration and test suite in `apps/web/e2e`.
