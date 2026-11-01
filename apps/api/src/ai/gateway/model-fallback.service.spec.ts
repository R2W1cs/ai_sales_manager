import type { AiGatewayService, AiGenerationResult } from "./ai-gateway.service";
import {
  MODEL_FALLBACK_CHAIN,
  ModelFallbackService,
  type ModelFallbackGateway,
} from "./model-fallback.service";

const generation = (text: string, model: string): AiGenerationResult => ({
  text,
  model,
  provider: model.startsWith("gemini") ? "google" : "openai",
  tokensInput: 10,
  tokensOutput: 5,
  estimatedCostUsd: 0.001,
});

describe("LLM fallback routing & graceful degradation handler (T-AI-05)", () => {
  let generateText: jest.MockedFunction<AiGatewayService["generateText"]>;
  let service: ModelFallbackService;

  beforeEach(() => {
    generateText = jest.fn();
    service = new ModelFallbackService({ generateText } satisfies ModelFallbackGateway);
  });

  it.each([
    ["5xx", Object.assign(new Error("provider failed"), { statusCode: 503 })],
    ["rate limit", Object.assign(new Error("rate limited"), { statusCode: 429 })],
  ])("Failover: switches to the backup model on %s", async (_case, error) => {
    generateText
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(generation("safe grounded response", MODEL_FALLBACK_CHAIN[1]));

    const result = await service.generate({ prompt: "customer question" });

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls.map(([request]) => request.model)).toEqual([
      MODEL_FALLBACK_CHAIN[0],
      MODEL_FALLBACK_CHAIN[1],
    ]);
    expect(result).toEqual({
      text: "safe grounded response",
      generation: generation("safe grounded response", MODEL_FALLBACK_CHAIN[1]),
      model: MODEL_FALLBACK_CHAIN[1],
      fallbackUsed: true,
      modelsAttempted: [MODEL_FALLBACK_CHAIN[0], MODEL_FALLBACK_CHAIN[1]],
      handoff: null,
    });
  });

  it("falls through to the next model when an attempt times out", async () => {
    jest.useFakeTimers();
    generateText
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce(generation("backup response", MODEL_FALLBACK_CHAIN[1]));

    const resultPromise = service.generate({ prompt: "customer question", timeoutMs: 100 });
    await jest.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toMatchObject({
      text: "backup response",
      model: MODEL_FALLBACK_CHAIN[1],
      fallbackUsed: true,
      handoff: null,
    });
    expect(generateText.mock.calls[0]?.[0].abortSignal?.aborted).toBe(true);
    jest.useRealTimers();
  });

  it("classifies a total timeout as ai_timeout without exposing timeout details", async () => {
    jest.useFakeTimers();
    generateText.mockImplementation(() => new Promise(() => undefined));

    const resultPromise = service.generate({ prompt: "customer question", timeoutMs: 100 });
    await jest.advanceTimersByTimeAsync(300);

    await expect(resultPromise).resolves.toMatchObject({
      text: null,
      handoff: {
        status: "HUMAN_REQUIRED",
        reason: "ai_timeout",
        code: "MODEL_OUTAGE",
      },
    });
    jest.useRealTimers();
  });

  it("Total Outage: triggers a sanitized MODEL_OUTAGE handoff when every model fails", async () => {
    generateText
      .mockRejectedValueOnce(new Error("secret primary provider error"))
      .mockResolvedValueOnce({
        ...generation("partial output that must not be sent", MODEL_FALLBACK_CHAIN[1]),
        text: "",
      })
      .mockRejectedValueOnce(new Error("secret final provider error"));

    const result = await service.generate({ prompt: "customer question" });

    expect(generateText.mock.calls.map(([request]) => request.model)).toEqual(MODEL_FALLBACK_CHAIN);
    expect(result).toEqual({
      text: null,
      generation: null,
      model: null,
      fallbackUsed: false,
      modelsAttempted: [...MODEL_FALLBACK_CHAIN],
      handoff: {
        status: "HUMAN_REQUIRED",
        reason: "integration_failure",
        code: "MODEL_OUTAGE",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("partial output");
  });
});
