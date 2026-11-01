import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses";
import { IdentityResolverService } from "./identity/identity-resolver.service";
import { MergeController } from "./identity/merge.controller";
import { MergeService } from "./identity/merge.service";
import { LifecycleProcessor } from "./lifecycle/lifecycle.processor";
import { LifecycleService } from "./lifecycle/lifecycle.service";
import { CustomersController } from "./workspace/customers.controller";
import { CustomersService } from "./workspace/customers.service";

@Module({
  imports: [BusinessesModule],
  controllers: [CustomersController, MergeController],
  providers: [
    CustomersService,
    IdentityResolverService,
    MergeService,
    LifecycleService,
    LifecycleProcessor,
  ],
  exports: [
    CustomersService,
    IdentityResolverService,
    MergeService,
    LifecycleService,
    LifecycleProcessor,
  ],
})
export class CustomersModule {}
