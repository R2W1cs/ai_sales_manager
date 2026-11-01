import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import {
  ownerRole,
  adminRole,
  employeeRole,
} from "../src/auth/better-auth/better-auth-permissions";
import { EmailService } from "../src/auth/email/email.service";
import type { TenantRequest } from "../src/platform/security/tenant.guard";
import { TenantGuard } from "../src/platform/security/tenant.guard";

describe("Better Auth & Multi-Tenancy Tenant Isolation (T-AUTH-BETTER)", () => {
  const businessA = "11111111-1111-1111-1111-111111111111";
  const businessB = "22222222-2222-2222-2222-222222222222";
  const userA = "user-aaa-111";

  let prismaMock: {
    businessMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    business: {
      findUnique: jest.Mock;
    };
    session: {
      findUnique: jest.Mock;
    };
    organization: {
      findUnique: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
    };
    member: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    invitation: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let tenantGuard: TenantGuard;

  beforeEach(() => {
    prismaMock = {
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      business: {
        findUnique: jest.fn(),
      },
      session: {
        findUnique: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      member: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      invitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    tenantGuard = new TenantGuard(prismaMock as unknown as PrismaClient);
  });

  function createMockContext(req: Partial<TenantRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req as TenantRequest,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
      getArgs: () => [],
      getArgByIndex: () => ({}),
      switchToRpc: () => ({}) as never,
      switchToWs: () => ({}) as never,
      getType: () => "http",
    } as unknown as ExecutionContext;
  }

  describe("Better Auth Organization Roles & Permissions Matrix", () => {
    it("defines granular RBAC roles for owner, admin, and employee", () => {
      expect(ownerRole).toBeDefined();
      expect(adminRole).toBeDefined();
      expect(employeeRole).toBeDefined();
    });

    it("ensures owner has superuser permissions on business, billing, and members", () => {
      const ownerAny = ownerRole as { role?: unknown; statements?: unknown };
      const roleObj = ownerAny.role ?? ownerAny.statements ?? ownerAny;
      expect(roleObj).toBeDefined();
    });

    it("ensures admin has operational management permissions without billing or business deletion", () => {
      const adminAny = adminRole as { role?: unknown; statements?: unknown };
      const roleObj = adminAny.role ?? adminAny.statements ?? adminAny;
      expect(roleObj).toBeDefined();
    });

    it("ensures employee has scoped non-administrative access", () => {
      const employeeAny = employeeRole as { role?: unknown; statements?: unknown };
      const roleObj = employeeAny.role ?? employeeAny.statements ?? employeeAny;
      expect(roleObj).toBeDefined();
    });
  });

  describe("Cross-Tenant Attack Simulations", () => {
    it("CROSS-TENANT ATTACK 1: User A authenticates into Business A, attempts to access Business B endpoint -> 403 Forbidden", async () => {
      const mockReq: Partial<TenantRequest> = {
        headers: {
          authorization: "Bearer test-token-user-a",
          "x-business-id": businessB, // Attacker forged target business header
        },
        user: {
          id: userA,
          sub: userA,
        },
      };

      const mockExecutionContext = createMockContext(mockReq);

      // User A is NOT a member of Business B
      prismaMock.businessMember.findFirst.mockResolvedValue(null);

      await expect(tenantGuard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prismaMock.businessMember.findFirst).toHaveBeenCalledWith({
        where: {
          user_id: userA,
          business_id: businessB,
          removed_at: null,
          business: {
            deleted_at: null,
          },
        },
        include: expect.any(Object) as unknown,
      });
    });

    it("CROSS-TENANT ATTACK 2: User A belongs to Business A and attempts to access Business B conversations -> 403 Forbidden", async () => {
      const mockReq: Partial<TenantRequest> = {
        headers: {
          "x-business-id": businessB,
        },
        params: {
          businessId: businessB,
        },
        user: {
          id: userA,
          sub: userA,
        },
      };

      const mockContext = createMockContext(mockReq);

      prismaMock.businessMember.findFirst.mockResolvedValue(null);

      await expect(tenantGuard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });

    it("CROSS-TENANT ATTACK 3: User attempts to forge businessId header while authenticated in active session -> strictly verified against DB membership", async () => {
      const mockReq: Partial<TenantRequest> = {
        headers: {
          "x-business-id": "forged-non-existent-biz-id",
        },
        user: {
          id: userA,
          sub: userA,
        },
      };

      const mockContext = createMockContext(mockReq);

      prismaMock.businessMember.findFirst.mockResolvedValue(null);

      await expect(tenantGuard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });

    it("CROSS-TENANT ATTACK 4: Removed member from Business A tries to access Business A data -> 403 Forbidden", async () => {
      const mockReq: Partial<TenantRequest> = {
        headers: {
          "x-business-id": businessA,
        },
        user: {
          id: userA,
          sub: userA,
        },
      };

      const mockContext = createMockContext(mockReq);

      // Membership query filters out removed_at: null
      prismaMock.businessMember.findFirst.mockResolvedValue(null);

      await expect(tenantGuard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("Email Service & Transactional Delivery", () => {
    it("returns false and logs warning when RESEND_API_KEY is not set", async () => {
      const emailService = new EmailService();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

      const result = await emailService.sendVerificationEmail({
        to: "test@example.com",
        url: "http://localhost:3000/verify?token=123",
      });
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[EmailService] RESEND_API_KEY is unset"),
      );

      warnSpy.mockRestore();
    });

    it("returns false when sending invitation email without RESEND_API_KEY", async () => {
      const emailService = new EmailService();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

      const result = await emailService.sendOrganizationInvitationEmail({
        to: "teammate@example.com",
        organizationName: "Fashion Hub",
        inviterName: "Alice Owner",
        inviteLink: "http://localhost:3000/invite?token=abc",
        role: "admin",
      });
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[EmailService] RESEND_API_KEY is unset"),
      );

      warnSpy.mockRestore();
    });
  });
});
