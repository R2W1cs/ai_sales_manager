import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { WidgetController } from "./widget.controller";
import { WidgetService } from "./widget.service";

@Module({
  imports: [AiModule],
  controllers: [WidgetController],
  providers: [WidgetService],
})
export class WidgetModule {}
