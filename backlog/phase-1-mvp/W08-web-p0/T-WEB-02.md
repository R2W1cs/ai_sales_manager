---
id: T-WEB-02
parent: T-WEB-02
wave: W8
status: done
optional: false
depends:
  - T-WEB-01
  - T-BILL-03
  - T-NOTIF-02
fs:
  - FS-WEB-01
read:
  - docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md
  - docs/20_design/23_UI_COMPONENTS/02-primitives-shared-atoms-shell.md
  - docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md
files:
  - apps/web/src/app/(dashboard)/layout.tsx
  - apps/web/src/components/layout/app-shell.tsx
  - apps/web/src/components/layout/sidebar.tsx
  - apps/web/src/components/layout/header.tsx
  - apps/web/src/components/layout/tenant-switcher.tsx
  - apps/web/src/components/layout/usage-widget.tsx
  - apps/web/src/components/layout/notification-popover.tsx
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-03
---

# Task: Web application shell, navigation, tenant switcher, usage widget & header

## 1. Objective & Value

Implement responsive web application dashboard shell with collapsible sidebar, RBAC-filtered navigation, tenant workspace switcher, live usage progress widget, and notification bell popover.

**Why this exists**: Provide a cohesive, responsive layout framing all dashboard views with workspace switching and alert indicators.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/components/layout/`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- Desktop: Left sidebar (collapsible to icons) + Top header with tenant switcher, usage widget, and notification bell.
- Mobile (<768px): Header with hamburger button opening Sheet drawer menu.
- RBAC Filtering: Hide Settings link for Employee role.

---

## 4. Invariants & Security Guardrails

- 🔒 **Unified Frontend RBAC Policy**:
  - **Top-Level Navigation / Routes**: Completely hidden from navigation menus and sidebar for roles lacking the required permission (e.g. `/settings` link is hidden for `EMPLOYEE` role).
  - **In-Page Action Controls**: Within accessible views (e.g. Products list), buttons for restricted actions (edit/delete) are rendered disabled with a tooltip explaining the required role (`@RequirePermission`).
- 🛡️ **No Route Bypass**: Navigating directly to `/settings` as an Employee redirects to `/inbox`.

## 5. Implementation Steps

1. Implement `AppShell` and responsive layout with Radix / shadcn components.
2. Implement `Sidebar` with active route highlights and role filtering.
3. Implement `TenantSwitcher` switching `X-Business-Id` in active session.
4. Implement `UsageWidget` and `NotificationPopover` in header.
5. Author layout unit tests verifying role-based item visibility.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Responsive Layout**: Sidebar collapses to Sheet drawer on mobile viewport.
- [ ] **Tenant Switcher**: Switching workspace refreshes data context.
- [ ] **Role Visibility**: Employee role does not see Settings navigation link.

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

- **🧪 Manual QA & Smoke test**: Log in as Owner (verify all nav links, usage widget, notification bell); log in as Employee (verify Settings hidden); test mobile responsive drawer.

---

## 9. Expected Deliverables

Responsive AppShell layout components and unit tests in `apps/web`.
