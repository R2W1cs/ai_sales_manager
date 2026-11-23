import { forwardRef, Module } from "@nestjs/common";

import { TenantGuard } from "../platform/security/tenant.guard";
import { RealtimeModule } from "../realtime";
import { BetterAuthController } from "./better-auth/better-auth.controller";
import { EmailService } from "./email/email.service";
import { AuthRateLimiterService, AuthThrottlerGuard } from "./guards/auth-throttler.guard";

@Module({
  imports: [forwardRef(() => RealtimeModule)],
  controllers: [BetterAuthController],
  providers: [EmailService, TenantGuard, AuthRateLimiterService, AuthThrottlerGuard],
  exports: [EmailService, TenantGuard, AuthRateLimiterService, AuthThrottlerGuard],
})
export class AuthModule {}
