import { Module } from "@nestjs/common";

import { RealtimeModule } from "../realtime";
import { ActivationController } from "./activation/activation.controller";
import { ActivationService } from "./activation/activation.service";
import { AuditController } from "./audit/audit.controller";
import { AuditService } from "./audit/audit.service";
import { FlagsController } from "./flags/flags.controller";
import { FlagsService } from "./flags/flags.service";
import { MembersController } from "./members/members.controller";
import { MembersService } from "./members/members.service";
import { OnboardingController } from "./onboarding/onboarding.controller";
import { OnboardingService } from "./onboarding/onboarding.service";
import { BusinessesController } from "./workspace/businesses.controller";
import { BusinessesService } from "./workspace/businesses.service";

@Module({
  imports: [RealtimeModule],
  controllers: [
    BusinessesController,
    MembersController,
    OnboardingController,
    ActivationController,
    FlagsController,
    AuditController,
  ],
  providers: [
    BusinessesService,
    MembersService,
    OnboardingService,
    ActivationService,
    FlagsService,
    AuditService,
  ],
  exports: [
    BusinessesService,
    MembersService,
    OnboardingService,
    ActivationService,
    FlagsService,
    AuditService,
  ],
})
export class BusinessesModule {}
