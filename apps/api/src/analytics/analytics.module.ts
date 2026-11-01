import { Module } from "@nestjs/common";

import { AnalyticsController } from "./kpis/analytics.controller";
import { AnalyticsService } from "./kpis/analytics.service";
import { DailyRollupProcessor } from "./rollups/daily-rollup.processor";
import { DailyRollupService } from "./rollups/daily-rollup.service";

@Module({
  imports: [],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DailyRollupService, DailyRollupProcessor],
  exports: [AnalyticsService, DailyRollupService, DailyRollupProcessor],
})
export class AnalyticsModule {}
