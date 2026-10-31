---
id: T-WEB-10
parent: T-WEB-10
wave: W9
status: done
optional: false
depends:
  - T-WEB-02
  - T-KNOW-01
  - T-BIZ-03
  - T-BILL-03
  - T-AI-10
fs:
  - FS-WEB-04
read:
  - docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md
  - docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
files:
  - apps/web/src/app/(dashboard)/settings/page.tsx
  - apps/web/src/components/settings/settings-personality-tab.tsx
  - apps/web/src/components/settings/settings-channels-tab.tsx
  - apps/web/src/components/settings/settings-rules-tab.tsx
  - apps/web/src/components/settings/settings-team-tab.tsx
  - apps/web/src/components/settings/settings-billing-tab.tsx
  - apps/web/e2e/admin-flows.spec.ts
done_cmd: pnpm --filter web exec playwright test
next: T-WEB-11
---

# Task: Web Settings Tabs UI (Personality, Channels, Rules, Team, Billing)

## 1. Objective & Value

Implement complete Settings interface with 5 dedicated configuration tabs (Agent Personality, Channels, Commercial Rules, Team Members, and Billing/Quotas).

**Why this exists**: Allow store owners and managers to manage their AI configuration, channels, store policies, team permissions, and billing.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(dashboard)/settings/`
- `apps/web/src/components/settings/`
- `apps/web/e2e/admin-flows.spec.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- **Tab 1 (Personality)**: Agent name, tone slider, language, reply mode selector (`approval_required` | `auto_send`).
- **Tab 2 (Channels)**: Connected accounts list + Meta connect button.
- **Tab 3 (Rules)**: Delivery zones, return policy, payment rules.
- **Tab 4 (Team)**: Member list + Invite modal with role selector (`ADMIN` | `EMPLOYEE`).
- **Tab 5 (Billing — Owner Only)**:
  - Current plan badge and monthly cycle interval (`Africa/Tunis`).
  - Quota usage progress bars (AI messages, seats, channels).
  - Upgrade button: Opens manual plan upgrade dialog (_"Contact sales / upgrade plan"_) matching MVP `provider = 'manual'` scope.

---

## 4. Invariants & Security Guardrails

- 🛡️ **Owner-Only Billing Tab**: Billing tab is completely hidden from non-Owner members.
- 🔒 **RBAC View Guard**: Settings route `/settings` redirects to `/inbox` for `EMPLOYEE` role.

---

## 5. Implementation Steps

1. Implement `SettingsTabs` wrapper with URL hash syncing.
2. Implement Tabs 1 through 5 components.
3. Author component tests covering tab rendering and form submissions.
4. Author `admin-flows.spec.ts` Playwright test validating personality edits and team invites.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Settings Tabs**: Owner can configure personality, channels, rules, team, and view billing.
- [ ] **Billing Modal**: Clicking upgrade opens manual tier upgrade dialog.
- [ ] **Admin E2E**: Playwright passes admin settings journey.

---

## 7. Verification Commands

```bash
# 1. Run Playwright admin E2E suite
pnpm --filter web exec playwright test

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Navigate to `http://localhost:3000/settings`; test updating personality and inviting teammate.

---

## 9. Expected Deliverables

Settings page, tab components, and Playwright admin test in `apps/web`.
