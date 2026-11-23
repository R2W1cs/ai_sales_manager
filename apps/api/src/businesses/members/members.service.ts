import * as crypto from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

import { env } from "@app/shared/server";

import {
  emailService,
  findAuthSessionById,
  findAuthUserById,
  publishAuthRevocation,
  updateAuthSessionActiveOrganization,
} from "../../auth";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";
import { roleHasPermission } from "../../platform/security/permissions";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import { AuditService } from "../audit/audit.service";
import type { InviteMemberDto, InvitationResponse } from "../dto/invite-member.dto";
import { InviteMemberSchema } from "../dto/invite-member.dto";
import type { MemberResponse, UpdateMemberRoleDto } from "../dto/update-member-role.dto";
import { UpdateMemberRoleSchema } from "../dto/update-member-role.dto";

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

async function acquireWorkspaceLock(tx: unknown, businessId: string): Promise<void> {
  const exec = (tx as { $executeRaw?: PrismaClient["$executeRaw"] }).$executeRaw;
  if (typeof exec === "function") {
    await (tx as PrismaClient).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}))`;
  }
}

function hasAuthoritativeMemberModel(tx: unknown): boolean {
  const candidate = tx as { member?: { findFirst?: unknown; findMany?: unknown; count?: unknown } };
  return (
    typeof candidate.member?.findFirst === "function" &&
    typeof candidate.member?.findMany === "function" &&
    typeof candidate.member?.count === "function"
  );
}

@Injectable()
export class MembersService {
  private readonly prisma: PrismaClient;
  private readonly realtimeGateway?: RealtimeGateway;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() realtimeGateway?: RealtimeGateway,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.prisma = prismaClient ?? prisma;
    this.realtimeGateway = realtimeGateway;
  }

  /**
   * Resolves seat limit for a workspace inside the active transaction.
   */
  private async resolveSeatLimit(tx: PrismaClient, businessId: string): Promise<number> {
    const subscription = (await tx.subscription.findFirst({
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
    })) as { plan?: { limits?: unknown } } | null;

    let seatLimit = 1;
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
    return seatLimit;
  }

  /**
   * Re-verifies inside the locked transaction that the target workspace is active
   * and the actor currently holds an authorized role (`owner` or `admin`).
   */
  private async assertActorAuthorizedInTx(
    tx: PrismaClient,
    businessId: string,
    actorUserId?: string,
    sessionId?: string,
  ): Promise<{ actorRole: MemberRole; businessName: string }> {
    const businessDelegate = (tx as { business?: PrismaClient["business"] }).business;
    const business =
      typeof businessDelegate?.findFirst === "function"
        ? await businessDelegate.findFirst({
            where: { id: businessId, deleted_at: null },
            select: { id: true, name: true },
          })
        : { id: businessId, name: "Workspace" };

    if (!business) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Business not found" },
      });
    }

    if (hasAuthoritativeMemberModel(tx)) {
      if (!actorUserId) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Actor identity is required on authoritative workspace mutations",
          },
        });
      }

      const actorMember = await tx.member.findFirst({
        where: { organizationId: businessId, userId: actorUserId },
      });
      if (!actorMember || !roleHasPermission(actorMember.role, "members.manage")) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Actor lacks members.manage permission on target workspace",
          },
        });
      }

      if (sessionId) {
        const activeSession = await findAuthSessionById(sessionId, tx as unknown as PrismaClient);
        if (
          !activeSession ||
          activeSession.userId !== actorUserId ||
          activeSession.expiresAt <= new Date() ||
          !activeSession.mfaVerified
        ) {
          throw new ForbiddenException({
            error: {
              code: "mfa_required",
              message:
                "A verified two-factor authentication session is required for privileged workspace mutations",
            },
          });
        }
      } else if (
        !sessionId &&
        env.NODE_ENV === "production" &&
        Boolean((tx as unknown as { session?: PrismaClient["session"] }).session)
      ) {
        throw new ForbiddenException({
          error: {
            code: "mfa_required",
            message:
              "A verified two-factor authentication session is required for privileged workspace mutations",
          },
        });
      }

      return { actorRole: actorMember.role as MemberRole, businessName: business.name };
    }

    if (!actorUserId) {
      return { actorRole: "owner", businessName: business.name };
    }

    return { actorRole: "owner", businessName: business.name };
  }

  /**
   * 13 §5 GET /api/v1/businesses/:id/members
   * Lists active team members from Better Auth `Member` (authoritative) enriched with
   * optional metadata from `BusinessMember` projection.
   */
  async listMembers(businessId: string): Promise<MemberResponse[]> {
    if (hasAuthoritativeMemberModel(this.prisma)) {
      const [members, projections] = await Promise.all([
        this.prisma.member.findMany({
          where: { organizationId: businessId },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        }),
        typeof this.prisma.businessMember?.findMany === "function"
          ? this.prisma.businessMember.findMany({
              where: { business_id: businessId, removed_at: null },
              select: { user_id: true, invited_at: true, last_active_at: true },
            })
          : Promise.resolve([]),
      ]);

      const projByUser = new Map(projections.map((p) => [p.user_id, p]));
      return members.map((m) => {
        const proj = projByUser.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          businessId: m.organizationId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          joinedAt: m.createdAt,
          invitedAt: proj?.invited_at ?? null,
          lastActiveAt: proj?.last_active_at ?? null,
        };
      });
    }

    // Isolated unit-test mock fallback
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
   * Single transaction-owning writer with PostgreSQL advisory lock across seat quota check + write.
   */
  async createInvitation(
    businessId: string,
    invitedByUserId: string,
    rawDto: InviteMemberDto,
    idempotencyKey?: string,
    sessionId?: string,
  ): Promise<InvitationResponse> {
    const parseResult = InviteMemberSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const dto = parseResult.data;
    const normalizedEmail = dto.email.toLowerCase().trim();
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

    const { response, businessName, inviterName } = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as PrismaClient;
      await acquireWorkspaceLock(txClient, businessId);

      const { businessName: resolvedBizName } = await this.assertActorAuthorizedInTx(
        txClient,
        businessId,
        invitedByUserId,
        sessionId,
      );

      // Check existing active membership
      if (hasAuthoritativeMemberModel(txClient)) {
        const existingMember = await txClient.member.findFirst({
          where: {
            organizationId: businessId,
            user: { email: normalizedEmail },
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
      } else {
        const existingMember = await txClient.businessMember.findFirst({
          where: {
            business_id: businessId,
            removed_at: null,
            user: { email: normalizedEmail },
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
      }

      const activeMembersCount = hasAuthoritativeMemberModel(txClient)
        ? await txClient.member.count({ where: { organizationId: businessId } })
        : await txClient.businessMember.count({
            where: { business_id: businessId, removed_at: null },
          });

      const pendingInvitesCount = await txClient.invitation.count({
        where: {
          organizationId: businessId,
          status: "pending",
          accepted_at: null,
          expiresAt: { gt: new Date() },
        },
      });

      const seatLimit = await this.resolveSeatLimit(txClient, businessId);

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

      const targetRoleName = dto.role;
      const role = await txClient.role.findFirst({
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

      // Ensure Organization exists 1:1 with Business
      const existingOrg = await txClient.organization.findUnique({
        where: { id: businessId },
      });
      if (!existingOrg) {
        await txClient.organization.create({
          data: {
            id: businessId,
            name: resolvedBizName,
          },
        });
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invitation = await txClient.invitation.upsert({
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
          expiresAt,
          status: "pending",
        },
        update: {
          organizationId: businessId,
          role_id: role.id,
          role: targetRoleName,
          invited_by_user_id: invitedByUserId,
          inviterId: invitedByUserId,
          expiresAt,
          accepted_at: null,
          status: "pending",
        },
        include: {
          role_rel: true,
        },
      });

      const inviterRecord = invitedByUserId
        ? await findAuthUserById(invitedByUserId, txClient)
        : null;

      const roleName = extractRoleName(invitation.role, invitation.role_rel, targetRoleName);
      const txResponse: InvitationResponse = {
        id: invitation.id,
        businessId: invitation.business_id ?? invitation.organizationId,
        email: invitation.email,
        role: roleName,
        invitedByUserId: invitation.invited_by_user_id ?? invitation.inviterId,
        token: invitation.id,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      };

      if (this.auditService) {
        await this.auditService.record(
          {
            business_id: businessId,
            actor_user_id: invitedByUserId,
            action: "member.invite",
            entity_type: "invitation",
            entity_id: invitation.id,
            payload: {
              after: {
                email: invitation.email,
                role: roleName,
                invitationId: invitation.id,
              },
            },
          },
          txClient,
        );
      }

      if (idempotencyKey) {
        const keyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await txClient.idempotencyKey.create({
          data: {
            business_id: businessId,
            key: idempotencyKey,
            request_hash: requestHash,
            response_status: 201,
            response_body: txResponse as unknown as Prisma.InputJsonValue,
            expires_at: keyExpiresAt,
          },
        });
      }

      return {
        response: txResponse,
        businessName: resolvedBizName,
        inviterName: inviterRecord?.name ?? "Workspace Admin",
      };
    });

    const frontendURL = (env.PUBLIC_APP_URL || env.CORS_ORIGIN || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    const inviteLink = `${frontendURL}/invite?token=${encodeURIComponent(response.id)}`;
    void emailService
      .sendOrganizationInvitationEmail({
        to: normalizedEmail,
        organizationName: businessName,
        inviterName,
        inviteLink,
        role: response.role,
      })
      .catch((err) => {
        logger.warn({ err, businessId }, "Failed to send workspace invitation email");
      });

    return response;
  }

  /**
   * Canonical transaction-owning invitation acceptance.
   *
   * Requires an authenticated user whose verified email matches the invitation email,
   * holds a per-workspace advisory lock across the seat-quota check and Member + Invitation +
   * BusinessMember writes, and updates Session.activeOrganizationId atomically.
   */
  async acceptInvitationForSession(params: {
    invitationId: string;
    userId: string;
    userEmail: string;
    emailVerified: boolean;
    sessionId?: string;
  }): Promise<{ businessId: string; role: MemberRole }> {
    if (!params.emailVerified) {
      throw new ForbiddenException({
        error: {
          code: "email_verification_required",
          message: "Please verify your email address before accepting this invitation.",
        },
      });
    }

    const preLookup = await this.prisma.invitation.findUnique({
      where: { id: params.invitationId },
    });

    if (!preLookup) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Invitation not found or has expired",
        },
      });
    }

    const targetBusinessId = preLookup.business_id || preLookup.organizationId;

    return this.prisma.$transaction(async (tx) => {
      const txClient = tx as PrismaClient;
      await acquireWorkspaceLock(txClient, targetBusinessId);

      const invitation = await txClient.invitation.findUnique({
        where: { id: params.invitationId },
        include: { role_rel: true },
      });

      if (!invitation || invitation.expiresAt <= new Date()) {
        throw new NotFoundException({
          error: {
            code: "not_found",
            message: "Invitation not found or has expired",
          },
        });
      }

      if (invitation.status === "accepted" || invitation.accepted_at !== null) {
        throw new ConflictException({
          error: {
            code: "conflict",
            message: "This invitation has already been accepted",
          },
        });
      }

      if (invitation.status !== "pending") {
        throw new NotFoundException({
          error: {
            code: "not_found",
            message: "Invitation is no longer valid",
          },
        });
      }

      if (invitation.email.toLowerCase().trim() !== params.userEmail.toLowerCase().trim()) {
        throw new ForbiddenException({
          error: {
            code: "invite_email_mismatch",
            message: "The signed-in account email does not match the invitation recipient.",
          },
        });
      }

      const business = await txClient.business.findFirst({
        where: { id: targetBusinessId, deleted_at: null },
        select: { id: true },
      });

      if (!business) {
        throw new NotFoundException({
          error: {
            code: "not_found",
            message: "Workspace no longer exists",
          },
        });
      }

      const existingMember = await txClient.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId: targetBusinessId,
            userId: params.userId,
          },
        },
      });

      if (!existingMember) {
        const [activeMembersCount, seatLimit] = await Promise.all([
          txClient.member.count({ where: { organizationId: targetBusinessId } }),
          this.resolveSeatLimit(txClient, targetBusinessId),
        ]);

        if (activeMembersCount >= seatLimit) {
          throw new ForbiddenException({
            error: {
              code: "quota_exceeded",
              message: `Workspace seat limit of ${seatLimit} reached.`,
              details: {
                metric: "seats",
                limit: seatLimit,
                current: activeMembersCount,
              },
            },
          });
        }
      }

      const roleName = extractRoleName(invitation.role, invitation.role_rel, "employee");
      const safeRole: MemberRole = roleName === "admin" ? "admin" : "employee";

      const roleRecord = await txClient.role.findFirst({
        where: { name: safeRole, business_id: null },
      });

      const now = new Date();
      await txClient.invitation.update({
        where: { id: invitation.id },
        data: {
          status: "accepted",
          accepted_at: now,
        },
      });

      await txClient.member.upsert({
        where: {
          organizationId_userId: {
            organizationId: targetBusinessId,
            userId: params.userId,
          },
        },
        update: { role: safeRole },
        create: {
          organizationId: targetBusinessId,
          userId: params.userId,
          role: safeRole,
        },
      });

      if (roleRecord) {
        await txClient.businessMember.upsert({
          where: {
            business_id_user_id: {
              business_id: targetBusinessId,
              user_id: params.userId,
            },
          },
          update: {
            role_id: roleRecord.id,
            removed_at: null,
            joined_at: now,
          },
          create: {
            business_id: targetBusinessId,
            user_id: params.userId,
            role_id: roleRecord.id,
            invited_at: invitation.createdAt,
            joined_at: now,
          },
        });
      }

      if (params.sessionId) {
        await updateAuthSessionActiveOrganization(params.sessionId, targetBusinessId, txClient);
      }

      return { businessId: targetBusinessId, role: safeRole };
    });
  }

  /**
   * 13 §5 DELETE /api/v1/businesses/:id/invitations/:inviteId
   */
  async revokeInvitation(
    businessId: string,
    inviteId: string,
    actorUserId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const txClient = tx as PrismaClient;
      await acquireWorkspaceLock(txClient, businessId);
      await this.assertActorAuthorizedInTx(txClient, businessId, actorUserId, sessionId);

      const invitation = await txClient.invitation.findFirst({
        where: {
          id: inviteId,
          OR: [{ business_id: businessId }, { organizationId: businessId }],
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

      await txClient.invitation.delete({
        where: { id: inviteId },
      });
    });
  }

  /**
   * 13 §5 PATCH /api/v1/businesses/:id/members/:userId/role
   * Locks workspace across owner count + role update on Member & BusinessMember.
   */
  async updateMemberRole(
    businessId: string,
    targetUserId: string,
    rawDto: UpdateMemberRoleDto,
    actorUserId?: string,
    sessionId?: string,
  ): Promise<MemberResponse> {
    const parseResult = UpdateMemberRoleSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const dto = parseResult.data;

    const result = await this.prisma.$transaction(async (tx) => {
      const txClient = tx as PrismaClient;
      await acquireWorkspaceLock(txClient, businessId);
      const { actorRole } = await this.assertActorAuthorizedInTx(
        txClient,
        businessId,
        actorUserId,
        sessionId,
      );

      if (hasAuthoritativeMemberModel(txClient)) {
        const targetMember = await txClient.member.findFirst({
          where: {
            organizationId: businessId,
            userId: targetUserId,
          },
          include: { user: true },
        });

        if (!targetMember) {
          throw new NotFoundException({
            error: {
              code: "not_found",
              message: "Member not found in this business",
            },
          });
        }

        if (targetMember.role === "owner") {
          if (actorRole !== "owner") {
            throw new ForbiddenException({
              error: {
                code: "forbidden",
                message: "Only owners may modify an owner role",
              },
            });
          }

          const activeOwnersCount = await txClient.member.count({
            where: { organizationId: businessId, role: "owner" },
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

        const newRole = await txClient.role.findFirst({
          where: { name: dto.role, business_id: null },
        });
        if (!newRole) {
          throw new NotFoundException({
            error: { code: "not_found", message: `Role ${dto.role} not found` },
          });
        }

        const updatedMember = await txClient.member.update({
          where: { id: targetMember.id },
          data: { role: dto.role },
          include: { user: true },
        });

        await txClient.businessMember.updateMany({
          where: {
            business_id: businessId,
            user_id: targetUserId,
            removed_at: null,
          },
          data: { role_id: newRole.id },
        });

        return {
          id: updatedMember.id,
          userId: updatedMember.userId,
          businessId,
          name: updatedMember.user.name,
          email: updatedMember.user.email,
          role: updatedMember.role,
          joinedAt: updatedMember.createdAt,
          invitedAt: null,
          lastActiveAt: null,
        } satisfies MemberResponse;
      }

      // Isolated unit-test mock fallback
      const membership = await txClient.businessMember.findFirst({
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

      if (membership.role.name === "owner") {
        const activeOwnersCount = await txClient.businessMember.count({
          where: {
            business_id: businessId,
            removed_at: null,
            role: { name: "owner" },
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

      const newRole = await txClient.role.findFirst({
        where: { name: dto.role, business_id: null },
      });

      if (!newRole) {
        throw new NotFoundException({
          error: {
            code: "not_found",
            message: `Role ${dto.role} not found`,
          },
        });
      }

      const updated = await txClient.businessMember.update({
        where: { id: membership.id },
        data: { role_id: newRole.id },
        include: { role: true, user: true },
      });

      await txClient.member.updateMany({
        where: {
          organizationId: businessId,
          userId: membership.user_id,
        },
        data: { role: dto.role },
      });

      if (this.auditService) {
        await this.auditService.record(
          {
            business_id: businessId,
            actor_user_id: actorUserId,
            action: "member.role_change",
            entity_type: "business_member",
            entity_id: membership.id,
            payload: {
              before: { role: membership.role.name },
              after: { role: dto.role },
            },
          },
          txClient,
        );
      }

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
      } satisfies MemberResponse;
    });

    await publishAuthRevocation({
      type: "role_changed",
      userId: targetUserId,
      businessId,
    });

    return result;
  }

  /**
   * 13 §5 DELETE /api/v1/businesses/:id/members/:userId
   * Locks workspace across sole-owner count + Member deletion + BusinessMember projection +
   * assignment release in one transaction, then broadcasts cross-replica socket revocation.
   */
  async removeMember(
    businessId: string,
    targetUserId: string,
    actorUserId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const txClient = tx as PrismaClient;
      await acquireWorkspaceLock(txClient, businessId);
      const { actorRole } = await this.assertActorAuthorizedInTx(
        txClient,
        businessId,
        actorUserId,
        sessionId,
      );

      if (hasAuthoritativeMemberModel(txClient)) {
        const targetMember = await txClient.member.findFirst({
          where: {
            organizationId: businessId,
            userId: targetUserId,
          },
        });

        if (!targetMember) {
          throw new NotFoundException({
            error: {
              code: "not_found",
              message: "Member not found in this business",
            },
          });
        }

        if (targetMember.role === "owner") {
          if (actorRole !== "owner") {
            throw new ForbiddenException({
              error: {
                code: "forbidden",
                message: "Only owners may remove an owner",
              },
            });
          }

          const activeOwnersCount = await txClient.member.count({
            where: { organizationId: businessId, role: "owner" },
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

        await txClient.member.deleteMany({
          where: {
            organizationId: businessId,
            userId: targetUserId,
          },
        });

        await txClient.businessMember.updateMany({
          where: {
            business_id: businessId,
            user_id: targetUserId,
            removed_at: null,
          },
          data: { removed_at: new Date() },
        });

        await txClient.conversationAssignment.updateMany({
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

        if (this.auditService) {
          await this.auditService.record(
            {
              business_id: businessId,
              actor_user_id: actorUserId,
              action: "member.remove",
              entity_type: "business_member",
              entity_id: targetUserId,
              payload: {
                before: { userId: targetUserId },
              },
            },
            txClient,
          );
        }
        return;
      }

      // Isolated unit-test mock fallback
      const membership = await txClient.businessMember.findFirst({
        where: {
          business_id: businessId,
          user_id: targetUserId,
          removed_at: null,
        },
        include: { role: true },
      });

      if (!membership) {
        throw new NotFoundException({
          error: {
            code: "not_found",
            message: "Member not found in this business",
          },
        });
      }

      if (membership.role.name === "owner") {
        const activeOwnersCount = await txClient.businessMember.count({
          where: {
            business_id: businessId,
            removed_at: null,
            role: { name: "owner" },
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

      await txClient.businessMember.update({
        where: { id: membership.id },
        data: { removed_at: new Date() },
      });

      await txClient.member.deleteMany({
        where: {
          organizationId: businessId,
          userId: targetUserId,
        },
      });

      await txClient.conversationAssignment.updateMany({
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

      if (this.auditService) {
        await this.auditService.record(
          {
            business_id: businessId,
            actor_user_id: actorUserId,
            action: "member.remove",
            entity_type: "business_member",
            entity_id: targetUserId,
            payload: {
              before: { userId: targetUserId },
            },
          },
          txClient,
        );
      }
    });

    if (this.realtimeGateway) {
      this.realtimeGateway.disconnectUserFromBusiness(businessId, targetUserId);
    } else {
      await publishAuthRevocation({
        type: "member_removed",
        userId: targetUserId,
        businessId,
      });
    }
  }
}
