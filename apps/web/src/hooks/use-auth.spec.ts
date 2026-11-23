import type { SessionDto } from "@app/shared";

import {
  apiClient,
  ApiClientError,
  onMfaRequired,
  onSessionExpired,
  onTokenRefreshed,
} from "../lib/api-client";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const SAMPLE_SESSION: SessionDto = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    name: "Owner",
    platformAdmin: false,
    emailVerified: true,
    twoFactorEnabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  memberships: [
    {
      businessId: "biz-1",
      role: "owner",
      businessName: "Carthage",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  mfaVerified: true,
  mfaSetupRequired: false,
  mfaChallengeRequired: false,
  tokenType: "Bearer",
  expiresIn: 604800,
};

describe("apiClient (Better Auth cookie session)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("bootstraps session via GET /api/v1/workspaces with credentials: include", async () => {
    const refreshedListener = jest.fn();
    const unsub = onTokenRefreshed(refreshedListener);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => SAMPLE_SESSION,
    });

    const session = await apiClient.refreshSession();
    expect(session.user.email).toBe("owner@example.com");
    expect(session.mfaVerified).toBe(true);
    expect(refreshedListener).toHaveBeenCalledWith(SAMPLE_SESSION);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/workspaces");
    expect(init.credentials).toBe("include");
    if (typeof localStorage !== "undefined") {
      expect(localStorage.length).toBe(0);
    }

    unsub();
  });

  it("sends credentials: include on API requests and triggers session expired on 401", async () => {
    const expiredListener = jest.fn();
    const unsub = onSessionExpired(expiredListener);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "unauthorized", message: "Session expired" },
      }),
    });

    await expect(apiClient.get("/api/v1/orders")).rejects.toThrow(ApiClientError);
    expect(expiredListener).toHaveBeenCalledTimes(1);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    unsub();
  });

  it("triggers mfa_setup_required and mfa_required listeners on 403 MFA enforcement", async () => {
    const mfaListener = jest.fn();
    const unsub = onMfaRequired(mfaListener);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: { code: "mfa_setup_required", message: "MFA enrollment required" },
      }),
    });

    await expect(apiClient.get("/api/v1/orders")).rejects.toThrow(ApiClientError);
    expect(mfaListener).toHaveBeenCalledWith("mfa_setup_required");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: { code: "mfa_required", message: "MFA verification required" },
      }),
    });

    await expect(apiClient.get("/api/v1/orders")).rejects.toThrow(ApiClientError);
    expect(mfaListener).toHaveBeenCalledWith("mfa_required");

    unsub();
  });

  it("never stores session tokens in localStorage", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await apiClient.post("/api/v1/invitations/inv-1/accept");
    if (typeof localStorage !== "undefined") {
      expect(localStorage.getItem("accessToken")).toBeNull();
      expect(localStorage.getItem("refreshToken")).toBeNull();
    }
  });
});
