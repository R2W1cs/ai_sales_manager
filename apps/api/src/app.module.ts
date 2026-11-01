import { Module } from "@nestjs/common";

import { AiModule } from "./ai/ai.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { BusinessesModule } from "./businesses/businesses.module";
import { CatalogModule } from "./catalog/catalog.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { CustomersModule } from "./customers/customers.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OrdersModule } from "./orders/orders.module";
import { PlatformAdminModule } from "./platform-admin/platform-admin.module";
import { PlatformModule } from "./platform/platform.module";
import { ProductsModule } from "./products/products.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { WidgetModule } from "./widget/widget.module";

@Module({
  imports: [
    PlatformModule,
    RealtimeModule,
    AuthModule,
    BusinessesModule,
    ProductsModule,
    CatalogModule,
    KnowledgeModule,
    CustomersModule,
    ConversationsModule,
    AiModule,
    OrdersModule,
    IntegrationsModule,
    AnalyticsModule,
    NotificationsModule,
    BillingModule,
    WidgetModule,
    PlatformAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
