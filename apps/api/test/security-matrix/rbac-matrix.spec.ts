import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { PermissionCode } from "../../src/platform/security/permissions";
import { PERMISSION_CODES, roleHasPermission } from "../../src/platform/security/permissions";
import { PermissionsGuard } from "../../src/platform/security/permissions.guard";
import {
  createMockSecurityContext,
  createSecurityPrismaMock,
  TENANT_A_ID,
  USER_AGENT_A,
  USER_ADMIN_A,
  USER_OWNER_A,
} from "./fixtures";

describe("Security Matrix: Strict Role-Based Access Control (RBAC) Enforcement", () => {
  let reflector: Reflector;
  let permissionsGuard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    const { prismaMock } = createSecurityPrismaMock();
    permissionsGuard = new PermissionsGuard(reflector, prismaMock as never);
  });

  describe("1. Closed 22-Permission Grid Boundary Verification", () => {
    it("Verifies total count of closed system permissions is exactly 22", () => {
      expect(PERMISSION_CODES.length).toBe(22);
    });

    it("OWNER: Granted all 22 system permissions with zero exceptions", async () => {
      for (const permission of PERMISSION_CODES) {
        expect(roleHasPermission("owner", permission)).toBe(true);

        const { context } = createMockSecurityContext({
          user: USER_OWNER_A,
          role: "owner",
          requiredPermissions: [permission],
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([permission]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      }
    });

    it("MANAGER / ADMIN: Granted exactly 19 permissions and blocked on 3 owner-exclusive permissions", async () => {
      const ownerOnlyPermissions: PermissionCode[] = [
        "billing.manage",
        "business.delete",
        "usage.read",
      ];
      const adminPermissions = PERMISSION_CODES.filter((p) => !ownerOnlyPermissions.includes(p));

      expect(adminPermissions.length).toBe(19);

      // 19 Allowed permissions
      for (const permission of adminPermissions) {
        expect(roleHasPermission("admin", permission)).toBe(true);

        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          requiredPermissions: [permission],
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([permission]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      }

      // 3 Forbidden permissions
      for (const permission of ownerOnlyPermissions) {
        expect(roleHasPermission("admin", permission)).toBe(false);

        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          requiredPermissions: [permission],
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([permission]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      }
    });

    it("AGENT / EMPLOYEE: Granted exactly 5 permissions and blocked on remaining 17 permissions", async () => {
      const allowedAgentPermissions: PermissionCode[] = [
        "analytics.read",
        "inbox.read",
        "inbox.write",
        "orders.write",
        "customers.write",
      ];
      const forbiddenAgentPermissions = PERMISSION_CODES.filter(
        (p) => !allowedAgentPermissions.includes(p),
      );

      expect(allowedAgentPermissions.length).toBe(5);
      expect(forbiddenAgentPermissions.length).toBe(17);

      // 5 Allowed permissions
      for (const permission of allowedAgentPermissions) {
        expect(roleHasPermission("employee", permission)).toBe(true);

        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          requiredPermissions: [permission],
          mfaVerified: false, // Agents do not require MFA
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([permission]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      }

      // 17 Forbidden permissions
      for (const permission of forbiddenAgentPermissions) {
        expect(roleHasPermission("employee", permission)).toBe(false);

        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          requiredPermissions: [permission],
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([permission]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      }
    });
  });

  describe("2. Concrete Functional RBAC Matrix Scenarios", () => {
    describe("Agent / Employee Restrictions", () => {
      it("AGENT RESTRICTION 1: Agents CANNOT modify business billing -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/billing",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["billing.manage"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("AGENT RESTRICTION 2: Agents CANNOT invite users or manage members -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: `/api/v1/businesses/${TENANT_A_ID}/invitations`,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["members.manage"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("AGENT RESTRICTION 3: Agents CANNOT alter AI system prompt rules -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/ai/prompts",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["ai.configure"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("AGENT RESTRICTION 4: Agents CANNOT alter business rules -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/business-rules",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["rules.write"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("AGENT RESTRICTION 5: Agents CANNOT access AI playground simulation -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/ai/playground/simulate",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["ai.playground"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("AGENT RESTRICTION 6: Agents CANNOT delete business -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: `/api/v1/businesses/${TENANT_A_ID}`,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["business.delete"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("AGENT RESTRICTION 7: Agents CANNOT read billing usage -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/billing/usage",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["usage.read"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("AGENT CAPABILITY 1: Agents CAN view conversations in inbox -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/conversations",
          mfaVerified: false,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["inbox.read"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });

      it("AGENT CAPABILITY 2: Agents CAN reply to customers / send messages -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/conversations/conv-1/messages",
          mfaVerified: false,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["inbox.write"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });

      it("AGENT CAPABILITY 3: Agents CAN propose and edit order drafts -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/orders",
          mfaVerified: false,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["orders.write"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });

      it("AGENT CAPABILITY 4: Agents CAN view analytics KPIs -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_AGENT_A,
          role: "employee",
          path: "/api/v1/analytics/kpis",
          mfaVerified: false,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["analytics.read"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });
    });

    describe("Manager / Admin Capabilities and Boundaries", () => {
      it("MANAGER CAPABILITY 1: Managers CAN edit catalog items -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          path: "/api/v1/products",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["catalog.write"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });

      it("MANAGER CAPABILITY 2: Managers CAN review team activity and audit logs -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          path: "/api/v1/audit",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["audit.read"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });

      it("MANAGER CAPABILITY 3: Managers CAN manage members and invite teammates -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          path: `/api/v1/businesses/${TENANT_A_ID}/invitations`,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["members.manage"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });

      it("MANAGER CAPABILITY 4: Managers CAN approve handoffs and take over conversations -> Allowed", async () => {
        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          path: "/api/v1/messages/msg-1/approve",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["inbox.write"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });

      it("MANAGER BOUNDARY: Managers CANNOT access billing management -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          path: "/api/v1/billing",
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["billing.manage"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it("MANAGER BOUNDARY: Managers CANNOT delete business -> 403 Forbidden", async () => {
        const { context } = createMockSecurityContext({
          user: USER_ADMIN_A,
          role: "admin",
          path: `/api/v1/businesses/${TENANT_A_ID}`,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["business.delete"]);
        await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });
    });

    describe("3. Multi-Factor Authentication (MFA) Defense-in-Depth Policy", () => {
      it("Rejects privileged role (Owner) accessing privileged permission if session is not MFA verified in production", async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        try {
          const { context } = createMockSecurityContext({
            user: { ...USER_OWNER_A, twoFactorEnabled: true },
            role: "owner",
            mfaVerified: false, // Session lacks MFA verification!
          });

          jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["members.manage"]);
          await expect(permissionsGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
        } finally {
          process.env.NODE_ENV = originalEnv;
        }
      });

      it("Allows ordinary Employee agent to access permitted routes without requiring MFA", async () => {
        const { context } = createMockSecurityContext({
          user: { ...USER_AGENT_A, twoFactorEnabled: false },
          role: "employee",
          mfaVerified: false,
        });

        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["inbox.read"]);
        const allowed = await permissionsGuard.canActivate(context);
        expect(allowed).toBe(true);
      });
    });
  });
});
