import * as crypto from "node:crypto";

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import {
  CurrentBusinessId,
  CurrentMembership,
  CurrentTenant,
  CurrentUser,
  TenantGuard,
} from "./tenant.guard";

function createValidAccessToken(
  userId: string,
  secret = "default-access-secret-min-32-chars-long",
): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      typ: "access",
      iss: "aisales",
      aud: "access",
      iat: now,
      exp: now + 900,
    }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function mockExecutionContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => ({}),
    getHandler: () => () => undefined,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({
      getData: () => undefined,
      getContext: () => undefined,
    }),
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => "",
    }),
    getType: () => "http",
  } as unknown as ExecutionContext;
}

describe("TenantGuard (13 §2.4, 17 §4)", () => {
  let mockPrisma: {
    businessMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let guard: TenantGuard;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "default-access-secret-min-32-chars-long";
    mockPrisma = {
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    guard = new TenantGuard(mockPrisma as unknown as PrismaClient);
  });

  describe("Authentication handling", () => {
    it("throws 401 unauthorized when no token and no req.user", async () => {
      const req = {
        headers: {},
      };
      const context = mockExecutionContext(req);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: { error: { code: "unauthorized", message: "Missing access token" } },
      });
    });

    it("throws 401 unauthorized when token is invalid or expired", async () => {
      const req = {
        headers: {
          authorization: "Bearer invalid.token.value",
        },
      };
      const context = mockExecutionContext(req);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: { error: { code: "unauthorized", message: "Invalid or expired access token" } },
      });
    });

    it("accepts valid bearer token and sets req.user", async () => {
      const userId = "user-123";
      const token = createValidAccessToken(userId);
      const req: Record<string, unknown> = {
        headers: {
          authorization: `Bearer ${token}`,
          "x-business-id": "biz-1",
        },
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findFirst.mockResolvedValueOnce({
        id: "mem-1",
        user_id: userId,
        business_id: "biz-1",
        removed_at: null,
        business: { id: "biz-1", name: "Acme", deleted_at: null },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(req.user).toEqual({ id: userId, sub: userId });
      expect(req.businessId).toBe("biz-1");
    });
  });

  describe("Tenant resolution with X-Business-Id header (13 §2.4)", () => {
    it("resolves tenant when X-Business-Id matches an active membership", async () => {
      const userId = "user-abc";
      const req: Record<string, unknown> = {
        user: { id: userId, sub: userId },
        headers: {
          "x-business-id": "biz-target-100",
        },
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findFirst.mockResolvedValueOnce({
        id: "mem-100",
        user_id: userId,
        business_id: "biz-target-100",
        removed_at: null,
        business: { id: "biz-target-100", name: "Target Store", deleted_at: null },
        role: { id: "role-owner", name: "owner" },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(req.businessId).toBe("biz-target-100");
      expect(req.tenantId).toBe("biz-target-100");
      expect(req.membership).toBeDefined();
      expect(mockPrisma.businessMember.findFirst).toHaveBeenCalledWith({
        where: {
          user_id: userId,
          business_id: "biz-target-100",
          removed_at: null,
          business: {
            deleted_at: null,
          },
        },
        include: {
          business: true,
          role: {
            include: {
              role_permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });
    });

    it("rejects with 403 forbidden when user is not a member of foreign business", async () => {
      const userId = "user-abc";
      const req: Record<string, unknown> = {
        user: { id: userId, sub: userId },
        headers: {
          "x-business-id": "foreign-biz-999",
        },
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findFirst.mockResolvedValueOnce(null);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: { error: { code: "forbidden", message: "Access to this business is forbidden" } },
      });
    });
  });

  describe("Tenant resolution when X-Business-Id is omitted (13 §2.4)", () => {
    it("uses the single active membership when exactly 1 membership exists", async () => {
      const userId = "user-single";
      const req: Record<string, unknown> = {
        user: { id: userId, sub: userId },
        headers: {},
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findMany.mockResolvedValueOnce([
        {
          id: "mem-single",
          user_id: userId,
          business_id: "biz-only",
          removed_at: null,
          business: { id: "biz-only", name: "Only Biz", deleted_at: null },
          role: { id: "role-1", name: "owner" },
        },
      ]);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(req.businessId).toBe("biz-only");
    });

    it("throws 403 no_business when user has 0 active memberships", async () => {
      const userId = "user-none";
      const req: Record<string, unknown> = {
        user: { id: userId, sub: userId },
        headers: {},
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findMany.mockResolvedValue([]);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: { code: "no_business", message: "User is not a member of any active business" },
        },
      });
    });

    it("throws 400 business_required when user belongs to multiple active businesses", async () => {
      const userId = "user-multi";
      const req: Record<string, unknown> = {
        user: { id: userId, sub: userId },
        headers: {},
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findMany.mockResolvedValue([
        {
          id: "mem-1",
          user_id: userId,
          business_id: "biz-1",
          removed_at: null,
          business: { id: "biz-1", name: "Biz One", deleted_at: null },
        },
        {
          id: "mem-2",
          user_id: userId,
          business_id: "biz-2",
          removed_at: null,
          business: { id: "biz-2", name: "Biz Two", deleted_at: null },
        },
      ]);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: {
            code: "business_required",
            message: "X-Business-Id header is required when user belongs to multiple businesses",
            details: { hint: "pick_business" },
          },
        },
      });
    });
  });

  describe("Path param verification (13 §2.4, 17 §4)", () => {
    it("throws 403 forbidden if :businessId path param does not match resolved tenant", async () => {
      const userId = "user-1";
      const req: Record<string, unknown> = {
        user: { id: userId, sub: userId },
        headers: { "x-business-id": "biz-1" },
        params: { businessId: "biz-different" },
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findFirst.mockResolvedValueOnce({
        id: "mem-1",
        user_id: userId,
        business_id: "biz-1",
        removed_at: null,
        business: { id: "biz-1", name: "Acme", deleted_at: null },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("throws 403 forbidden if :id on /businesses/:id route does not match resolved tenant", async () => {
      const userId = "user-1";
      const req: Record<string, unknown> = {
        user: { id: userId, sub: userId },
        headers: { "x-business-id": "biz-1" },
        url: "/api/v1/businesses/biz-different",
        params: { id: "biz-different" },
      };
      const context = mockExecutionContext(req);

      mockPrisma.businessMember.findFirst.mockResolvedValueOnce({
        id: "mem-1",
        user_id: userId,
        business_id: "biz-1",
        removed_at: null,
        business: { id: "biz-1", name: "Acme", deleted_at: null },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("Decorators (CurrentBusinessId, CurrentTenant, CurrentUser, CurrentMembership)", () => {
    it("decorators are defined functions", () => {
      expect(typeof CurrentBusinessId).toBe("function");
      expect(typeof CurrentTenant).toBe("function");
      expect(typeof CurrentUser).toBe("function");
      expect(typeof CurrentMembership).toBe("function");
    });
  });
});
