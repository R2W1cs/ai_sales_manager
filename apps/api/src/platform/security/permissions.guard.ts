import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { prisma } from "../../lib/prisma";
import { InjectPrisma, type PrismaClient } from "../core/prisma.token";
import type { PermissionCode } from "./permissions";
import { isRoleName, PERMISSIONS_KEY, ROLE_PERMISSIONS } from "./permissions";
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

    // If no permission metadata attached, allow access
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

    // Resolve membership
    let membership = req.membership as MembershipWithRole | undefined;

    if (!membership) {
      const userId = req.user?.id ?? req.user?.sub;
      const headerBusinessId =
        typeof req.headers["x-business-id"] === "string"
          ? req.headers["x-business-id"].trim()
          : undefined;
      // Falls back to a client-supplied header only as a last resort; the
      // membership lookup below is what authorises it.
      const businessId =
        req.businessId ?? req.tenantId ?? req.sessionBusinessId ?? headerBusinessId;

      if (userId && businessId) {
        const dbMembership = await this.prisma.businessMember.findFirst({
          where: {
            user_id: userId,
            business_id: businessId,
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

        if (!dbMembership) {
          throw new ForbiddenException({
            error: {
              code: "forbidden",
              message: "Access to this business is forbidden",
            },
          });
        }

        membership = dbMembership;
        req.membership = dbMembership;
        req.businessId = dbMembership.business_id;
        req.tenantId = dbMembership.business_id;
      } else {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Missing tenant or user context for permission check",
          },
        });
      }
    }

    // Extract granted permission codes
    const grantedPermissions = new Set<string>();

    // 1. From explicit permissions array if present
    if (Array.isArray(membership.permissions)) {
      for (const p of membership.permissions) {
        if (typeof p === "string") grantedPermissions.add(p);
      }
    }

    // 2. From role_permissions relation
    const rolePermissions = membership.role?.role_permissions;
    if (Array.isArray(rolePermissions)) {
      for (const rp of rolePermissions) {
        const code = rp.permission?.code;
        if (typeof code === "string") {
          grantedPermissions.add(code);
        }
      }
    }

    // 3. Fallback to standard role mapping if role name is present
    const roleName = membership.role?.name;
    if (isRoleName(roleName)) {
      const standardCodes = ROLE_PERMISSIONS[roleName];
      for (const code of standardCodes) {
        grantedPermissions.add(code);
      }
    }

    // Verify all required permissions are present
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
