import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import type { MergeCustomersDto } from "../dto/merge-customers.dto";
import { type MergeCustomersResponse, MergeService } from "./merge.service";

@Controller(["api/v1/customers", "customers"])
@UseGuards(TenantGuard, PermissionsGuard)
export class MergeController {
  constructor(private readonly mergeService: MergeService) {}

  @Post(":id/merge")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("customers.merge")
  async merge(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") survivorId: string,
    @Body() body: MergeCustomersDto,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-idempotency-key") xIdempotencyKey?: string,
  ): Promise<MergeCustomersResponse> {
    const rawKey = idempotencyKey || xIdempotencyKey;
    const resolvedKey = typeof rawKey === "string" ? rawKey.trim() : "";
    if (!resolvedKey || resolvedKey.length > 128) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Idempotency-Key header is required (max 128 characters)",
        },
      });
    }

    return this.mergeService.merge(businessId, user.id, survivorId, body, resolvedKey);
  }
}
