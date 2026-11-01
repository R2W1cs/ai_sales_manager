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

import { env } from "@app/shared/server";

import type { HttpRequest } from "../../platform/core/http";
import { extractBearerToken, verifyAccessToken } from "../../platform/security/jwt";
import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type { CreateBusinessDto, CreateBusinessResponse } from "../dto/create-business.dto";
import type { BusinessProfileResponse, UpdateBusinessDto } from "../dto/update-business.dto";
import { BusinessesService } from "./businesses.service";

@Controller("api/v1/businesses")
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  /**
   * 13 §5 POST /api/v1/businesses
   * Authenticated user creates a new business workspace.
   * Atomic transaction seeds tenant, owner membership, ai agent, ai settings, starter rules, onboarding.
   */
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

    const rawAccessToken = extractBearerToken(req.headers.authorization);
    if (!rawAccessToken) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Missing access token",
        },
      });
    }

    let userId: string;
    try {
      const secret = env.BETTER_AUTH_SECRET;
      const payload = verifyAccessToken(rawAccessToken, secret);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Invalid or expired access token",
        },
      });
    }

    return this.businessesService.createBusiness(userId, body, idempotencyKey);
  }

  /**
   * 13 §5 GET /api/v1/businesses/:id
   * Retrieve business profile details. Caller must be a member of the business.
   */
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

  /**
   * 13 §5 PATCH /api/v1/businesses/:id
   * Update business profile fields (name, industry, country, defaultLanguage, timezone, currency, phone).
   * Guarded by business.write permission.
   */
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
