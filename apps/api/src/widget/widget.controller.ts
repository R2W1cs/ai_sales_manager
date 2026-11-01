import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePermission } from "../platform/security/permissions";
import { PermissionsGuard } from "../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../platform/security/tenant.guard";
import { WidgetService } from "./widget.service";

@Controller()
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Get("api/v1/website-widget")
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("business.write")
  getInstall(@CurrentBusinessId() businessId: string) {
    return this.widgetService.getInstall(businessId);
  }

  @Post("api/v1/website-widget/rotate")
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("business.write")
  rotate(@CurrentBusinessId() businessId: string) {
    return this.widgetService.rotateKey(businessId);
  }

  @Get("api/v1/public/widget/:publicKey")
  getConfig(@Param("publicKey") publicKey: string) {
    return this.widgetService.getPublicConfig(publicKey);
  }

  @Post("api/v1/public/widget/:publicKey/messages")
  sendMessage(
    @Param("publicKey") publicKey: string,
    @Body() body: { visitorId?: string; message?: string },
  ) {
    return this.widgetService.sendMessage(publicKey, body ?? {});
  }

  @Get("api/v1/public/widget/:publicKey/conversations/:conversationId/messages")
  listMessages(
    @Param("publicKey") publicKey: string,
    @Param("conversationId") conversationId: string,
    @Query("visitorId") visitorId?: string,
  ) {
    return this.widgetService.listPublicMessages(publicKey, conversationId, visitorId);
  }
}
