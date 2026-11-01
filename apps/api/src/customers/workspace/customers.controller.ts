import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";

import type { CustomerProfileResponse } from "@app/shared";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import type { UpdateCustomerDto } from "../dto/update-customer.dto";
import { CustomersService } from "./customers.service";

@Controller(["api/v1/customers", "customers"])
@UseGuards(TenantGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get(":id")
  @RequirePermission("inbox.read")
  async getCustomer(
    @CurrentBusinessId() businessId: string,
    @Param("id") customerId: string,
  ): Promise<CustomerProfileResponse> {
    return this.customersService.getCustomer(businessId, customerId);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("customers.write")
  async updateCustomer(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") customerId: string,
    @Body() body: UpdateCustomerDto,
  ): Promise<CustomerProfileResponse> {
    return this.customersService.updateCustomer(businessId, user.id, customerId, body);
  }
}
