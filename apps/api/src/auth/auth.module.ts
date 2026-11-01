import { forwardRef, Module } from "@nestjs/common";

import { TenantGuard } from "../platform/security/tenant.guard";
import { RealtimeModule } from "../realtime";
import { BetterAuthController } from "./better-auth/better-auth.controller";
import { AuthController } from "./core/auth.controller";
import { AuthService } from "./core/auth.service";
import { EmailService } from "./email/email.service";
import { AuthThrottlerGuard } from "./guards/auth-throttler.guard";

@Module({
  imports: [forwardRef(() => RealtimeModule)],
  controllers: [AuthController, BetterAuthController],
  providers: [AuthService, EmailService, TenantGuard, AuthThrottlerGuard],
  exports: [AuthService, EmailService, TenantGuard, AuthThrottlerGuard],
})
export class AuthModule {}
