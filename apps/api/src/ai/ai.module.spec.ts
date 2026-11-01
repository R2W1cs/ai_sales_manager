import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";

import { PRISMA_CLIENT } from "../platform/core/prisma.token";
import { AiModule } from "./ai.module";
import { AiConfigController } from "./config/ai-config.controller";
import { AiConfigService } from "./config/ai-config.service";
import { FeedbackController } from "./feedback/feedback.controller";
import { FeedbackService } from "./feedback/feedback.service";
import { ObservabilityController } from "./observability/observability.controller";
import { ObservabilityService } from "./observability/observability.service";
import { OrchestratorService } from "./orchestrator/orchestrator.service";
import { PlaygroundController } from "./playground/playground.controller";
import { PlaygroundService } from "./playground/playground.service";
import { PromptVersionsController } from "./prompts/prompt-versions.controller";
import { PromptVersionsService } from "./prompts/prompt-versions.service";
import { SuggestController } from "./suggest/suggest.controller";
import { SuggestService } from "./suggest/suggest.service";

describe("AiModule dependency resolution", () => {
  let module: TestingModule;

  beforeEach(async () => {
    const mockPrismaClient = {
      message: { findFirst: jest.fn(), findMany: jest.fn() },
      aiFeedback: { upsert: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      aiDecisionTrace: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
      aiAction: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      conversation: { findFirst: jest.fn() },
      businessMember: { findFirst: jest.fn(), findMany: jest.fn() },
    };

    module = await Test.createTestingModule({
      imports: [AiModule],
    })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(mockPrismaClient)
      .compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it("resolves all AI controllers and services successfully", () => {
    expect(module.get<FeedbackController>(FeedbackController)).toBeDefined();
    expect(module.get<FeedbackService>(FeedbackService)).toBeDefined();
    expect(module.get<ObservabilityController>(ObservabilityController)).toBeDefined();
    expect(module.get<ObservabilityService>(ObservabilityService)).toBeDefined();
    expect(module.get<OrchestratorService>(OrchestratorService)).toBeDefined();
    expect(module.get<SuggestController>(SuggestController)).toBeDefined();
    expect(module.get<SuggestService>(SuggestService)).toBeDefined();
    expect(module.get<AiConfigController>(AiConfigController)).toBeDefined();
    expect(module.get<AiConfigService>(AiConfigService)).toBeDefined();
    expect(module.get<PromptVersionsController>(PromptVersionsController)).toBeDefined();
    expect(module.get<PromptVersionsService>(PromptVersionsService)).toBeDefined();
    expect(module.get<PlaygroundController>(PlaygroundController)).toBeDefined();
    expect(module.get<PlaygroundService>(PlaygroundService)).toBeDefined();
  });
});
