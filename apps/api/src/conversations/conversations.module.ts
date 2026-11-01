import { Module } from "@nestjs/common";

import { LeadScoringProcessor } from "./lead-scoring/lead-scoring.processor";
import { LeadScoringService } from "./lead-scoring/lead-scoring.service";
import { MessagesController } from "./messages/messages.controller";
import { MessagesService } from "./messages/messages.service";
import { PipelineController } from "./pipeline/pipeline.controller";
import { PipelineService } from "./pipeline/pipeline.service";
import { StateMachineService } from "./state-machine/state-machine.service";
import { ConversationLockService } from "./threads/conversation-lock.service";
import { ConversationsController } from "./threads/conversations.controller";
import { ConversationsService } from "./threads/conversations.service";
import { ThreadActionsService } from "./threads/thread-actions.service";
import { TimelineController } from "./timeline/timeline.controller";
import { TimelineService } from "./timeline/timeline.service";

@Module({
  imports: [],
  controllers: [
    ConversationsController,
    MessagesController,
    TimelineController,
    PipelineController,
  ],
  providers: [
    ConversationsService,
    MessagesService,
    ThreadActionsService,
    StateMachineService,
    ConversationLockService,
    TimelineService,
    LeadScoringService,
    LeadScoringProcessor,
    // Read-only commercial pipeline Kanban projection aggregator (13 §7 / FR-CONV-050–053)
    PipelineService,
  ],
  exports: [
    ConversationsService,
    MessagesService,
    ThreadActionsService,
    StateMachineService,
    ConversationLockService,
    TimelineService,
    LeadScoringService,
    LeadScoringProcessor,
  ],
})
export class ConversationsModule {}
