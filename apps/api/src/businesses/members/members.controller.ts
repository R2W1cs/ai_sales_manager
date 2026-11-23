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
  Req,
  UseGuards,
} from "@nestjs/common";

import { AuthThrottlerGuard } from "../../auth";
import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
  type TenantRequest,
} from "../../platform/security/tenant.guard";
import type { InviteMemberDto, InvitationResponse } from "../dto/invite-member.dto";
import type { MemberResponse, UpdateMemberRoleDto } from "../dto/update-member-role.dto";
import { MembersService } from "./members.service";

@Controller("api/v1/businesses/:businessId")
@UseGuards(TenantGuard, PermissionsGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

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

  @Post("invitations")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthThrottlerGuard)
  @RequirePermission("members.manage")
  async createInvitation(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InviteMemberDto,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Req() req?: TenantRequest,
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
      req?.session?.id,
    );
  }

  @Delete("invitations/:inviteId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("members.manage")
  async revokeInvitation(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @Param("inviteId") inviteId: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Req() req?: TenantRequest,
  ): Promise<void> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.revokeInvitation(
      businessId,
      inviteId,
      user?.id || user?.sub,
      req?.session?.id,
    );
  }

  @Patch("members/:userId/role")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("members.manage")
  async updateMemberRole(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @Param("userId") targetUserId: string,
    @Body() body: UpdateMemberRoleDto,
    @CurrentUser() user?: AuthenticatedUser,
    @Req() req?: TenantRequest,
  ): Promise<MemberResponse> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.updateMemberRole(
      businessId,
      targetUserId,
      body,
      user?.id || user?.sub,
      req?.session?.id,
    );
  }

  @Delete("members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("members.manage")
  async removeMember(
    @CurrentBusinessId() businessId: string,
    @Param("businessId") paramBusinessId: string,
    @Param("userId") targetUserId: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Req() req?: TenantRequest,
  ): Promise<void> {
    if (businessId !== paramBusinessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.membersService.removeMember(
      businessId,
      targetUserId,
      user?.id || user?.sub,
      req?.session?.id,
    );
  }
}
