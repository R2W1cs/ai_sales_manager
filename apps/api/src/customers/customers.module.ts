import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses";
import { EraseService } from "./erase/erase.service";
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
    EraseService,
    IdentityResolverService,
    MergeService,
    LifecycleService,
    LifecycleProcessor,
  ],
  exports: [
    CustomersService,
    EraseService,
    IdentityResolverService,
    MergeService,
    LifecycleService,
    LifecycleProcessor,
  ],
})
export class CustomersModule {}
