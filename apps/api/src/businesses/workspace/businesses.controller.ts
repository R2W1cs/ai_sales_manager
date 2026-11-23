import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { resolveAuthenticatedUserId } from "../../auth";
import type { HttpRequest } from "../../platform/core/http";
import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type { CreateBusinessDto, CreateBusinessResponse } from "../dto/create-business.dto";
import type { BusinessProfileResponse, UpdateBusinessDto } from "../dto/update-business.dto";
import { BusinessesService } from "./businesses.service";

@Controller("api/v1/businesses")
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBusiness(
    @Body() body: CreateBusinessDto,
    @Req() req: HttpRequest,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<CreateBusinessResponse> {
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

    const userId = await resolveAuthenticatedUserId(req.headers);

    if (!userId) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Missing access token",
        },
      });
    }

    return this.businessesService.createBusiness(userId, body, idempotencyKey);
  }

  @Get(":id")
  @UseGuards(TenantGuard, PermissionsGuard)
  async getBusiness(
    @CurrentBusinessId() businessId: string,
    @Param("id") paramId: string,
  ): Promise<BusinessProfileResponse> {
    if (businessId !== paramId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.businessesService.getBusiness(businessId);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("business.write")
  async updateBusiness(
    @CurrentBusinessId() businessId: string,
    @Param("id") paramId: string,
    @Body() body: UpdateBusinessDto,
  ): Promise<BusinessProfileResponse> {
    if (businessId !== paramId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }
    return this.businessesService.updateBusiness(businessId, body);
  }
}
