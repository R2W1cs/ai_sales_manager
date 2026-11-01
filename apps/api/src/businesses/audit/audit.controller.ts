import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import {
  AuditService,
  type AuditLogsQueryDto,
  type PaginatedAuditLogsResponse,
} from "./audit.service";

@Controller("api/v1")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * 13 §5 / 17 §9 GET /api/v1/businesses/:id/audit-logs
   * Returns paginated audit logs for a business workspace.
   * Guarded by audit.read permission.
   */
  @Get("businesses/:id/audit-logs")
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("audit.read")
  async getAuditLogsByBusinessId(
    @CurrentBusinessId() businessId: string,
    @Param("id") paramId: string,
    @Query() query: AuditLogsQueryDto = {},
  ): Promise<PaginatedAuditLogsResponse> {
    if (businessId !== paramId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    return this.auditService.listAuditLogs(businessId, query);
  }

  /**
   * 13 §13 / 17 §9 GET /api/v1/audit-logs
   * Direct tenant endpoint returning paginated audit logs for resolved tenant.
   * Guarded by audit.read permission.
   */
  @Get("audit-logs")
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("audit.read")
  async getAuditLogs(
    @CurrentBusinessId() businessId: string,
    @Query() query: AuditLogsQueryDto = {},
  ): Promise<PaginatedAuditLogsResponse> {
    return this.auditService.listAuditLogs(businessId, query);
  }
}
