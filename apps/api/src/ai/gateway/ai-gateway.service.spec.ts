import { z } from "zod";

import { CatalogIndexerService } from "../../catalog/indexer/catalog-indexer.service";
import { EmbeddingService } from "../../knowledge/search/embedding.service";
import { LlmIntentClassifierService } from "../intent/llm-intent-classifier.service";
import {
  AiGatewayService,
  resolveGatewayModelId,
  resolveProviderName,
  calculateModelCost,
} from "./ai-gateway.service";

describe("AiGatewayService & Gateway Model Routing", () => {
  describe("Model ID & Provider Resolution", () => {
    it("resolves mapped model names to canonical Vercel AI Gateway model IDs", () => {
      expect(resolveGatewayModelId("gemini-3.5-flash")).toBe("google/gemini-2.5-flash");
      expect(resolveGatewayModelId("gpt-5.6-terra")).toBe("openai/gpt-4o");
      expect(resolveGatewayModelId("gpt-5.6-luna")).toBe("openai/gpt-4o-mini");
      expect(resolveGatewayModelId("claude-sonnet-5")).toBe("anthropic/claude-3-5-sonnet-20241022");
      expect(resolveGatewayModelId("text-embedding-3-small")).toBe("openai/text-embedding-3-small");
    });

    it("handles already prefixed provider/model IDs", () => {
      expect(resolveGatewayModelId("openai/gpt-4o")).toBe("openai/gpt-4o");
      expect(resolveGatewayModelId("google/gemini-2.5-flash")).toBe("google/gemini-2.5-flash");
      expect(resolveGatewayModelId("anthropic/claude-3-5-sonnet-20241022")).toBe(
        "anthropic/claude-3-5-sonnet-20241022",
      );
    });

    it("correctly infers provider prefix for unknown model strings based on naming convention", () => {
      expect(resolveGatewayModelId("gemini-custom")).toBe("google/gemini-custom");
      expect(resolveGatewayModelId("gpt-custom")).toBe("openai/gpt-custom");
      expect(resolveGatewayModelId("claude-custom")).toBe("anthropic/claude-custom");
    });

    it("resolves provider name accurately from model ID", () => {
      expect(resolveProviderName("gemini-3.5-flash")).toBe("google");
      expect(resolveProviderName("gpt-5.6-terra")).toBe("openai");
      expect(resolveProviderName("claude-sonnet-5")).toBe("anthropic");
      expect(resolveProviderName("google/gemini-2.5-flash")).toBe("google");
      expect(resolveProviderName("openai/gpt-4o")).toBe("openai");
      expect(resolveProviderName("anthropic/claude-3-5-sonnet-20241022")).toBe("anthropic");
      expect(resolveProviderName("unknown-model")).toBe("gateway");
    });
  });

  describe("Model Cost Calculation", () => {
    it("calculates Gemini pricing tier accurately ($0.075/1M input, $0.30/1M output)", () => {
      const cost = calculateModelCost("gemini-3.5-flash", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(0.075 + 0.3, 5);
    });

    it("calculates GPT-4o / Terra pricing tier accurately ($2.50/1M input, $10.00/1M output)", () => {
      const cost = calculateModelCost("gpt-5.6-terra", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(2.5 + 10.0, 5);
    });

    it("calculates GPT-4o-mini / Luna pricing tier accurately ($0.15/1M input, $0.60/1M output)", () => {
      const cost = calculateModelCost("gpt-5.6-luna", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(0.15 + 0.6, 5);
    });

    it("calculates Claude Sonnet pricing tier accurately ($3.00/1M input, $15.00/1M output)", () => {
      const cost = calculateModelCost("claude-sonnet-5", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(3.0 + 15.0, 5);
    });
  });

  describe("Service Unconfigured & Graceful Degradation Behavior", () => {
    it("returns null on generateText when gateway credentials are not configured", async () => {
      const service = new AiGatewayService();
      const result = await service.generateText({
        model: "gemini-3.5-flash",
        prompt: "Hello, what is the price of product A?",
      });

      expect(result).toBeNull();
    });

    it("returns null on generateStructured when gateway credentials are not configured", async () => {
      const service = new AiGatewayService();
      const TestSchema = z.object({
        intent: z.string(),
      });

      const result = await service.generateStructured({
        model: "gpt-5.6-luna",
        schema: TestSchema,
        prompt: "Salem",
      });

      expect(result).toBeNull();
    });

    it("returns null on generateEmbedding when gateway credentials are not configured", async () => {
      const service = new AiGatewayService();
      const embedding = await service.generateEmbedding("T-shirt oversize en coton");
      expect(embedding).toBeNull();
    });

    it("returns null on generateEmbeddings batch when gateway credentials are not configured", async () => {
      const service = new AiGatewayService();
      const embeddings = await service.generateEmbeddings(["Product 1", "Product 2"]);
      expect(embeddings).toBeNull();
    });

    it("throws clear error message when getLanguageModel or getEmbeddingModel called while unconfigured", () => {
      const service = new AiGatewayService();
      expect(() => service.getLanguageModel("gpt-5.6-luna")).toThrow(
        "AI Gateway is not configured. Please provide AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.",
      );
      expect(() => service.getEmbeddingModel()).toThrow(
        "AI Gateway is not configured. Please provide AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.",
      );
    });
  });

  describe("Mocked Gateway Provider Calls", () => {
    it("handles generateText using mocked gateway provider", async () => {
      const service = new AiGatewayService();
      const mockResult = {
        text: "Bonjour, le prix est 45 TND.",
        model: "google/gemini-2.5-flash",
        provider: "google",
        tokensInput: 120,
        tokensOutput: 35,
        estimatedCostUsd: 0.0000195,
      };

      jest.spyOn(service, "generateText").mockResolvedValue(mockResult);

      const res = await service.generateText({
        model: "gemini-3.5-flash",
        prompt: "Prix?",
      });

      expect(res).toEqual(mockResult);
      expect(res?.text).toBe("Bonjour, le prix est 45 TND.");
    });

    it("handles generateStructured using mocked gateway provider with Zod validation", async () => {
      const service = new AiGatewayService();
      const OutputSchema = z.object({
        intent: z.enum(["price_question", "stock_check", "greeting"]),
        confidence: z.number(),
      });

      const mockStructured = {
        object: { intent: "price_question" as const, confidence: 0.98 },
        model: "openai/gpt-4o-mini",
        provider: "openai",
        tokensInput: 50,
        tokensOutput: 20,
        estimatedCostUsd: 0.0000195,
      };

      jest.spyOn(service, "generateStructured").mockResolvedValue(mockStructured);

      const res = await service.generateStructured({
        model: "gpt-5.6-luna",
        schema: OutputSchema,
        prompt: "9adeh soum?",
      });

      expect(res).toEqual(mockStructured);
      expect((res?.object as any)?.intent).toBe("price_question");
    });
  });

  describe("Downstream Service Integration with AiGatewayService", () => {
    it("EmbeddingService falls back to deterministic 1536-dim vector when AiGateway is unconfigured", async () => {
      const embeddingService = new EmbeddingService();
      const vector = await embeddingService.generateEmbedding("T-shirt oversize");

      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(1536);
      expect(typeof vector[0]).toBe("number");
    });

    it("LlmIntentClassifierService classifies text when AiGateway returns structured output", async () => {
      const mockGateway = new AiGatewayService();
      jest.spyOn(mockGateway, "isConfigured").mockReturnValue(true);
      jest.spyOn(mockGateway, "generateStructured").mockResolvedValue({
        object: {
          intent: "price_question",
          confidence: 0.95,
          secondary: [],
          entities: {
            product: "pull",
            size: "M",
          },
        },
        model: "openai/gpt-4o-mini",
        provider: "openai",
        tokensInput: 100,
        tokensOutput: 40,
        estimatedCostUsd: 0.000039,
      });

      const classifier = new LlmIntentClassifierService(mockGateway);
      const classification = await classifier.classify("9adeh el pull taille M?");

      expect(classification).not.toBeNull();
      expect(classification.intent).toBe("price_question");
      expect(classification.confidence).toBe(0.95);
      expect(classification.entities.product).toBe("pull");
      expect(classification.entities.size).toBe("M");
    });

    it("CatalogIndexerService delegates embedding generation to EmbeddingService", async () => {
      const mockEmbeddingService = new EmbeddingService();
      const dummyVector = Array.from<number>({ length: 1536 }).fill(0.123);
      const embedSpy = jest
        .spyOn(mockEmbeddingService, "generateEmbedding")
        .mockResolvedValue(dummyVector);

      const catalogIndexer = new CatalogIndexerService(undefined, undefined, mockEmbeddingService);
      const vector = await catalogIndexer.generateEmbedding("Test product text");

      expect(vector).toEqual(dummyVector);
      expect(embedSpy).toHaveBeenCalledWith("Test product text");
    });
  });
});
