import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { env } from "@app/shared/server";

import { prisma } from "../../lib/prisma";
import { InjectPrisma, type PrismaClient } from "../core/prisma.token";
import { assertPrivilegedMfaSession, resolveAuthorizedTenantMembership } from "./membership-lookup";
import type { PermissionCode } from "./permissions";
import { isPrivilegedRole, isRoleName, PERMISSIONS_KEY, ROLE_PERMISSIONS } from "./permissions";
import type { TenantRequest } from "./tenant.guard";

interface RolePermissionRecord {
  permission?: {
    code?: string;
  };
}

interface MemberRoleWithPermissions {
  name?: string;
  role_permissions?: RolePermissionRecord[];
}

interface MembershipWithRole {
  role?: MemberRoleWithPermissions;
  permissions?: string[];
  [key: string]: unknown;
}

const EMPLOYEE_PERMISSION_SET = new Set<string>(ROLE_PERMISSIONS.employee);

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
  ) {
    this.prisma = prismaClient ?? prisma;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionCode[] | PermissionCode | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions) {
      return true;
    }

    const requiredList = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    if (requiredList.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<TenantRequest>();

    // Resolve membership from request context or authoritative Better Auth Member table
    let membership = req.membership as MembershipWithRole | undefined;

    if (!membership) {
      const userId = req.user?.id ?? req.user?.sub;
      const headerBusinessId =
        typeof req.headers["x-business-id"] === "string"
          ? req.headers["x-business-id"].trim()
          : undefined;
      const businessId =
        req.businessId ?? req.tenantId ?? req.sessionBusinessId ?? headerBusinessId;

      if (!userId || !businessId) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Missing tenant or user context for permission check",
          },
        });
      }

      const resolved = await resolveAuthorizedTenantMembership(this.prisma, userId, businessId);
      membership = resolved.membershipPayload as MembershipWithRole;
      req.membership = membership;
      req.businessId = resolved.businessId;
      req.tenantId = resolved.businessId;
    }

    // Defense-in-depth: privileged roles or privileged permissions require an MFA-verified session
    const roleName = membership.role?.name;
    const requiresPrivilegedMfa =
      isPrivilegedRole(roleName) || requiredList.some((perm) => !EMPLOYEE_PERMISSION_SET.has(perm));

    if (requiresPrivilegedMfa) {
      assertPrivilegedMfaSession({
        session: req.session,
        twoFactorEnabled: req.user?.twoFactorEnabled,
        enforceAlways: env.NODE_ENV === "production",
        enrollmentMessage:
          "Two-factor authentication enrollment is required for privileged actions.",
        challengeMessage:
          "A verified two-factor authentication session is required for privileged actions.",
      });
    }

    // Extract granted permission codes
    const grantedPermissions = new Set<string>();

    if (Array.isArray(membership.permissions)) {
      for (const p of membership.permissions) {
        if (typeof p === "string") grantedPermissions.add(p);
      }
    }

    const rolePermissions = membership.role?.role_permissions;
    if (Array.isArray(rolePermissions)) {
      for (const rp of rolePermissions) {
        const code = rp.permission?.code;
        if (typeof code === "string") {
          grantedPermissions.add(code);
        }
      }
    }

    if (isRoleName(roleName)) {
      const standardCodes = ROLE_PERMISSIONS[roleName];
      for (const code of standardCodes) {
        grantedPermissions.add(code);
      }
    }

    const hasAll = requiredList.every((perm) => grantedPermissions.has(perm));

    if (!hasAll) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Forbidden resource: missing required permission",
        },
      });
    }

    return true;
  }
}
