/**
 * Test Suite for GuestGuard and getSafeRedirectUrl
 */

/// <reference types="jest" />
import React from "react";
import { renderToString } from "react-dom/server";

import { AuthContext, type AuthContextValue } from "@/hooks/use-auth";
import { getSafeRedirectUrl } from "@/lib/safe-redirect";

import { GuestGuard } from "./guest-guard";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

function createMockAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    memberships: [],
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    login: jest.fn(),
    register: jest.fn(),
    acceptInvite: jest.fn(),
    logout: jest.fn(),
    refreshSession: jest.fn(),
    setSession: jest.fn(),
    ...overrides,
  };
}

describe("GuestGuard & Safe Redirect Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSafeRedirectUrl", () => {
    it("enforces /onboarding when user has no active memberships (spec 02 §150)", () => {
      expect(getSafeRedirectUrl("", false)).toBe("/onboarding");
      expect(getSafeRedirectUrl("?redirect=/settings", false)).toBe("/onboarding");
      expect(getSafeRedirectUrl("?redirect=/pipeline", false)).toBe("/onboarding");
    });

    it("defaults to /inbox when user has memberships and no redirect param", () => {
      expect(getSafeRedirectUrl("", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?foo=bar", true)).toBe("/inbox");
    });

    it("accepts valid relative redirect paths for users with memberships", () => {
      expect(getSafeRedirectUrl("?redirect=/settings", true)).toBe("/settings");
      expect(getSafeRedirectUrl("?redirect=/pipeline?tab=won", true)).toBe("/pipeline?tab=won");
    });

    it("prevents infinite redirect loops by rejecting auth routes as redirect targets", () => {
      expect(getSafeRedirectUrl("?redirect=/login", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?redirect=/register", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?redirect=/invite?token=abc", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?redirect=/login?param=1", true)).toBe("/inbox");
    });

    it("rejects open redirect attempts to external protocols or domains", () => {
      expect(getSafeRedirectUrl("?redirect=https://evil.com", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?redirect=http://evil.com", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?redirect=//evil.com", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?redirect=/\\evil.com", true)).toBe("/inbox");
      expect(getSafeRedirectUrl("?redirect=javascript:alert(1)", true)).toBe("/inbox");
    });
  });

  describe("GuestGuard rendering", () => {
    it("renders loading card when isLoading is true", () => {
      const auth = createMockAuthContext({ isLoading: true, isAuthenticated: false });
      const html = renderToString(
        <AuthContext.Provider value={auth}>
          <GuestGuard>
            <div data-slot="guest-content">Guest Form</div>
          </GuestGuard>
        </AuthContext.Provider>,
      );

      expect(html).toContain('data-slot="guest-guard-loading"');
      expect(html).not.toContain("Guest Form");
    });

    it("renders loading card when isAuthenticated is true", () => {
      const auth = createMockAuthContext({
        isLoading: false,
        isAuthenticated: true,
        user: {
          id: "u-1",
          name: "User",
          email: "user@test.com",
          emailVerifiedAt: null,
          createdAt: new Date().toISOString(),
        },
      });
      const html = renderToString(
        <AuthContext.Provider value={auth}>
          <GuestGuard>
            <div data-slot="guest-content">Guest Form</div>
          </GuestGuard>
        </AuthContext.Provider>,
      );

      expect(html).toContain('data-slot="guest-guard-loading"');
      expect(html).not.toContain("Guest Form");
    });

    it("renders children when unauthenticated and not loading", () => {
      const auth = createMockAuthContext({ isLoading: false, isAuthenticated: false });
      const html = renderToString(
        <AuthContext.Provider value={auth}>
          <GuestGuard>
            <div data-slot="guest-content">Guest Form</div>
          </GuestGuard>
        </AuthContext.Provider>,
      );

      expect(html).not.toContain('data-slot="guest-guard-loading"');
      expect(html).toContain("Guest Form");
    });
  });
});
