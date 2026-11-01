import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { BillingController } from "./core/billing.controller";
import { MeteringProcessor } from "./metering/metering.processor";
import { MeteringService } from "./metering/metering.service";
import { PlansController } from "./plans/plans.controller";
import { PlansService } from "./plans/plans.service";
import { QuotaService } from "./quota/quota.service";

@Module({
  imports: [NotificationsModule],
  controllers: [PlansController, BillingController],
  providers: [PlansService, MeteringService, MeteringProcessor, QuotaService],
  exports: [PlansService, MeteringService, MeteringProcessor, QuotaService],
})
export class BillingModule {}
