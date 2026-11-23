import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import type { MembershipDto, SessionDto } from "@app/shared";

import { AuthThrottlerGuard, findAuthUserById, requireBetterAuthSession } from "../../auth";
import { prisma } from "../../lib/prisma";
import type { HttpRequest } from "../../platform/core/http";
import { isPrivilegedRole, isRoleName } from "../../platform/security/permissions";
import { MembersService } from "../members/members.service";

@Controller("api/v1")
export class WorkspacesController {
  constructor(private readonly membersService: MembersService) {}

  /**
   * Supported app bootstrap endpoint returning the authenticated Better Auth user,
   * session MFA status, and authoritative workspace memberships.
   */
  @Get("workspaces")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  async bootstrap(@Req() req: HttpRequest): Promise<SessionDto> {
    const session = await requireBetterAuthSession(req.headers);

    const userRecord = await findAuthUserById(session.user.id, prisma);

    if (!userRecord) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "User not found",
        },
      });
    }

    const members = await prisma.member.findMany({
      where: { userId: userRecord.id },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const businessIds = members.map((m) => m.organizationId);
    const activeBusinesses =
      businessIds.length > 0
        ? await prisma.business.findMany({
            where: { id: { in: businessIds }, deleted_at: null },
            select: { id: true, name: true },
          })
        : [];
    const activeBizById = new Map(activeBusinesses.map((b) => [b.id, b]));

    const memberships: MembershipDto[] = members
      .filter((m) => activeBizById.has(m.organizationId))
      .map((m) => ({
        businessId: m.organizationId,
        businessName: activeBizById.get(m.organizationId)?.name ?? m.organization.name,
        role: isRoleName(m.role) ? m.role : "employee",
        joinedAt: m.createdAt,
        lastActiveAt: null,
      }));

    const sessionObj = session.session as Record<string, unknown>;
    const mfaVerified = Boolean(sessionObj.mfaVerified);
    const hasPrivilegedRole =
      userRecord.platform_admin || memberships.some((m) => isPrivilegedRole(m.role));

    const mfaSetupRequired = hasPrivilegedRole && !userRecord.twoFactorEnabled;
    const mfaChallengeRequired =
      hasPrivilegedRole && Boolean(userRecord.twoFactorEnabled) && !mfaVerified;

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        emailVerified: userRecord.emailVerified,
        twoFactorEnabled: Boolean(userRecord.twoFactorEnabled),
        emailVerifiedAt: userRecord.email_verified_at,
        createdAt: userRecord.createdAt,
        platformAdmin: userRecord.platform_admin,
      },
      memberships,
      mfaVerified,
      mfaSetupRequired,
      mfaChallengeRequired,
      tokenType: "Bearer",
      expiresIn: 900,
    };
  }

  /**
   * Canonical invitation acceptance routes backed by MembersService + PostgreSQL advisory lock.
   */
  @Post("invitations/:invitationId/accept")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  async acceptInvitationCanonical(
    @Param("invitationId") invitationId: string,
    @Req() req: HttpRequest,
  ): Promise<{ businessId: string; role: string }> {
    return this.acceptInvitationForCurrentSession(invitationId, req);
  }

  @Post("workspaces/invitations/:invitationId/accept")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  async acceptInvitation(
    @Param("invitationId") invitationId: string,
    @Req() req: HttpRequest,
  ): Promise<{ businessId: string; role: string }> {
    return this.acceptInvitationForCurrentSession(invitationId, req);
  }

  private async acceptInvitationForCurrentSession(
    invitationId: string,
    req: HttpRequest,
  ): Promise<{ businessId: string; role: string }> {
    const session = await requireBetterAuthSession(
      req.headers,
      "Authentication required to accept invitation",
    );

    return this.membersService.acceptInvitationForSession({
      invitationId,
      userId: session.user.id,
      userEmail: session.user.email,
      emailVerified: Boolean(session.user.emailVerified),
      sessionId: session.session.id,
    });
  }
}
