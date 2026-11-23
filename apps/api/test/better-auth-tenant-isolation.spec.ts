import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

import { auth as betterAuth } from "../src/auth";
import { PermissionsGuard } from "../src/platform/security/permissions.guard";
import { TenantGuard } from "../src/platform/security/tenant.guard";

describe("Better Auth & Multi-Tenancy Tenant Isolation (T-AUTH-BETTER)", () => {
  const userA = "11111111-1111-4111-8111-111111111111";
  const businessA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const businessB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  let prismaMock: {
    business: { findFirst: jest.Mock };
    businessMember: { findFirst: jest.Mock; findMany: jest.Mock };
    member: { findFirst: jest.Mock; findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let tenantGuard: TenantGuard;
  let permissionsGuard: PermissionsGuard;
  let reflectorMock: { getAllAndOverride: jest.Mock };
  let getSessionSpy: jest.SpyInstance;

  function makeContext(headers: Record<string, string>, params: Record<string, string> = {}) {
    const req: Record<string, unknown> = {
      headers,
      params,
      body: {},
      ip: "127.0.0.1",
      method: "GET",
      url: "/api/v1/conversations",
    };

    return {
      context: {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => () => undefined,
        getClass: () => class TestController {},
      } as never,
      req,
    };
  }

  beforeEach(() => {
    prismaMock = {
      business: {
        findFirst: jest.fn(),
      },
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      member: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: userA, email: "a@example.com" }),
      },
    };

    reflectorMock = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };

    tenantGuard = new TenantGuard(prismaMock as never);
    permissionsGuard = new PermissionsGuard(reflectorMock as never);
    getSessionSpy = jest.spyOn(betterAuth.api, "getSession");
  });

  afterEach(() => {
    getSessionSpy.mockRestore();
  });

  describe("Cross-Tenant Attack Simulations", () => {
    it("CROSS-TENANT ATTACK 1: User A authenticates into Business A, attempts to access Business B endpoint -> 403 Forbidden", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: userA, email: "a@example.com", twoFactorEnabled: true, platformAdmin: false },
        session: { id: "sess-a", activeOrganizationId: businessA, mfaVerified: true },
      });
      prismaMock.member.findFirst.mockResolvedValue(null);
      prismaMock.business.findFirst.mockResolvedValue({ id: businessB, deleted_at: null });

      const { context } = makeContext(
        { cookie: "better-auth.session_token=valid-a", "x-business-id": businessB },
        { businessId: businessB },
      );

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.member.findFirst).toHaveBeenCalledWith({
        where: { userId: userA, organizationId: businessB },
      });
    });

    it("CROSS-TENANT ATTACK 2: User A belongs to Business A and attempts to access Business B conversations -> 403 Forbidden", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: userA, email: "a@example.com", twoFactorEnabled: true, platformAdmin: false },
        session: { id: "sess-a", activeOrganizationId: businessA, mfaVerified: true },
      });
      prismaMock.member.findFirst.mockResolvedValue(null);
      prismaMock.business.findFirst.mockResolvedValue({ id: businessB, deleted_at: null });

      const { context } = makeContext({
        cookie: "better-auth.session_token=valid-a",
        "x-business-id": businessB,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("CROSS-TENANT ATTACK 3: User attempts to forge businessId header while authenticated in active session -> strictly verified against DB membership", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: userA, email: "a@example.com", twoFactorEnabled: true, platformAdmin: false },
        session: { id: "sess-a", activeOrganizationId: businessA, mfaVerified: true },
      });
      prismaMock.member.findFirst.mockResolvedValue(null);
      prismaMock.business.findFirst.mockResolvedValue({ id: businessB, deleted_at: null });

      const { context } = makeContext({
        cookie: "better-auth.session_token=valid-a",
        "x-business-id": businessB,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("CROSS-TENANT ATTACK 4: Removed member from Business A tries to access Business A data -> 403 Forbidden", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: userA, email: "a@example.com", twoFactorEnabled: true, platformAdmin: false },
        session: { id: "sess-a", activeOrganizationId: businessA, mfaVerified: true },
      });
      prismaMock.member.findFirst.mockResolvedValue(null);
      prismaMock.business.findFirst.mockResolvedValue({ id: businessA, deleted_at: null });

      const { context } = makeContext({
        cookie: "better-auth.session_token=valid-a",
        "x-business-id": businessA,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("Rejects unauthenticated requests with 401 Unauthorized", async () => {
      getSessionSpy.mockResolvedValue(null);

      const { context } = makeContext({ "x-business-id": businessA });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("Session MFA Policy & RBAC Enforcement", () => {
    it("Blocks owner/admin session lacking mfaVerified even when user is enrolled", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: userA, email: "a@example.com", twoFactorEnabled: true, platformAdmin: false },
        session: { id: "sess-a", activeOrganizationId: businessA, mfaVerified: false },
      });
      prismaMock.member.findFirst.mockResolvedValue({
        id: "m-1",
        userId: userA,
        organizationId: businessA,
        role: "owner",
      });
      prismaMock.business.findFirst.mockResolvedValue({ id: businessA, deleted_at: null });

      const { context } = makeContext({
        cookie: "better-auth.session_token=valid-a",
        "x-business-id": businessA,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("Allows ordinary employee rep without MFA and enforces RBAC permissions via PermissionsGuard", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: userA, email: "a@example.com", twoFactorEnabled: false, platformAdmin: false },
        session: { id: "sess-emp", activeOrganizationId: businessA, mfaVerified: false },
      });
      prismaMock.member.findFirst.mockResolvedValue({
        id: "m-emp",
        userId: userA,
        organizationId: businessA,
        role: "employee",
      });
      prismaMock.business.findFirst.mockResolvedValue({ id: businessA, deleted_at: null });

      const { context, req } = makeContext({
        cookie: "better-auth.session_token=valid-emp",
        "x-business-id": businessA,
      });

      await expect(tenantGuard.canActivate(context)).resolves.toBe(true);
      expect(req.businessId).toBe(businessA);
      expect((req.membership as { role?: { name?: string } })?.role?.name).toBe("employee");

      // Employee cannot access team:manage
      reflectorMock.getAllAndOverride.mockReturnValue(["team:manage"]);
      await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
