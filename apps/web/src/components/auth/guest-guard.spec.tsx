import React from "react";
import { renderToString } from "react-dom/server";

import { GuestGuard } from "@/components/auth/guest-guard";
import { AuthContext, type AuthContextValue } from "@/hooks/use-auth";
import { getSafeAuthContinuationRedirect, getSafeRedirectUrl } from "@/lib/safe-redirect";

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const mockRedirect = jest.fn((url: string) => {
  throw new RedirectSignal(url);
});

jest.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

function buildAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    memberships: [],
    mfaVerified: false,
    mfaSetupRequired: false,
    mfaChallengeRequired: false,
    isAuthenticated: false,
    isLoading: false,
    login: jest.fn(),
    acceptInvite: jest.fn(),
    logout: jest.fn(),
    refreshSession: jest.fn(),
    setSession: jest.fn(),
    ...overrides,
  };
}

describe("getSafeRedirectUrl & getSafeAuthContinuationRedirect", () => {
  it("redirects users without memberships to /onboarding", () => {
    expect(getSafeRedirectUrl("?redirect=/dashboard", false)).toBe("/onboarding");
    expect(getSafeRedirectUrl("", false)).toBe("/onboarding");
  });

  it("redirects users with memberships to /inbox by default", () => {
    expect(getSafeRedirectUrl("", true)).toBe("/inbox");
  });

  it("allows safe internal redirect paths when user has memberships", () => {
    expect(getSafeRedirectUrl("?redirect=/settings/team", true)).toBe("/settings/team");
  });

  it("rejects open redirect attempts and auth routes in getSafeRedirectUrl", () => {
    expect(getSafeRedirectUrl("?redirect=https://evil.com", true)).toBe("/inbox");
    expect(getSafeRedirectUrl("?redirect=//evil.com", true)).toBe("/inbox");
    expect(getSafeRedirectUrl("?redirect=/login", true)).toBe("/inbox");
    expect(getSafeRedirectUrl("?redirect=/invite?token=abc", true)).toBe("/inbox");
  });

  it("allows /invite?token=abc in getSafeAuthContinuationRedirect while blocking open redirects", () => {
    expect(getSafeAuthContinuationRedirect("/invite?token=abc")).toBe("/invite?token=abc");
    expect(getSafeAuthContinuationRedirect("/inbox")).toBe("/inbox");
    expect(getSafeAuthContinuationRedirect("https://evil.com")).toBeNull();
    expect(getSafeAuthContinuationRedirect("//evil.com")).toBeNull();
    expect(getSafeAuthContinuationRedirect("/login")).toBeNull();
    expect(getSafeAuthContinuationRedirect("/2fa")).toBeNull();
  });
});

describe("GuestGuard", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it("renders children when guest and not loading", () => {
    const html = renderToString(
      <AuthContext.Provider value={buildAuthValue()}>
        <GuestGuard>
          <div>Guest Login Content</div>
        </GuestGuard>
      </AuthContext.Provider>,
    );

    expect(html).toContain("Guest Login Content");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /2fa/setup when mfaSetupRequired is true", () => {
    expect(() =>
      renderToString(
        <AuthContext.Provider
          value={buildAuthValue({
            mfaSetupRequired: true,
          })}
        >
          <GuestGuard>
            <div>Guest Login Content</div>
          </GuestGuard>
        </AuthContext.Provider>,
      ),
    ).toThrow("NEXT_REDIRECT:/2fa/setup");
    expect(mockRedirect).toHaveBeenCalledWith("/2fa/setup");
  });

  it("redirects to /2fa when mfaChallengeRequired is true", () => {
    expect(() =>
      renderToString(
        <AuthContext.Provider
          value={buildAuthValue({
            mfaChallengeRequired: true,
          })}
        >
          <GuestGuard>
            <div>Guest Login Content</div>
          </GuestGuard>
        </AuthContext.Provider>,
      ),
    ).toThrow("NEXT_REDIRECT:/2fa");
    expect(mockRedirect).toHaveBeenCalledWith("/2fa");
  });

  it("redirects authenticated owner with memberships to /inbox", () => {
    expect(() =>
      renderToString(
        <AuthContext.Provider
          value={buildAuthValue({
            isAuthenticated: true,
            mfaVerified: true,
            user: {
              id: "u1",
              email: "owner@example.com",
              name: "Owner",
              platformAdmin: false,
              emailVerified: true,
              twoFactorEnabled: true,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            memberships: [
              {
                businessId: "b1",
                role: "owner",
                businessName: "Shop",
                joinedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          })}
        >
          <GuestGuard>
            <div>Guest Login Content</div>
          </GuestGuard>
        </AuthContext.Provider>,
      ),
    ).toThrow("NEXT_REDIRECT:/inbox");
    expect(mockRedirect).toHaveBeenCalledWith("/inbox");
  });

  it("redirects platformAdmin users to /operator", () => {
    expect(() =>
      renderToString(
        <AuthContext.Provider
          value={buildAuthValue({
            isAuthenticated: true,
            mfaVerified: true,
            user: {
              id: "u-admin",
              email: "admin@example.com",
              name: "Platform Admin",
              platformAdmin: true,
              emailVerified: true,
              twoFactorEnabled: true,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            memberships: [],
          })}
        >
          <GuestGuard>
            <div>Guest Login Content</div>
          </GuestGuard>
        </AuthContext.Provider>,
      ),
    ).toThrow("NEXT_REDIRECT:/operator");
    expect(mockRedirect).toHaveBeenCalledWith("/operator");
  });
});
