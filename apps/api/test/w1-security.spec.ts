import * as crypto from "node:crypto";

/* oxlint-disable typescript/no-unsafe-return */
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthService, signJwt } from "../src/auth/core/auth.service";
import type { PermissionCode } from "../src/platform/security/permissions";
import { PERMISSION_CODES } from "../src/platform/security/permissions";
import { PermissionsGuard } from "../src/platform/security/permissions.guard";
import { TenantGuard } from "../src/platform/security/tenant.guard";
import {
  createMockPrisma,
  generateTestAccessToken,
  hashPassword,
  TEST_BETTER_AUTH_SECRET,
} from "./test-helpers";

describe("Wave 1 Security & Penetration Suite (W1-SEC)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BETTER_AUTH_SECRET: TEST_BETTER_AUTH_SECRET,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("1. Closed RBAC 22-Permission Grid (17 §5.1 / 13 §2.11)", () => {
    let reflector: Reflector;
    let guard: PermissionsGuard;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new PermissionsGuard(reflector);
    });

    function createMockContext(
      permission: PermissionCode,
      roleName: "owner" | "admin" | "employee",
    ): ExecutionContext {
      const mockReq = {
        membership: {
          role: {
            name: roleName,
          },
        },
      };

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([permission]);

      return {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;
    }

    test("OWNER has access to all 22 closed permissions without exception", async () => {
      expect(PERMISSION_CODES.length).toBe(22);

      for (const code of PERMISSION_CODES) {
        const ctx = createMockContext(code, "owner");
        const allowed = await guard.canActivate(ctx);
        expect(allowed).toBe(true);
      }
    });

    test("ADMIN has access to exactly 19 permissions and is rejected with 403 on 3 privileged permissions", async () => {
      const forbiddenForAdmin: PermissionCode[] = [
        "billing.manage",
        "business.delete",
        "usage.read",
      ];
      const allowedForAdmin = PERMISSION_CODES.filter((p) => !forbiddenForAdmin.includes(p));

      expect(allowedForAdmin.length).toBe(19);

      for (const code of allowedForAdmin) {
        const ctx = createMockContext(code, "admin");
        const allowed = await guard.canActivate(ctx);
        expect(allowed).toBe(true);
      }

      for (const code of forbiddenForAdmin) {
        const ctx = createMockContext(code, "admin");
        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      }
    });

    test("EMPLOYEE has access to only 5 allowed permissions and is rejected with 403 on all other 17 permissions", async () => {
      const allowedForEmployee: PermissionCode[] = [
        "inbox.read",
        "inbox.write",
        "orders.write",
        "customers.write",
        "analytics.read",
      ];
      const forbiddenForEmployee = PERMISSION_CODES.filter((p) => !allowedForEmployee.includes(p));

      expect(allowedForEmployee.length).toBe(5);
      expect(forbiddenForEmployee.length).toBe(17);

      for (const code of allowedForEmployee) {
        const ctx = createMockContext(code, "employee");
        const allowed = await guard.canActivate(ctx);
        expect(allowed).toBe(true);
      }

      for (const code of forbiddenForEmployee) {
        const ctx = createMockContext(code, "employee");
        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      }
    });
  });

  describe("2. Multi-Tenancy & Tenant IDOR Defense (13 §2.4 / 17 §4)", () => {
    test("Rejects cross-tenant attack where User B sends Business A header", async () => {
      const { prisma, state } = createMockPrisma();
      const guard = new TenantGuard(prisma);

      const userAId = "user-a-id";
      const userBId = "user-b-id";
      const bizAId = "biz-a-id";
      const bizBId = "biz-b-id";

      state.users.push(
        {
          id: userAId,
          email: "a@test.com",
          name: "User A",
          password_hash: null,
          email_verified_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: userBId,
          email: "b@test.com",
          name: "User B",
          password_hash: null,
          email_verified_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      );

      state.businesses.push(
        {
          id: bizAId,
          name: "Alpha Store",
          currency: "TND",
          timezone: "Africa/Tunis",
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
        {
          id: bizBId,
          name: "Beta Store",
          currency: "TND",
          timezone: "Africa/Tunis",
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
      );

      state.businessMembers.push(
        {
          id: "mem-a",
          business_id: bizAId,
          user_id: userAId,
          role_id: "role-owner-id",
          removed_at: null,
          created_at: new Date(),
        },
        {
          id: "mem-b",
          business_id: bizBId,
          user_id: userBId,
          role_id: "role-owner-id",
          removed_at: null,
          created_at: new Date(),
        },
      );

      // User B attempts to access Business A
      const tokenB = generateTestAccessToken(userBId);
      const req: any = {
        headers: {
          authorization: `Bearer ${tokenB}`,
          "x-business-id": bizAId,
        },
        params: {},
      };

      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    test("Rejects request when URL param :id mismatches X-Business-Id header on /businesses/:id", async () => {
      const { prisma, state } = createMockPrisma();
      const guard = new TenantGuard(prisma);

      const userId = "user-multi-id";
      const bizA = "biz-a-id";
      const bizB = "biz-b-id";

      state.users.push({
        id: userId,
        email: "multi@test.com",
        name: "Multi",
        password_hash: null,
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      state.businesses.push(
        {
          id: bizA,
          name: "Store A",
          currency: "TND",
          timezone: "Africa/Tunis",
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
        {
          id: bizB,
          name: "Store B",
          currency: "TND",
          timezone: "Africa/Tunis",
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
      );
      state.businessMembers.push(
        {
          id: "m1",
          business_id: bizA,
          user_id: userId,
          role_id: "role-owner-id",
          removed_at: null,
          created_at: new Date(),
        },
        {
          id: "m2",
          business_id: bizB,
          user_id: userId,
          role_id: "role-owner-id",
          removed_at: null,
          created_at: new Date(),
        },
      );

      const token = generateTestAccessToken(userId);
      const req: any = {
        headers: {
          authorization: `Bearer ${token}`,
          "x-business-id": bizA,
        },
        url: `/businesses/${bizB}`,
        params: { id: bizB },
      };

      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    test("Rejects soft-deleted business with 403 Forbidden without leaking existence", async () => {
      const { prisma, state } = createMockPrisma();
      const guard = new TenantGuard(prisma);

      const userId = "user-deleted-biz";
      const bizId = "biz-deleted";

      state.users.push({
        id: userId,
        email: "del@test.com",
        name: "Deleted Biz User",
        password_hash: null,
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      state.businesses.push({
        id: bizId,
        name: "Closed Store",
        currency: "TND",
        timezone: "Africa/Tunis",
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: new Date(),
      });
      state.businessMembers.push({
        id: "m-del",
        business_id: bizId,
        user_id: userId,
        role_id: "role-owner-id",
        removed_at: null,
        created_at: new Date(),
      });

      const token = generateTestAccessToken(userId);
      const req: any = {
        headers: {
          authorization: `Bearer ${token}`,
          "x-business-id": bizId,
        },
        params: {},
      };

      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("3. JWT Cryptographic & Tamper Resistance (17 §3.2)", () => {
    test("Rejects token with altered sub claim (signature mismatch)", async () => {
      const { prisma } = createMockPrisma();
      const guard = new TenantGuard(prisma);

      const validToken = generateTestAccessToken("user-victim-id");
      const parts = validToken.split(".");

      // Tamper payload to attacker sub
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sub: "user-attacker-id",
          typ: "access",
          iss: "aisales",
          aud: "access",
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ).toString("base64url");

      const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const req: any = {
        headers: { authorization: `Bearer ${forgedToken}` },
        params: {},
      };

      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    test("Rejects token with alg: none attack", async () => {
      const { prisma } = createMockPrisma();
      const guard = new TenantGuard(prisma);

      const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
        "base64url",
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: "attacker",
          typ: "access",
          iss: "aisales",
          aud: "access",
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ).toString("base64url");

      const noneToken = `${noneHeader}.${payload}.`;

      const req: any = {
        headers: { authorization: `Bearer ${noneToken}` },
        params: {},
      };

      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    test("Rejects expired access token (past 30s clock skew window)", async () => {
      const { prisma } = createMockPrisma();
      const guard = new TenantGuard(prisma);

      const now = Math.floor(Date.now() / 1000);
      const expiredToken = signJwt(
        { sub: "expired-user", typ: "access", exp: now - 60 },
        TEST_BETTER_AUTH_SECRET,
        { expiresInSeconds: -60, issuer: "aisales", audience: "access" },
      );

      const req: any = {
        headers: { authorization: `Bearer ${expiredToken}` },
        params: {},
      };

      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("4. Timing Attack Resistance on Login (17 §3.1)", () => {
    test("Returns identical 401 error message for non-existent email and wrong password", async () => {
      const { prisma, state } = createMockPrisma();
      const authService = new AuthService(prisma);

      const hash = await hashPassword("CorrectPassword123!");
      state.users.push({
        id: "user-real-id",
        email: "real@test.com",
        name: "Real User",
        password_hash: hash,
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 1. Non-existent email
      let errorNonExistent: any;
      try {
        await authService.login({ email: "ghost@test.com", password: "AnyPassword123!" });
      } catch (err: any) {
        errorNonExistent = err;
      }

      // 2. Existing email with invalid password
      let errorWrongPass: any;
      try {
        await authService.login({ email: "real@test.com", password: "WrongPassword123!" });
      } catch (err: any) {
        errorWrongPass = err;
      }

      expect(errorNonExistent).toBeInstanceOf(UnauthorizedException);
      expect(errorWrongPass).toBeInstanceOf(UnauthorizedException);
      expect(errorNonExistent.getResponse()).toEqual(errorWrongPass.getResponse());
      expect(errorNonExistent.getResponse()).toEqual({
        error: {
          code: "unauthorized",
          message: "Invalid email or password",
        },
      });
    });
  });

  describe("5. Refresh Token Theft Detection & Family Revocation (17 §3.4)", () => {
    test("Replaying a revoked refresh token revokes entire family", async () => {
      const { prisma, state } = createMockPrisma();
      const authService = new AuthService(prisma);

      const userId = "victim-user";
      const familyId = "family-123";

      state.users.push({
        id: userId,
        email: "victim@test.com",
        name: "Victim",
        password_hash: "hash",
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Token 1: already used/revoked
      const token1Jwt = signJwt(
        { sub: userId, typ: "refresh", fam: familyId },
        TEST_BETTER_AUTH_SECRET,
        { expiresInSeconds: 86400 * 14, issuer: "aisales", audience: "refresh" },
      );
      const token1Hash = crypto.createHash("sha256").update(token1Jwt).digest("hex");

      // Token 2: current active generation in same family
      const token2Hash = crypto.createHash("sha256").update("token-2").digest("hex");

      state.refreshTokens.push(
        {
          id: "tok-1",
          user_id: userId,
          family_id: familyId,
          token_hash: token1Hash,
          revoked_at: new Date(Date.now() - 10000), // revoked
          expires_at: new Date(Date.now() + 86400 * 14 * 1000),
          created_at: new Date(),
        },
        {
          id: "tok-2",
          user_id: userId,
          family_id: familyId,
          token_hash: token2Hash,
          revoked_at: null, // active
          expires_at: new Date(Date.now() + 86400 * 14 * 1000),
          created_at: new Date(),
        },
      );

      // Attacker replays Token 1
      await expect(authService.refresh(token1Jwt)).rejects.toThrow(UnauthorizedException);

      // Entire family must now be revoked
      const activeTokensInFamily = state.refreshTokens.filter(
        (t) => t.family_id === familyId && t.revoked_at === null,
      );
      expect(activeTokensInFamily.length).toBe(0);
    });
  });
});
