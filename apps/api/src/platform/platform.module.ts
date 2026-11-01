import { Module, Global } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { PRISMA_CLIENT } from "./core/prisma.token";
import { HealthIndicatorsService } from "./health/health-indicators.service";
import { HealthController } from "./health/health.controller";

@Global()
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    // Value token: the class token cannot work because consumers import
    // `PrismaClient` with `import type`, which erases the DI metadata.
    {
      provide: PRISMA_CLIENT,
      useValue: prisma,
    },
    // Retained so existing `PrismaClient`-token consumers keep resolving.
    {
      provide: PrismaClient,
      useValue: prisma,
    },
    HealthIndicatorsService,
  ],
  exports: [PRISMA_CLIENT, PrismaClient],
})
export class PlatformModule {}
