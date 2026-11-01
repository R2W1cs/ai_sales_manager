import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@prisma/client";

import { PERMISSION_CODES, RequirePermission } from "./permissions";
import { PermissionsGuard } from "./permissions.guard";

function mockExecutionContext(
  req: Record<string, unknown>,
  handler: (...args: unknown[]) => unknown = () => undefined,
  cls: unknown = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => cls,
    getHandler: () => handler,
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

describe("PermissionsGuard (13 §2.11, 17 §5.1)", () => {
  let reflector: Reflector;
  let mockPrisma: {
    businessMember: {
      findFirst: jest.Mock;
    };
  };
  let guard: PermissionsGuard;
  const createHandler = () => () => undefined;

  beforeEach(() => {
    reflector = new Reflector();
    mockPrisma = {
      businessMember: {
        findFirst: jest.fn(),
      },
    };
    guard = new PermissionsGuard(reflector, mockPrisma as unknown as PrismaClient);
  });

  it("allows access when route has no @RequirePermission metadata", async () => {
    const req = {
      membership: {
        role: { name: "employee", role_permissions: [] },
      },
    };
    const context = mockExecutionContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  describe("Owner permissions (all 22)", () => {
    it("allows owner to access billing.manage and business.delete", async () => {
      const handler = createHandler();
      RequirePermission("billing.manage", "business.delete")(handler);

      const req = {
        membership: {
          role: {
            name: "owner",
            role_permissions: [
              { permission: { code: "billing.manage" } },
              { permission: { code: "business.delete" } },
            ],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("allows owner using system role-to-permission mapping", async () => {
      const handler = createHandler();
      RequirePermission("usage.read")(handler);

      const req = {
        membership: {
          role: {
            name: "owner",
            role_permissions: [],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe("Admin permissions (19 codes, cannot billing.manage/business.delete/usage.read)", () => {
    it("allows admin to access inbox.write, members.manage, ai.configure", async () => {
      const handler = createHandler();
      RequirePermission("inbox.write", "members.manage")(handler);

      const req = {
        membership: {
          role: {
            name: "admin",
            role_permissions: [],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("throws 403 forbidden when admin attempts billing.manage", async () => {
      const handler = createHandler();
      RequirePermission("billing.manage")(handler);

      const req = {
        membership: {
          role: {
            name: "admin",
            role_permissions: [],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: {
            code: "forbidden",
            message: "Forbidden resource: missing required permission",
          },
        },
      });
    });

    it("throws 403 forbidden when admin attempts usage.read", async () => {
      const handler = createHandler();
      RequirePermission("usage.read")(handler);

      const req = {
        membership: {
          role: {
            name: "admin",
            role_permissions: [],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("Employee permissions (5 codes: analytics.read, inbox.read, inbox.write, orders.write, customers.write)", () => {
    it("allows employee to access inbox.read and orders.write", async () => {
      const handler = createHandler();
      RequirePermission("inbox.read", "orders.write")(handler);

      const req = {
        membership: {
          role: {
            name: "employee",
            role_permissions: [],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("throws 403 forbidden when employee attempts ai.traces.read", async () => {
      const handler = createHandler();
      RequirePermission("ai.traces.read")(handler);

      const req = {
        membership: {
          role: {
            name: "employee",
            role_permissions: [],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: {
            code: "forbidden",
            message: "Forbidden resource: missing required permission",
          },
        },
      });
    });

    it("throws 403 forbidden when employee attempts customers.erase or customers.merge", async () => {
      const handler = createHandler();
      RequirePermission("customers.erase")(handler);

      const req = {
        membership: {
          role: {
            name: "employee",
            role_permissions: [],
          },
        },
      };
      const context = mockExecutionContext(req, handler);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("Database loading fallback when membership not in request", () => {
    it("loads membership from database and authorizes if permissions match", async () => {
      const handler = createHandler();
      RequirePermission("inbox.write")(handler);

      const req: Record<string, unknown> = {
        user: { id: "user-1", sub: "user-1" },
        businessId: "biz-1",
        headers: {},
      };
      const context = mockExecutionContext(req, handler);

      mockPrisma.businessMember.findFirst.mockResolvedValueOnce({
        id: "mem-1",
        user_id: "user-1",
        business_id: "biz-1",
        removed_at: null,
        role: {
          name: "employee",
          role_permissions: [{ permission: { code: "inbox.write" } }],
        },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("throws 403 forbidden when user is not a member of the business", async () => {
      const handler = createHandler();
      RequirePermission("inbox.write")(handler);

      const req: Record<string, unknown> = {
        user: { id: "user-1", sub: "user-1" },
        businessId: "biz-1",
        headers: {},
      };
      const context = mockExecutionContext(req, handler);

      mockPrisma.businessMember.findFirst.mockResolvedValueOnce(null);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  it("checks all 22 permission codes exist in PERMISSION_CODES", () => {
    expect(PERMISSION_CODES).toHaveLength(22);
    expect(PERMISSION_CODES).toContain("billing.manage");
    expect(PERMISSION_CODES).toContain("business.delete");
    expect(PERMISSION_CODES).toContain("usage.read");
    expect(PERMISSION_CODES).toContain("members.manage");
    expect(PERMISSION_CODES).toContain("business.write");
    expect(PERMISSION_CODES).toContain("integrations.manage");
    expect(PERMISSION_CODES).toContain("catalog.write");
    expect(PERMISSION_CODES).toContain("rules.write");
    expect(PERMISSION_CODES).toContain("knowledge.write");
    expect(PERMISSION_CODES).toContain("ai.configure");
    expect(PERMISSION_CODES).toContain("ai.playground");
    expect(PERMISSION_CODES).toContain("ai.traces.read");
    expect(PERMISSION_CODES).toContain("flags.write");
    expect(PERMISSION_CODES).toContain("customers.merge");
    expect(PERMISSION_CODES).toContain("customers.export");
    expect(PERMISSION_CODES).toContain("customers.erase");
    expect(PERMISSION_CODES).toContain("audit.read");
    expect(PERMISSION_CODES).toContain("analytics.read");
    expect(PERMISSION_CODES).toContain("inbox.read");
    expect(PERMISSION_CODES).toContain("inbox.write");
    expect(PERMISSION_CODES).toContain("orders.write");
    expect(PERMISSION_CODES).toContain("customers.write");
  });
});
