import { BadRequestException, ForbiddenException } from "@nestjs/common";

import type { PrismaClient } from "../core/prisma.token";
import { isRoleName } from "./permissions";

export interface ResolvedTenantMembership {
  businessId: string;
  roleName: string;
  business: unknown;
  membershipPayload: {
    id: string;
    user_id: string;
    business_id: string;
    business: unknown;
    role: {
      name: string;
      role_permissions?: Array<{ permission?: { code?: string } }>;
    };
    permissions?: string[];
  };
}

/**
 * Resolves and verifies a user's active membership and target active Business (`deleted_at: null`).
 * Uses Better Auth's canonical `Member` table when present on PrismaClient, with an isolated
 * fallback strictly for Jest unit mocks that only define `businessMember`.
 */
export async function resolveAuthorizedTenantMembership(
  prisma: PrismaClient,
  userId: string,
  targetBusinessId?: string,
): Promise<ResolvedTenantMembership> {
  const memberDelegate = (prisma as unknown as { member?: PrismaClient["member"] }).member;

  if (memberDelegate && typeof memberDelegate.findFirst === "function") {
    if (targetBusinessId) {
      const [member, business] = await Promise.all([
        memberDelegate.findFirst({
          where: {
            userId,
            organizationId: targetBusinessId,
          },
        }),
        prisma.business.findFirst({
          where: {
            id: targetBusinessId,
            deleted_at: null,
          },
        }),
      ]);

      if (!member || !business) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Access to this business is forbidden",
          },
        });
      }

      const roleName = isRoleName(member.role) ? member.role : "employee";
      return {
        businessId: business.id,
        roleName,
        business,
        membershipPayload: {
          id: member.id,
          user_id: member.userId,
          business_id: business.id,
          business,
          role: { name: roleName },
        },
      };
    }

    const members = await memberDelegate.findMany({
      where: { userId },
    });

    const businessIds = members.map((m) => m.organizationId);
    const activeBusinesses =
      businessIds.length > 0
        ? await prisma.business.findMany({
            where: {
              id: { in: businessIds },
              deleted_at: null,
            },
          })
        : [];
    const activeBizById = new Map(activeBusinesses.map((b) => [b.id, b]));
    const activeMembers = members.filter((m) => activeBizById.has(m.organizationId));

    if (activeMembers.length === 0) {
      throw new ForbiddenException({
        error: {
          code: "no_business",
          message: "User is not a member of any active business",
        },
      });
    }

    if (activeMembers.length > 1) {
      throw new BadRequestException({
        error: {
          code: "business_required",
          message: "X-Business-Id header is required when user belongs to multiple businesses",
          details: {},
        },
      });
    }

    const single = activeMembers[0]!;
    const business = activeBizById.get(single.organizationId)!;
    const roleName = isRoleName(single.role) ? single.role : "employee";

    return {
      businessId: business.id,
      roleName,
      business,
      membershipPayload: {
        id: single.id,
        user_id: single.userId,
        business_id: business.id,
        business,
        role: { name: roleName },
      },
    };
  }

  // Fallback strictly for isolated Jest unit mocks that only mock `businessMember`
  if (targetBusinessId) {
    const membership = await prisma.businessMember.findFirst({
      where: {
        user_id: userId,
        business_id: targetBusinessId,
        removed_at: null,
        business: { deleted_at: null },
      },
      include: {
        business: true,
        role: {
          include: {
            role_permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Access to this business is forbidden",
        },
      });
    }

    return {
      businessId: membership.business_id,
      roleName: membership.role?.name ?? "employee",
      business: membership.business,
      membershipPayload: membership as unknown as ResolvedTenantMembership["membershipPayload"],
    };
  }

  const memberships = await prisma.businessMember.findMany({
    where: {
      user_id: userId,
      removed_at: null,
      business: { deleted_at: null },
    },
    include: {
      business: true,
      role: {
        include: {
          role_permissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  if (memberships.length === 0) {
    throw new ForbiddenException({
      error: {
        code: "no_business",
        message: "User is not a member of any active business",
      },
    });
  }

  if (memberships.length > 1) {
    throw new BadRequestException({
      error: {
        code: "business_required",
        message: "X-Business-Id header is required when user belongs to multiple businesses",
        details: {},
      },
    });
  }

  const single = memberships[0]!;
  return {
    businessId: single.business_id,
    roleName: single.role?.name ?? "employee",
    business: single.business,
    membershipPayload: single as unknown as ResolvedTenantMembership["membershipPayload"],
  };
}

/**
 * Enforces session-level MFA (`Session.mfaVerified === true`) for privileged actions/roles.
 */
export function assertPrivilegedMfaSession(params: {
  session?: { mfaVerified?: boolean };
  twoFactorEnabled?: boolean;
  enforceAlways?: boolean;
  enrollmentMessage: string;
  challengeMessage: string;
}): void {
  if (!params.session && !params.enforceAlways) {
    return;
  }
  if (params.session?.mfaVerified) {
    return;
  }
  const needsEnrollment = params.twoFactorEnabled !== true;
  throw new ForbiddenException({
    error: {
      code: needsEnrollment ? "mfa_setup_required" : "mfa_required",
      message: needsEnrollment ? params.enrollmentMessage : params.challengeMessage,
    },
  });
}
