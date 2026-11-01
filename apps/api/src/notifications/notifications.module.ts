import { Module } from "@nestjs/common";

import { RealtimeModule } from "../realtime";
import { NotificationsController } from "./core/notifications.controller";
import { NotificationsService } from "./core/notifications.service";
import { NotificationDispatcherService } from "./dispatcher/notification-dispatcher.service";
import { NotificationsProcessor } from "./dispatcher/notifications.processor";

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationDispatcherService, NotificationsProcessor, NotificationsService],
  exports: [NotificationDispatcherService, NotificationsProcessor, NotificationsService],
})
export class NotificationsModule {}
