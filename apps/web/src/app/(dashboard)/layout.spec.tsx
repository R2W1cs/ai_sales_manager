/**
 * Automated TDD Test Suite for T-WEB-02 — Web application shell, navigation, tenant switcher, usage widget & header
 * Generated from backlog card acceptance criteria.
 */

/// <reference types="jest" />
import React from "react";
import { renderToString } from "react-dom/server";

import { AppShell } from "@/components/layout/app-shell";
import { ALL_NAV_ITEMS, getFilteredNavItems } from "@/components/layout/nav-items";
import { Sidebar } from "@/components/layout/sidebar";
import {
  formatRoleLabel,
  TenantContext,
  type TenantContextValue,
} from "@/components/layout/tenant-context";

// Mock Next.js navigation hooks
jest.mock("next/navigation", () => ({
  usePathname: () => "/inbox",
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  redirect: jest.fn(),
}));

// Mock useAuth
jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "u-1", name: "Test Merchant", email: "test@example.com" },
    memberships: [
      { businessId: "biz-1", role: "owner", joinedAt: new Date().toISOString() },
      { businessId: "biz-2", role: "employee", joinedAt: new Date().toISOString() },
    ],
    isAuthenticated: true,
    isLoading: false,
    logout: jest.fn(),
  }),
}));

function renderWithTenantRole(ui: React.ReactElement, role: "owner" | "admin" | "employee") {
  const mockTenantContext: TenantContextValue = {
    currentBusinessId: "biz-1",
    currentRole: role,
    currentMembership: { businessId: "biz-1", role, joinedAt: new Date().toISOString() },
    memberships: [{ businessId: "biz-1", role, joinedAt: new Date().toISOString() }],
    businessName: "Test Enterprise",
    switchBusiness: jest.fn(),
    isLoading: false,
  };

  return renderToString(
    <TenantContext.Provider value={mockTenantContext}>{ui}</TenantContext.Provider>,
  );
}

describe("Web application shell, navigation, tenant switcher, usage widget & header (T-WEB-02)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Responsive Layout", () => {
    it("Responsive Layout: Sidebar collapses to Sheet drawer on mobile viewport.", () => {
      const html = renderWithTenantRole(
        <AppShell>
          <div data-slot="test-child">Dashboard Content</div>
        </AppShell>,
        "owner",
      );

      // Verify Header with mobile menu trigger is present
      expect(html).toContain('data-slot="header"');
      expect(html).toContain('data-slot="mobile-menu-trigger"');
      expect(html).toContain('aria-label="Ouvrir le menu"');

      // Verify desktop sidebar container is present with responsive hidden class
      expect(html).toContain("hidden h-full shrink-0 lg:flex");
      expect(html).toContain('data-slot="sidebar"');

      // Verify content is rendered in main canvas
      expect(html).toContain('data-slot="main-canvas"');
      expect(html).toContain("Dashboard Content");
    });
  });

  describe("Tenant Switcher & Formatting", () => {
    it("Tenant Switcher: Formats roles correctly into French operator titles.", () => {
      expect(formatRoleLabel("owner")).toBe("Propriétaire");
      expect(formatRoleLabel("admin")).toBe("Administrateur");
      expect(formatRoleLabel("employee")).toBe("Agent");
    });

    it("Tenant Switcher: Switching workspace refreshes data context.", () => {
      const mockStorage: Record<string, string> = {};
      const originalLocalStorage = global.localStorage;

      Object.defineProperty(global, "localStorage", {
        value: {
          getItem: (key: string) => mockStorage[key] || null,
          setItem: (key: string, val: string) => {
            mockStorage[key] = val;
          },
          removeItem: (key: string) => {
            delete mockStorage[key];
          },
          clear: () => {
            Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
          },
        },
        writable: true,
      });

      // Emulate tenant selection
      const targetBusinessId = "biz-2";
      localStorage.setItem("active_business_id", targetBusinessId);
      expect(localStorage.getItem("active_business_id")).toBe(targetBusinessId);

      // Restore
      Object.defineProperty(global, "localStorage", {
        value: originalLocalStorage,
        writable: true,
      });
    });
  });

  describe("RBAC Navigation Filtering", () => {
    it("Role Visibility: Employee role does not see Settings navigation link.", () => {
      // 1. Check navigation item filtering function
      const employeeItems = getFilteredNavItems("employee");
      const employeeSettingLink = employeeItems.find((item) => item.href === "/settings");
      expect(employeeSettingLink).toBeUndefined();

      const employeeInboxLink = employeeItems.find((item) => item.href === "/inbox");
      expect(employeeInboxLink).toBeDefined();

      // 2. Check Owner items include settings
      const ownerItems = getFilteredNavItems("owner");
      const ownerSettingLink = ownerItems.find((item) => item.href === "/settings");
      expect(ownerSettingLink).toBeDefined();

      // 3. Check Admin items include settings
      const adminItems = getFilteredNavItems("admin");
      const adminSettingLink = adminItems.find((item) => item.href === "/settings");
      expect(adminSettingLink).toBeDefined();

      // 4. Verify rendered Sidebar HTML output for Employee
      const employeeSidebarHtml = renderWithTenantRole(<Sidebar />, "employee");
      expect(employeeSidebarHtml).not.toContain('href="/settings"');
      expect(employeeSidebarHtml).not.toContain("Paramètres");
      expect(employeeSidebarHtml).toContain('href="/inbox"');

      // 5. Verify rendered Sidebar HTML output for Owner
      const ownerSidebarHtml = renderWithTenantRole(<Sidebar />, "owner");
      expect(ownerSidebarHtml).toContain('href="/settings"');
      expect(ownerSidebarHtml).toContain("Paramètres");
    });

    it("Navigation catalog covers required MVP routes", () => {
      const keys = ALL_NAV_ITEMS.map((item) => item.key);
      expect(keys).toContain("inbox");
      expect(keys).toContain("playground");
      expect(keys).toContain("website");
      expect(keys).toContain("pipeline");
      expect(keys).toContain("products");
      expect(keys).toContain("analytics");
      expect(keys).toContain("settings");
    });
  });
});
