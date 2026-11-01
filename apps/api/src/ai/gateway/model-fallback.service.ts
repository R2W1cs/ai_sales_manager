import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import { AiGatewayService, type AiGenerationResult } from "./ai-gateway.service";

const DEFAULT_ATTEMPT_TIMEOUT_MS = 15_000;
const MODEL_OUTAGE_CODE = "MODEL_OUTAGE" as const;

export const MODEL_FALLBACK_CHAIN = [
  "gemini-3.5-flash",
  "gpt-5.6-terra",
  "claude-sonnet-5",
] as const;

type GenerationRequest = Parameters<AiGatewayService["generateText"]>[0];

export interface ModelFallbackGateway {
  generateText(params: GenerationRequest): Promise<AiGenerationResult | null>;
}

export interface ModelFallbackRequest extends Omit<GenerationRequest, "model" | "abortSignal"> {
  timeoutMs?: number;
  models?: readonly string[];
}

export interface ModelFallbackResult {
  text: string | null;
  generation: AiGenerationResult | null;
  model: string | null;
  fallbackUsed: boolean;
  modelsAttempted: string[];
  handoff: {
    status: "HUMAN_REQUIRED";
    reason: "integration_failure" | "ai_timeout";
    code: typeof MODEL_OUTAGE_CODE;
  } | null;
}

@Injectable()
export class ModelFallbackService {
  private readonly logger = new Logger(ModelFallbackService.name);
  private readonly gateway: ModelFallbackGateway;

  constructor(@Optional() @Inject(AiGatewayService) gateway?: ModelFallbackGateway) {
    this.gateway = gateway ?? new AiGatewayService();
  }

  async generate(request: ModelFallbackRequest): Promise<ModelFallbackResult> {
    const { timeoutMs = DEFAULT_ATTEMPT_TIMEOUT_MS, models, ...generationRequest } = request;
    const candidateModels = models?.length ? [...models] : [...MODEL_FALLBACK_CHAIN];
    const modelsAttempted: string[] = [];
    let timedOut = false;

    for (const model of candidateModels) {
      modelsAttempted.push(model);

      try {
        const generation = await this.generateWithTimeout(
          { ...generationRequest, model },
          Math.max(1, timeoutMs),
        );

        if (generation?.text.trim()) {
          return {
            text: generation.text,
            generation,
            model,
            fallbackUsed: model !== candidateModels[0],
            modelsAttempted,
            handoff: null,
          };
        }
      } catch (error) {
        const isTimeout = this.isTimeout(error);
        timedOut ||= isTimeout;
        this.logger.warn(
          { model, failure: isTimeout ? "timeout" : "provider_error" },
          "LLM fallback attempt failed",
        );
      }
    }

    return {
      text: null,
      generation: null,
      model: null,
      fallbackUsed: false,
      modelsAttempted,
      handoff: {
        status: "HUMAN_REQUIRED",
        reason: timedOut ? "ai_timeout" : "integration_failure",
        code: MODEL_OUTAGE_CODE,
      },
    };
  }

  private async generateWithTimeout(
    request: GenerationRequest,
    timeoutMs: number,
  ): Promise<AiGenerationResult | null> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        const error = new Error("Model attempt timed out");
        error.name = "ModelAttemptTimeout";
        reject(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        this.gateway.generateText({ ...request, abortSignal: controller.signal }),
        timeout,
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private isTimeout(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === "ModelAttemptTimeout" || error.name === "AbortError")
    );
  }
}
