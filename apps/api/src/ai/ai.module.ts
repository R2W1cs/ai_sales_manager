import { Module } from "@nestjs/common";

import { OrdersModule } from "../orders";
import { RealtimeModule } from "../realtime";
import { AiConfigController } from "./config/ai-config.controller";
import { AiConfigService } from "./config/ai-config.service";
import { EvaluationService } from "./evaluation/evaluation.service";
import { FeedbackController } from "./feedback/feedback.controller";
import { FeedbackService } from "./feedback/feedback.service";
import { AiGatewayService } from "./gateway/ai-gateway.service";
import { ModelFallbackService } from "./gateway/model-fallback.service";
import { GuardrailsService } from "./guardrails/guardrails.service";
import { BriefingGeneratorService } from "./handoff/briefing-generator.service";
import { HandoffService } from "./handoff/handoff.service";
import { PurchaseHandoffService } from "./handoff/purchase-handoff.service";
import { IntentClassifierService } from "./intent/intent-classifier.service";
import { LlmIntentClassifierService } from "./intent/llm-intent-classifier.service";
import { ObservabilityController } from "./observability/observability.controller";
import { ObservabilityService } from "./observability/observability.service";
import { OrchestratorService } from "./orchestrator/orchestrator.service";
import { PlaygroundController } from "./playground/playground.controller";
import { PlaygroundService } from "./playground/playground.service";
import { PromptBuilderService } from "./prompts/prompt-builder.service";
import { PromptVersionsController } from "./prompts/prompt-versions.controller";
import { PromptVersionsService } from "./prompts/prompt-versions.service";
import { ReplyModeService } from "./reply-mode/reply-mode.service";
import { SuggestController } from "./suggest/suggest.controller";
import { SuggestService } from "./suggest/suggest.service";
import { CatalogSearchTool } from "./tools/catalog-search.tool";
import { PolicyLookupTool } from "./tools/policy-lookup.tool";
import { StockCheckTool } from "./tools/stock-check.tool";

@Module({
  imports: [OrdersModule, RealtimeModule],
  controllers: [
    AiConfigController,
    PromptVersionsController,
    PlaygroundController,
    SuggestController,
    ObservabilityController,
    FeedbackController,
  ],
  providers: [
    AiGatewayService,
    AiConfigService,
    PromptVersionsService,
    PlaygroundService,
    IntentClassifierService,
    LlmIntentClassifierService,
    PromptBuilderService,
    CatalogSearchTool,
    StockCheckTool,
    PolicyLookupTool,
    GuardrailsService,
    OrchestratorService,
    ReplyModeService,
    ModelFallbackService,
    BriefingGeneratorService,
    HandoffService,
    PurchaseHandoffService,
    SuggestService,
    EvaluationService,
    ObservabilityService,
    FeedbackService,
  ],
  exports: [
    AiGatewayService,
    AiConfigService,
    PromptVersionsService,
    PlaygroundService,
    IntentClassifierService,
    LlmIntentClassifierService,
    PromptBuilderService,
    CatalogSearchTool,
    StockCheckTool,
    PolicyLookupTool,
    GuardrailsService,
    OrchestratorService,
    ReplyModeService,
    ModelFallbackService,
    BriefingGeneratorService,
    HandoffService,
    PurchaseHandoffService,
    SuggestService,
    EvaluationService,
    ObservabilityService,
    FeedbackService,
  ],
})
export class AiModule {}
