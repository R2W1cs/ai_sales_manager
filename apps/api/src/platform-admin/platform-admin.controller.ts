import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformAdminService } from "./platform-admin.service";

@Controller("api/v1/platform")
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get("overview")
  overview() {
    return this.platformAdminService.overview();
  }

  @Get("businesses/:id")
  business(@Param("id") id: string) {
    return this.platformAdminService.business(id);
  }
}
