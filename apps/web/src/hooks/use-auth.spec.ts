/**
 * Automated TDD Test Suite for T-WEB-01 — Web authentication UI (login, register, accept invite, session provider)
 * Generated from backlog card acceptance criteria.
 */

import type { SessionDto } from "@app/shared";

/// <reference types="jest" />
import { apiClient, ApiClientError, getAccessToken, setAccessToken } from "../lib/api-client";

describe("Web authentication UI & Session Management (T-WEB-01)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setAccessToken(null);
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("In-memory access token storage (Zero LocalStorage Tokens invariant)", () => {
    // Verify initial token is null
    expect(getAccessToken()).toBeNull();

    // Set token in memory
    setAccessToken("test-access-token-123");
    expect(getAccessToken()).toBe("test-access-token-123");

    // Clear token
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });

  it("Login Flow: Successful login sets in-memory session and returns session DTO", async () => {
    const mockSession: SessionDto = {
      user: {
        id: "user-1",
        email: "merchant@test.com",
        name: "Test Merchant",
        emailVerifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      memberships: [
        {
          businessId: "biz-1",
          role: "owner",
          joinedAt: new Date().toISOString(),
        },
      ],
      accessToken: "mock-jwt-token-abc",
      tokenType: "Bearer",
      expiresIn: 900,
    };

    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/api/v1/auth/login");
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("include");
      const body = JSON.parse(init?.body as string);
      expect(body.email).toBe("merchant@test.com");
      expect(body.password).toBe("password12345");

      return {
        ok: true,
        status: 200,
        json: async () => mockSession,
      };
    });

    const res = await apiClient.post<SessionDto>("/api/v1/auth/login", {
      email: "merchant@test.com",
      password: "password12345",
    });

    expect(res).toEqual(mockSession);
    expect(res.memberships.length).toBe(1);
    expect(res.accessToken).toBe("mock-jwt-token-abc");
  });

  it("Login Flow: Invalid credentials throw 401 ApiClientError with unauthorized code", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: "unauthorized",
          message: "Invalid credentials",
        },
      }),
    });

    await expect(
      apiClient.post("/api/v1/auth/login", {
        email: "unknown@test.com",
        password: "wrongpassword",
      }),
    ).rejects.toThrow(ApiClientError);
  });

  it("Register Flow: Registration sends name, email, password and returns new session", async () => {
    const mockSession: SessionDto = {
      user: {
        id: "user-new",
        email: "new@test.com",
        name: "New User",
        emailVerifiedAt: null,
        createdAt: new Date().toISOString(),
      },
      memberships: [],
      accessToken: "mock-new-token",
      tokenType: "Bearer",
      expiresIn: 900,
    };

    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/api/v1/auth/register");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.name).toBe("New User");
      expect(body.email).toBe("new@test.com");
      expect(body.password).toBe("SecurePass123!");

      return {
        ok: true,
        status: 201,
        json: async () => mockSession,
      };
    });

    const res = await apiClient.post<SessionDto>("/api/v1/auth/register", {
      name: "New User",
      email: "new@test.com",
      password: "SecurePass123!",
    });

    expect(res.user.email).toBe("new@test.com");
    expect(res.memberships.length).toBe(0); // Onboarding required
  });

  it("Invite Flow: Valid token accepts invitation and returns session", async () => {
    const mockSession: SessionDto = {
      user: {
        id: "user-invited",
        email: "staff@test.com",
        name: "Staff Member",
        emailVerifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      memberships: [
        {
          businessId: "biz-1",
          role: "employee",
          joinedAt: new Date().toISOString(),
        },
      ],
      accessToken: "mock-staff-token",
      tokenType: "Bearer",
      expiresIn: 900,
    };

    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/api/v1/auth/invitations/accept");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.token).toBe("valid-invite-token-xyz");

      return {
        ok: true,
        status: 200,
        json: async () => mockSession,
      };
    });

    const res = await apiClient.post<SessionDto>("/api/v1/auth/invitations/accept", {
      token: "valid-invite-token-xyz",
    });

    expect(res.user.id).toBe("user-invited");
    expect(res.memberships[0].businessId).toBe("biz-1");
  });

  it("401 Silent Refresh: Expired access token triggers silent refresh and retries original request", async () => {
    setAccessToken("expired-token");

    let refreshCalled = false;
    let originalRequestAttempt = 0;

    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/v1/auth/refresh")) {
        refreshCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "u-1",
              email: "user@test.com",
              name: "User",
              emailVerified: true,
              image: null,
              createdAt: "",
              updatedAt: "",
            },
            memberships: [],
            accessToken: "fresh-new-token-999",
            tokenType: "Bearer",
            expiresIn: 900,
          }),
        };
      }

      if (url.includes("/api/v1/some-resource")) {
        originalRequestAttempt++;
        const authHeader = (init?.headers as Record<string, string>)?.["Authorization"];

        if (originalRequestAttempt === 1) {
          expect(authHeader).toBe("Bearer expired-token");
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: { code: "unauthorized", message: "Token expired" },
            }),
          };
        }

        // Retry must use the fresh new token
        expect(authHeader).toBe("Bearer fresh-new-token-999");
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: "success" }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await apiClient.get<{ data: string }>("/api/v1/some-resource");

    expect(refreshCalled).toBe(true);
    expect(originalRequestAttempt).toBe(2);
    expect(result).toEqual({ data: "success" });
    expect(getAccessToken()).toBe("fresh-new-token-999");
  });

  it("Race-free Refresh: Concurrent 401s execute only a single refresh HTTP request", async () => {
    setAccessToken("expired-token");

    let refreshCount = 0;
    let req1Attempts = 0;
    let req2Attempts = 0;

    global.fetch = jest.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (url.includes("/api/v1/auth/refresh")) {
        refreshCount++;
        // Simulate network latency for refresh
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "u-1",
              email: "user@test.com",
              name: "User",
              emailVerified: true,
              image: null,
              createdAt: "",
              updatedAt: "",
            },
            memberships: [],
            accessToken: "fresh-mutex-token",
            tokenType: "Bearer",
            expiresIn: 900,
          }),
        };
      }

      if (url.includes("/api/v1/res-1")) {
        req1Attempts++;
        if (req1Attempts === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: { code: "unauthorized", message: "Token expired" },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ res: 1 }),
        };
      }

      if (url.includes("/api/v1/res-2")) {
        req2Attempts++;
        if (req2Attempts === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: { code: "unauthorized", message: "Token expired" },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ res: 2 }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    // Fire both requests concurrently
    const [res1, res2] = await Promise.all([
      apiClient.get<{ res: number }>("/api/v1/res-1"),
      apiClient.get<{ res: number }>("/api/v1/res-2"),
    ]);

    expect(refreshCount).toBe(1); // EXACTLY ONE refresh call dispatched
    expect(res1).toEqual({ res: 1 });
    expect(res2).toEqual({ res: 2 });
    expect(getAccessToken()).toBe("fresh-mutex-token");
  });

  it("Retry Token Isolation: Retries use the token returned by the refresh flight and remain bounded", async () => {
    setAccessToken("expired-token");

    const usedTokens: string[] = [];

    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/v1/auth/refresh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: "u-1", email: "user@test.com", name: "User" },
            memberships: [],
            accessToken: "token-from-flight-1",
            tokenType: "Bearer",
            expiresIn: 900,
          }),
        };
      }

      if (url.includes("/api/v1/protected")) {
        const authHeader = (init?.headers as Record<string, string>)?.["Authorization"];
        if (authHeader) {
          usedTokens.push(authHeader);
        }

        if (usedTokens.length === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: { code: "unauthorized" } }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const res = await apiClient.get<{ success: boolean }>("/api/v1/protected");
    expect(res).toEqual({ success: true });
    // First attempt used expired-token, retry used token-from-flight-1
    expect(usedTokens).toEqual(["Bearer expired-token", "Bearer token-from-flight-1"]);
  });

  it("Transient Refresh Error: 500 Internal Server Error does NOT clear session or trigger session expiration", async () => {
    setAccessToken("valid-token-before-error");
    let expiredFired = false;
    const unsub = apiClient.onSessionExpired(() => {
      expiredFired = true;
    });

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/resource-with-500")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "unauthorized" } }),
        };
      }
      if (url.includes("/api/v1/auth/refresh")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { code: "internal_error", message: "DB connection down" } }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(apiClient.get("/api/v1/resource-with-500")).rejects.toThrow(ApiClientError);
    // Session should NOT have been cleared and expired handler should NOT have fired
    expect(expiredFired).toBe(false);
    expect(getAccessToken()).toBe("valid-token-before-error");
    unsub();
  });

  it("Permanent Refresh Error: 401 Unauthorized during refresh DOES clear session and trigger expiration", async () => {
    setAccessToken("expired-token");
    let expiredFired = false;
    const unsub = apiClient.onSessionExpired(() => {
      expiredFired = true;
    });

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/resource-with-401")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "unauthorized" } }),
        };
      }
      if (url.includes("/api/v1/auth/refresh")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "unauthorized", message: "Refresh token revoked" } }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(apiClient.get("/api/v1/resource-with-401")).rejects.toThrow(ApiClientError);
    expect(expiredFired).toBe(true);
    expect(getAccessToken()).toBeNull();
    unsub();
  });
});
