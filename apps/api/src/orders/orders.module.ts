import { Module } from "@nestjs/common";
import { Queue } from "bullmq";

import { connection } from "../lib/queue";
import { RealtimeModule } from "../realtime";
import { OrdersController } from "./core/orders.controller";
import { OrdersService } from "./core/orders.service";
import {
  ReservationSweeperProcessor,
  RESERVATION_SWEEPER_QUEUE,
  MAINTENANCE_QUEUE,
} from "./reservations/reservation-sweeper.processor";
import { ReservationSweeperService } from "./reservations/reservation-sweeper.service";

@Module({
  imports: [RealtimeModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    ReservationSweeperService,
    {
      provide: RESERVATION_SWEEPER_QUEUE,
      useFactory: () =>
        new Queue(MAINTENANCE_QUEUE, {
          connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        }),
    },
    ReservationSweeperProcessor,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
