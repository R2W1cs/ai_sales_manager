import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, CurrentUser, TenantGuard } from "../../platform/security/tenant.guard";
import type { AuthenticatedUser } from "../../platform/security/tenant.guard";
import type { InviteMemberDto, InvitationResponse } from "../dto/invite-member.dto";
import type { MemberResponse, UpdateMemberRoleDto } from "../dto/update-member-role.dto";
import { MembersService } from "./members.service";

@Controller("api/v1/businesses/:businessId")
@UseGuards(TenantGuard, PermissionsGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  /**
   * 13 §5 GET /api/v1/businesses/:id/members
   * List active team members and roles.
   * Accessible by any business member.
   */
  @Get("members")
  async listMembers(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
  ): Promise<MemberResponse[]> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.listMembers(businessId);
  }

  /**
   * 13 §5 GET /api/v1/businesses/:id/invitations
   * List pending invitations for the workspace.
   * Guarded by members.manage permission.
   */
  @Get("invitations")
  @RequirePermission("members.manage")
  async listInvitations(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
  ): Promise<InvitationResponse[]> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.listPendingInvitations(businessId);
  }

  /**
   * 13 §5 POST /api/v1/businesses/:id/invitations
   * Create an invitation token for a teammate.
   * Guarded by members.manage permission.
   */
  @Post("invitations")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("members.manage")
  async createInvitation(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InviteMemberDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<InvitationResponse> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    if (
      !idempotencyKey ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.length > 128
    ) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Idempotency-Key header is required (max 128 characters)",
        },
      });
    }
    return this.membersService.createInvitation(
      businessId,
      user.id || user.sub,
      body,
      idempotencyKey,
    );
  }

  /**
   * 13 §5 DELETE /api/v1/businesses/:id/invitations/:inviteId
   * Revoke a pending invitation.
   * Guarded by members.manage permission.
   */
  @Delete("invitations/:inviteId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("members.manage")
  async revokeInvitation(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @Param("inviteId") inviteId: string,
  ): Promise<void> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.revokeInvitation(businessId, inviteId);
  }

  /**
   * 13 §5 PATCH /api/v1/businesses/:id/members/:userId/role
   * Update role of a team member.
   * Guarded by members.manage permission.
   */
  @Patch("members/:userId/role")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("members.manage")
  async updateMemberRole(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @Param("userId") targetUserId: string,
    @Body() body: UpdateMemberRoleDto,
  ): Promise<MemberResponse> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.updateMemberRole(businessId, targetUserId, body);
  }

  /**
   * 13 §5 DELETE /api/v1/businesses/:id/members/:userId
   * Remove a member from the workspace.
   * Guarded by members.manage permission.
   */
  @Delete("members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("members.manage")
  async removeMember(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @Param("userId") targetUserId: string,
  ): Promise<void> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.removeMember(businessId, targetUserId);
  }
}
