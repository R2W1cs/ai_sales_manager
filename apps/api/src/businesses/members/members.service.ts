import * as crypto from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import type { InviteMemberDto, InvitationResponse } from "../dto/invite-member.dto";
import { InviteMemberSchema } from "../dto/invite-member.dto";
import type { MemberResponse, UpdateMemberRoleDto } from "../dto/update-member-role.dto";
import { UpdateMemberRoleSchema } from "../dto/update-member-role.dto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

type MemberRole = "owner" | "admin" | "employee";

function extractRoleName(
  role?: string | { name?: string } | null,
  fallbackRel?: { name?: string } | null,
  defaultRole: MemberRole = "employee",
): MemberRole {
  if (typeof role === "string") {
    return role as MemberRole;
  }
  if (
    typeof role === "object" &&
    role !== null &&
    "name" in role &&
    typeof role.name === "string"
  ) {
    return role.name as MemberRole;
  }
  if (fallbackRel?.name) {
    return fallbackRel.name as MemberRole;
  }
  return defaultRole;
}

@Injectable()
export class MembersService {
  private readonly prisma: PrismaClient;
  private readonly realtimeGateway?: RealtimeGateway;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() realtimeGateway?: RealtimeGateway,
  ) {
    this.prisma = prismaClient ?? prisma;
    this.realtimeGateway = realtimeGateway;
  }

  /**
   * 13 §5 GET /api/v1/businesses/:id/members
   * List active members (removed_at IS NULL).
   */
  async listMembers(businessId: string): Promise<MemberResponse[]> {
    const members = await this.prisma.businessMember.findMany({
      where: {
        business_id: businessId,
        removed_at: null,
      },
      include: {
        user: true,
        role: true,
      },
      orderBy: {
        joined_at: "asc",
      },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.user_id,
      businessId: m.business_id,
      name: m.user.name,
      email: m.user.email,
      role: m.role.name,
      joinedAt: m.joined_at,
      invitedAt: m.invited_at,
      lastActiveAt: m.last_active_at,
    }));
  }

  /**
   * 13 §5 GET /api/v1/businesses/:id/invitations
   * List pending invitations (accepted_at IS NULL and expires_at > NOW).
   */
  async listPendingInvitations(businessId: string): Promise<InvitationResponse[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        OR: [{ business_id: businessId }, { organizationId: businessId }],
        accepted_at: null,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      include: {
        role_rel: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      businessId: inv.business_id ?? inv.organizationId,
      email: inv.email,
      role: extractRoleName(inv.role, inv.role_rel),
      invitedByUserId: inv.invited_by_user_id ?? inv.inviterId,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  /**
   * 13 §5 POST /api/v1/businesses/:id/invitations
   * Create an invitation token for a teammate with seat quota check.
   */
  async createInvitation(
    businessId: string,
    invitedByUserId: string,
    rawDto: InviteMemberDto,
    idempotencyKey?: string,
  ): Promise<InvitationResponse> {
    const parseResult = InviteMemberSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const dto = parseResult.data;
    const normalizedEmail = dto.email.toLowerCase();
    const requestHash = crypto.createHash("sha256").update(JSON.stringify(rawDto)).digest("hex");

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findFirst({
        where: {
          business_id: businessId,
          key: idempotencyKey,
        },
      });

      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException({
            error: {
              code: "idempotency_key_conflict",
              message: "Idempotency key already used with different payload",
            },
          });
        }
        if (existing.response_body) {
          return existing.response_body as unknown as InvitationResponse;
        }
      }
    }

    // Check if user is already an active member of this business
    const existingMember = await this.prisma.businessMember.findFirst({
      where: {
        business_id: businessId,
        removed_at: null,
        user: {
          email: normalizedEmail,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException({
        error: {
          code: "conflict",
          message: "User is already an active member of this business",
        },
      });
    }

    // Seat limit quota checks & plan limits (concurrent reads)
    const [activeMembersCount, pendingInvitesCount, subscription] = await Promise.all([
      this.prisma.businessMember.count({
        where: {
          business_id: businessId,
          removed_at: null,
        },
      }),
      this.prisma.invitation.count({
        where: {
          business_id: businessId,
          accepted_at: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
      this.prisma.subscription.findFirst({
        where: {
          business_id: businessId,
          status: "active",
        },
        include: {
          plan: true,
        },
        orderBy: {
          created_at: "desc",
        },
      }) as Promise<{ plan?: { limits?: unknown } } | null>,
    ]);

    let seatLimit = 1; // Default starter limit
    if (
      subscription?.plan?.limits &&
      typeof subscription.plan.limits === "object" &&
      !Array.isArray(subscription.plan.limits)
    ) {
      const limitsObj = subscription.plan.limits as Record<string, unknown>;
      if (typeof limitsObj.seats === "number") {
        seatLimit = limitsObj.seats;
      }
    }

    // If active members + pending invites >= seat limit, throw quota_exceeded
    if (activeMembersCount + pendingInvitesCount >= seatLimit) {
      throw new ForbiddenException({
        error: {
          code: "quota_exceeded",
          message: `Workspace seat limit of ${seatLimit} reached. Upgrade your plan to invite more members.`,
          details: {
            metric: "seats",
            limit: seatLimit,
            current: activeMembersCount + pendingInvitesCount,
          },
        },
      });
    }

    // Look up target role (admin or employee)
    const targetRoleName = dto.role;
    const role = await this.prisma.role.findFirst({
      where: {
        name: targetRoleName,
        business_id: null,
      },
    });

    if (!role) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Role ${targetRoleName} not found`,
        },
      });
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Ensure Organization exists for business if needed
    const existingOrg = await this.prisma.organization.findUnique({
      where: { id: businessId },
    });
    if (!existingOrg) {
      const biz = await this.prisma.business.findUnique({ where: { id: businessId } });
      await this.prisma.organization.create({
        data: {
          id: businessId,
          name: biz?.name ?? "Business",
        },
      });
    }

    const invitation = await this.prisma.invitation.upsert({
      where: {
        business_id_email: {
          business_id: businessId,
          email: normalizedEmail,
        },
      },
      create: {
        organizationId: businessId,
        business_id: businessId,
        email: normalizedEmail,
        role: targetRoleName,
        role_id: role.id,
        inviterId: invitedByUserId,
        invited_by_user_id: invitedByUserId,
        token_hash: tokenHash,
        expiresAt: expiresAt,
        status: "pending",
      },
      update: {
        role_id: role.id,
        role: targetRoleName,
        invited_by_user_id: invitedByUserId,
        inviterId: invitedByUserId,
        token_hash: tokenHash,
        expiresAt: expiresAt,
        accepted_at: null,
        status: "pending",
      },
      include: {
        role_rel: true,
      },
    });

    const roleName = extractRoleName(invitation.role, invitation.role_rel, targetRoleName);

    const response: InvitationResponse = {
      id: invitation.id,
      businessId: invitation.business_id ?? invitation.organizationId,
      email: invitation.email,
      role: roleName,
      invitedByUserId: invitation.invited_by_user_id ?? invitation.inviterId,
      token,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };

    if (idempotencyKey) {
      const keyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.prisma.idempotencyKey.create({
        data: {
          business_id: businessId,
          key: idempotencyKey,
          request_hash: requestHash,
          response_status: 201,
          response_body: response as unknown as Prisma.InputJsonValue,
          expires_at: keyExpiresAt,
        },
      });
    }

    return response;
  }

  /**
   * 13 §5 DELETE /api/v1/businesses/:id/invitations/:inviteId
   * Revoke a pending invitation.
   */
  async revokeInvitation(businessId: string, inviteId: string): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: inviteId,
        business_id: businessId,
      },
    });

    if (!invitation) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Invitation not found",
        },
      });
    }

    await this.prisma.invitation.delete({
      where: { id: inviteId },
    });
  }

  /**
   * 13 §5 PATCH /api/v1/businesses/:id/members/:userId
   * Update a team member's role (admin | employee). Cannot demote the sole Owner.
   */
  async updateMemberRole(
    businessId: string,
    targetUserId: string,
    rawDto: UpdateMemberRoleDto,
  ): Promise<MemberResponse> {
    const parseResult = UpdateMemberRoleSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const dto = parseResult.data;

    const membership = await this.prisma.businessMember.findFirst({
      where: {
        business_id: businessId,
        user_id: targetUserId,
        removed_at: null,
      },
      include: {
        role: true,
        user: true,
      },
    });

    if (!membership) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Member not found in this business",
        },
      });
    }

    // Sole owner protection: if user is currently owner, demoting to admin/employee requires other active owners
    if (membership.role.name === "owner") {
      const activeOwnersCount = await this.prisma.businessMember.count({
        where: {
          business_id: businessId,
          removed_at: null,
          role: {
            name: "owner",
          },
        },
      });

      if (activeOwnersCount <= 1) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Cannot demote the sole owner of the business workspace",
          },
        });
      }
    }

    const newRole = await this.prisma.role.findFirst({
      where: {
        name: dto.role,
        business_id: null,
      },
    });

    if (!newRole) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Role ${dto.role} not found`,
        },
      });
    }

    const updated = await this.prisma.businessMember.update({
      where: {
        id: membership.id,
      },
      data: {
        role_id: newRole.id,
      },
      include: {
        role: true,
        user: true,
      },
    });

    await this.prisma.member.updateMany({
      where: {
        organizationId: businessId,
        userId: membership.user_id,
      },
      data: {
        role: dto.role,
      },
    });

    return {
      id: updated.id,
      userId: updated.user_id,
      businessId: updated.business_id,
      name: updated.user.name,
      email: updated.user.email,
      role: updated.role.name,
      joinedAt: updated.joined_at,
      invitedAt: updated.invited_at,
      lastActiveAt: updated.last_active_at,
    };
  }

  /**
   * 13 §5 DELETE /api/v1/businesses/:id/members/:userId
   * Remove a member from the workspace. Sets removed_at. Cannot remove the sole Owner.
   */
  async removeMember(businessId: string, targetUserId: string): Promise<void> {
    const membership = await this.prisma.businessMember.findFirst({
      where: {
        business_id: businessId,
        user_id: targetUserId,
        removed_at: null,
      },
      include: {
        role: true,
      },
    });

    if (!membership) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Member not found in this business",
        },
      });
    }

    // Sole owner protection
    if (membership.role.name === "owner") {
      const activeOwnersCount = await this.prisma.businessMember.count({
        where: {
          business_id: businessId,
          removed_at: null,
          role: {
            name: "owner",
          },
        },
      });

      if (activeOwnersCount <= 1) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Cannot remove the sole owner of the business workspace",
          },
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Soft remove membership
      await tx.businessMember.update({
        where: { id: membership.id },
        data: { removed_at: new Date() },
      });

      // 2. Remove Better Auth organization membership
      await tx.member.deleteMany({
        where: {
          organizationId: businessId,
          userId: targetUserId,
        },
      });

      // 3. Release active conversation assignments on this business
      await tx.conversationAssignment.updateMany({
        where: {
          business_id: businessId,
          user_id: targetUserId,
          status: "active",
        },
        data: {
          status: "released",
          released_at: new Date(),
        },
      });
    });

    if (this.realtimeGateway) {
      this.realtimeGateway.disconnectUserFromBusiness(businessId, targetUserId);
    }
  }
}
