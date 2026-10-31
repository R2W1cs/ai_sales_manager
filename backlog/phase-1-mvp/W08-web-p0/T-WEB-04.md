---
id: T-WEB-04
parent: T-WEB-04
wave: W8
status: done
optional: false
depends:
  - T-WEB-02
  - T-BIZ-04
  - T-AI-06
  - T-INT-01
  - T-CAT-03
fs:
  - FS-WEB-03
read:
  - docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md
  - docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/web/src/app/(dashboard)/onboarding/page.tsx
  - apps/web/src/components/onboarding/onboarding-wizard.tsx
  - apps/web/src/components/onboarding/step-store-setup.tsx
  - apps/web/src/components/onboarding/step-channel-connect.tsx
  - apps/web/src/components/onboarding/step-catalog-upload.tsx
  - apps/web/src/components/onboarding/step-playground-test.tsx
  - apps/web/src/components/onboarding/step-live-activation.tsx
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-05
---

# Task: Web Onboarding Wizard UI (5 steps: Store, Channels, Catalog, Playground, Live Gate)

## 1. Objective & Value

Implement 5-step interactive Onboarding Wizard guiding merchants through Store Profile, Channel Connection, Catalog CSV Upload, AI Playground Simulation, and Live Activation Checklist (Gates G1–G5).

**Why this exists**: Ensure every merchant completes all necessary configuration and handoff policy acknowledgment before turning on live customer-facing AI responses.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(dashboard)/onboarding/`
- `apps/web/src/components/onboarding/`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- **Step 1: Store Setup**: Name, currency (TND), timezone (`Africa/Tunis`), phone.
- **Step 2: Channel Connect**: Meta OAuth Instagram/Messenger connect card (`GET /api/v1/integrations/meta/connect`).
- **Step 3: Catalog Upload**: CSV drag-and-drop with pre-flight error table (`POST /api/v1/products/import`).
- **Step 4: Playground Test**: Live simulated chat modal verifying pricing and stock (`POST /api/v1/ai/playground/session`).
- **Step 5: Live Activation & Gates G1–G5 Checklist**:
  - G1 (Catalog): At least 1 active product with priced, in-stock variant.
  - G2 (Rules): Delivery and return policies saved.
  - G3 (Channels): At least 1 active connected Meta channel account.
  - G4 (Playground): Simulation test passed.
  - G5 (Human Engagement): Mandatory checkbox: _"I understand AI qualifies orders and staff performs final confirmation"_. Checked state submits `PATCH /api/v1/business-onboarding` `{ "handoffAcknowledged": true }`.
  - **Live Activation CTA**: `[Activer l'Agent IA en direct]` calls `PATCH /api/v1/integrations/live` `{ "enabled": true }`. Button is disabled while `aiActivationReady` is false or `unmetGates.length > 0`. On 422 `activation_not_ready`, displays unmet gates list inline.

---

## 4. Invariants & Security Guardrails

- 🔒 **Enforce All 5 Gates (G1–G5)**: Live activation requires G1 through G5. Skipping G5 handoff acknowledgment blocks activation and surfaces unmet gate warning.
- 🛡️ **Zero Auto-Send by Default**: Live activation enables AI in `approval_required` mode by default.

---

## 5. Implementation Steps

1. Implement `OnboardingWizard` with step state machine and progress bar.
2. Implement Steps 1–4 components connecting to corresponding API endpoints.
3. Implement Step 5 checklist validating server `unmetGates` list, G5 acknowledgment handler, and live activation trigger.
4. Author component tests covering wizard step transitions and activation button states.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Step Navigation**: Merchant can progress through all 5 steps.
- [ ] **Gate G5 Submission**: Checking handoff acknowledgment submits G5 to `/business-onboarding`.
- [ ] **Gate Lock**: Live activation toggle remains locked until all gates (G1–G5) are satisfied.
- [ ] **Activation Success**: Successful activation redirects to `/inbox`.

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

- **🧪 Manual QA & Smoke test**: Open `http://localhost:3000/onboarding`; test Step 1 store setup, Step 2 channel card, Step 3 catalog upload, Step 4 playground chat, Step 5 live activation.

---

## 9. Expected Deliverables

Onboarding Wizard page and step components in `apps/web`.
