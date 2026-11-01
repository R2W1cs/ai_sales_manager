import { createGateway, type GatewayProvider } from "@ai-sdk/gateway";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { Injectable, Logger } from "@nestjs/common";
import {
  generateText as aiGenerateText,
  streamText as aiStreamText,
  embed as aiEmbed,
  embedMany as aiEmbedMany,
  Output,
  APICallError,
  AISDKError,
  type LanguageModel,
  type EmbeddingModel,
  type ToolSet,
} from "ai";
import { z } from "zod";

import { env } from "@app/shared/server";

export interface AiUsageMetadata {
  model: string;
  provider: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
}

export interface AiGenerationResult extends AiUsageMetadata {
  text: string;
}

export interface AiStructuredResult<T> extends AiUsageMetadata {
  object: T;
}

interface ModelDefinition {
  gatewayId: string;
  provider: "google" | "openai" | "anthropic" | "gateway";
  costPerMillionInputUsd: number;
  costPerMillionOutputUsd: number;
}

/**
 * Pinned model definitions mapped to Vercel AI Gateway identifiers and pricing tiers
 * per docs/10_engineering/11_TECH_STACK/03-llm-routing-models.md
 */
export const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  // Primary response generation model (Fast tier)
  "gemini-3.5-flash": {
    gatewayId: "google/gemini-2.5-flash",
    provider: "google",
    costPerMillionInputUsd: 0.075,
    costPerMillionOutputUsd: 0.3,
  },
  "google/gemini-3.5-flash": {
    gatewayId: "google/gemini-2.5-flash",
    provider: "google",
    costPerMillionInputUsd: 0.075,
    costPerMillionOutputUsd: 0.3,
  },
  "google/gemini-2.5-flash": {
    gatewayId: "google/gemini-2.5-flash",
    provider: "google",
    costPerMillionInputUsd: 0.075,
    costPerMillionOutputUsd: 0.3,
  },

  // Fallback 1 response generation model (Balanced tier)
  "gpt-5.6-terra": {
    gatewayId: "openai/gpt-4o",
    provider: "openai",
    costPerMillionInputUsd: 2.5,
    costPerMillionOutputUsd: 10.0,
  },
  "openai/gpt-5.6-terra": {
    gatewayId: "openai/gpt-4o",
    provider: "openai",
    costPerMillionInputUsd: 2.5,
    costPerMillionOutputUsd: 10.0,
  },
  "openai/gpt-4o": {
    gatewayId: "openai/gpt-4o",
    provider: "openai",
    costPerMillionInputUsd: 2.5,
    costPerMillionOutputUsd: 10.0,
  },

  // Fallback 2 response generation model (Deep/Reasoning tier)
  "claude-sonnet-5": {
    gatewayId: "anthropic/claude-3-5-sonnet-20241022",
    provider: "anthropic",
    costPerMillionInputUsd: 3.0,
    costPerMillionOutputUsd: 15.0,
  },
  "anthropic/claude-sonnet-5": {
    gatewayId: "anthropic/claude-3-5-sonnet-20241022",
    provider: "anthropic",
    costPerMillionInputUsd: 3.0,
    costPerMillionOutputUsd: 15.0,
  },
  "anthropic/claude-3-5-sonnet-20241022": {
    gatewayId: "anthropic/claude-3-5-sonnet-20241022",
    provider: "anthropic",
    costPerMillionInputUsd: 3.0,
    costPerMillionOutputUsd: 15.0,
  },

  // Fast classifier model
  "gpt-5.6-luna": {
    gatewayId: "openai/gpt-4o-mini",
    provider: "openai",
    costPerMillionInputUsd: 0.15,
    costPerMillionOutputUsd: 0.6,
  },
  "openai/gpt-5.6-luna": {
    gatewayId: "openai/gpt-4o-mini",
    provider: "openai",
    costPerMillionInputUsd: 0.15,
    costPerMillionOutputUsd: 0.6,
  },
  "openai/gpt-4o-mini": {
    gatewayId: "openai/gpt-4o-mini",
    provider: "openai",
    costPerMillionInputUsd: 0.15,
    costPerMillionOutputUsd: 0.6,
  },

  // Embedding model
  "text-embedding-3-small": {
    gatewayId: "openai/text-embedding-3-small",
    provider: "openai",
    costPerMillionInputUsd: 0.02,
    costPerMillionOutputUsd: 0.0,
  },
  "openai/text-embedding-3-small": {
    gatewayId: "openai/text-embedding-3-small",
    provider: "openai",
    costPerMillionInputUsd: 0.02,
    costPerMillionOutputUsd: 0.0,
  },
};

export const MODEL_GATEWAY_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_REGISTRY).map(([k, v]) => [k, v.gatewayId]),
);

/**
 * Resolves any model identifier to a valid AI Gateway "provider/model" string.
 */
export function resolveGatewayModelId(modelId: string): string {
  const registered = MODEL_REGISTRY[modelId];
  if (registered) {
    return registered.gatewayId;
  }
  // If already in provider/model format, pass through
  if (modelId.includes("/")) {
    return modelId;
  }
  // Default prefix heuristics if bare name provided
  const m = modelId.toLowerCase();
  if (m.includes("gemini")) return `google/${modelId}`;
  if (m.includes("gpt") || m.includes("text-embedding")) return `openai/${modelId}`;
  if (m.includes("claude") || m.includes("sonnet")) return `anthropic/${modelId}`;
  return modelId;
}

/**
 * Extracts provider name from a model identifier.
 */
export function resolveProviderName(modelId: string): string {
  const registered = MODEL_REGISTRY[modelId];
  if (registered) {
    return registered.provider;
  }
  if (modelId.includes("/")) {
    return modelId.split("/")[0] ?? "gateway";
  }
  const resolved = resolveGatewayModelId(modelId);
  if (resolved.includes("/")) {
    return resolved.split("/")[0] ?? "gateway";
  }
  const m = modelId.toLowerCase();
  if (m.includes("claude") || m.includes("sonnet") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gpt") || m.includes("openai")) return "openai";
  if (m.includes("gemini") || m.includes("google")) return "google";
  return "gateway";
}

/**
 * Calculates estimated cost in USD based on model and token counts.
 */
export function calculateModelCost(
  modelId: string,
  tokensInput: number,
  tokensOutput: number,
): number {
  const registered = MODEL_REGISTRY[modelId];
  if (registered) {
    return (
      (tokensInput * registered.costPerMillionInputUsd) / 1_000_000 +
      (tokensOutput * registered.costPerMillionOutputUsd) / 1_000_000
    );
  }

  const m = modelId.toLowerCase();
  if (m.includes("gemini") || m.includes("google")) {
    return (tokensInput * 0.075 + tokensOutput * 0.3) / 1_000_000;
  }
  if (m.includes("gpt-4o-mini") || m.includes("luna")) {
    return (tokensInput * 0.15 + tokensOutput * 0.6) / 1_000_000;
  }
  if (m.includes("gpt") || m.includes("terra") || m.includes("openai")) {
    return (tokensInput * 2.5 + tokensOutput * 10.0) / 1_000_000;
  }
  if (m.includes("claude") || m.includes("sonnet") || m.includes("anthropic")) {
    return (tokensInput * 3.0 + tokensOutput * 15.0) / 1_000_000;
  }
  // Default baseline rate
  return (tokensInput * 0.075 + tokensOutput * 0.3) / 1_000_000;
}

type CompatProviderName = "groq" | "orcarouter";

/**
 * Service encapsulating Vercel AI SDK Core with either:
 * - Groq (OpenAI-compatible) when GROQ_API_KEY is set,
 * - OrcaRouter when ORCA_API_KEY is set,
 * - Vercel AI Gateway when AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN is set.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private gatewayInstance: GatewayProvider | null = null;
  private compatProvider: OpenAIProvider | null = null;
  private compatName: CompatProviderName | null = null;
  private compatDefaultModel: string | null = null;

  constructor() {
    this.initProviders();
  }

  /**
   * Priority: Groq → OrcaRouter → Vercel AI Gateway (API key over OIDC).
   */
  private initProviders(): void {
    this.compatProvider = null;
    this.compatName = null;
    this.compatDefaultModel = null;
    this.gatewayInstance = null;

    if (env.GROQ_API_KEY) {
      this.compatProvider = createOpenAI({
        apiKey: env.GROQ_API_KEY,
        baseURL: env.GROQ_BASE_URL,
        name: "groq",
      });
      this.compatName = "groq";
      this.compatDefaultModel = env.GROQ_MODEL;
      this.logger.log(
        `Groq provider initialized (baseURL=${env.GROQ_BASE_URL}, model=${env.GROQ_MODEL}).`,
      );
      return;
    }

    if (env.ORCA_API_KEY) {
      this.compatProvider = createOpenAI({
        apiKey: env.ORCA_API_KEY,
        baseURL: env.ORCA_BASE_URL,
        name: "orcarouter",
      });
      this.compatName = "orcarouter";
      this.compatDefaultModel = env.ORCA_MODEL;
      this.logger.log(
        `OrcaRouter provider initialized (baseURL=${env.ORCA_BASE_URL}, model=${env.ORCA_MODEL}).`,
      );
      return;
    }

    const apiKey = env.AI_GATEWAY_API_KEY;
    const oidcToken = env.VERCEL_OIDC_TOKEN;

    if (apiKey) {
      this.gatewayInstance = createGateway({
        apiKey,
      });
      this.logger.log("Vercel AI Gateway provider initialized with API key.");
    } else if (oidcToken) {
      this.gatewayInstance = createGateway({
        headers: { Authorization: `Bearer ${oidcToken}` },
      });
      this.logger.log("Vercel AI Gateway provider initialized with OIDC token.");
    }
  }

  private usesCompat(): boolean {
    return this.compatProvider !== null;
  }

  /**
   * Maps app model pins to the active OpenAI-compatible chat model.
   * Pass-through for provider-native ids (groq/orca/gpt-oss/…).
   */
  private resolveCompatChatModelId(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (
      lower.startsWith("orcarouter/") ||
      lower.startsWith("tencent/") ||
      lower.startsWith("openai/gpt-oss") ||
      lower.includes("hy4") ||
      lower.includes("gpt-oss")
    ) {
      return modelId;
    }
    return this.compatDefaultModel ?? modelId;
  }

  /**
   * Checks whether any AI provider credential is configured.
   */
  isConfigured(): boolean {
    return (
      this.compatProvider !== null ||
      this.gatewayInstance !== null ||
      Boolean(
        env.GROQ_API_KEY || env.ORCA_API_KEY || env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN,
      )
    );
  }

  /**
   * Returns the underlying GatewayProvider instance (Vercel path only).
   */
  getGateway(): GatewayProvider | null {
    if (!this.gatewayInstance && !this.compatProvider) {
      this.initProviders();
    }
    return this.gatewayInstance;
  }

  /**
   * Returns a language model for the active provider.
   */
  getLanguageModel(modelId: string): LanguageModel {
    if (this.usesCompat() && this.compatProvider) {
      return this.compatProvider.chat(this.resolveCompatChatModelId(modelId));
    }
    const gateway = this.getGateway();
    if (!gateway) {
      throw new Error(
        "AI Gateway is not configured. Please provide GROQ_API_KEY, ORCA_API_KEY, AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN.",
      );
    }
    const gatewayModelId = resolveGatewayModelId(modelId);
    return gateway(gatewayModelId);
  }

  /**
   * Returns an embedding model. Compat chat providers often lack embeddings —
   * callers already treat null/failure as soft degradation.
   */
  getEmbeddingModel(modelId = "openai/text-embedding-3-small"): EmbeddingModel {
    if (this.usesCompat() && this.compatProvider) {
      const gatewayModelId = resolveGatewayModelId(modelId);
      const bare = gatewayModelId.includes("/")
        ? (gatewayModelId.split("/")[1] ?? gatewayModelId)
        : gatewayModelId;
      return this.compatProvider.embedding(bare);
    }
    const gateway = this.getGateway();
    if (!gateway) {
      throw new Error(
        "AI Gateway is not configured. Please provide GROQ_API_KEY, ORCA_API_KEY, AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN.",
      );
    }
    const gatewayModelId = resolveGatewayModelId(modelId);
    return gateway.embeddingModel(gatewayModelId);
  }

  /**
   * Generate text using Vercel AI SDK routed through Vercel AI Gateway.
   */
  async generateText(params: {
    model: string;
    system?: string;
    prompt?: string;
    messages?: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
    tools?: ToolSet;
  }): Promise<AiGenerationResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const { model, system, prompt, messages, temperature, maxTokens, abortSignal, tools } = params;
    const gatewayModel = this.getLanguageModel(model);
    const resolvedModelId = this.usesCompat()
      ? this.resolveCompatChatModelId(model)
      : resolveGatewayModelId(model);
    const provider = this.usesCompat()
      ? (this.compatName ?? "compat")
      : resolveProviderName(resolvedModelId);

    try {
      const promptConfig =
        messages && messages.length > 0 ? { messages } : { prompt: prompt ?? "" };

      const response = await aiGenerateText({
        model: gatewayModel,
        ...(system ? { system } : {}),
        ...promptConfig,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
        ...(abortSignal ? { abortSignal } : {}),
        ...(tools ? { tools } : {}),
        ...(this.usesCompat()
          ? {}
          : {
              providerOptions: {
                openai: {
                  reasoningEffort: "low",
                },
              },
            }),
      });

      const tokensInput = response.usage.inputTokens ?? 0;
      const tokensOutput = response.usage.outputTokens ?? 0;
      const cost = calculateModelCost(resolvedModelId, tokensInput, tokensOutput);

      return {
        text: response.text,
        model: resolvedModelId,
        provider,
        tokensInput,
        tokensOutput,
        estimatedCostUsd: Number(cost.toFixed(6)),
      };
    } catch (err) {
      this.handleAiError(err, model, provider);
      throw err;
    }
  }

  /**
   * Generate structured data matching a Zod schema using Vercel AI SDK Output.object().
   */
  async generateStructured<T>(params: {
    model: string;
    schema: z.ZodType<T>;
    system?: string;
    prompt?: string;
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
  }): Promise<AiStructuredResult<T> | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const { model, schema, system, prompt, temperature, maxTokens, abortSignal } = params;
    const gatewayModel = this.getLanguageModel(model);
    const resolvedModelId = this.usesCompat()
      ? this.resolveCompatChatModelId(model)
      : resolveGatewayModelId(model);
    const provider = this.usesCompat()
      ? (this.compatName ?? "compat")
      : resolveProviderName(resolvedModelId);

    try {
      const response = await aiGenerateText({
        model: gatewayModel,
        output: Output.object({ schema }),
        ...(system ? { system } : {}),
        prompt: prompt ?? "",
        ...(temperature !== undefined ? { temperature } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
        ...(abortSignal ? { abortSignal } : {}),
        ...(this.usesCompat()
          ? {}
          : {
              providerOptions: {
                openai: {
                  reasoningEffort: "low",
                },
              },
            }),
      });

      const tokensInput = response.usage.inputTokens ?? 0;
      const tokensOutput = response.usage.outputTokens ?? 0;
      const cost = calculateModelCost(resolvedModelId, tokensInput, tokensOutput);

      return {
        object: response.output,
        model: resolvedModelId,
        provider,
        tokensInput,
        tokensOutput,
        estimatedCostUsd: Number(cost.toFixed(6)),
      };
    } catch (err) {
      this.handleAiError(err, model, provider);
      throw err;
    }
  }

  /**
   * Stream text response using Vercel AI SDK streamText().
   */
  streamText(params: {
    model: string;
    system?: string;
    prompt?: string;
    messages?: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
    tools?: ToolSet;
  }): ReturnType<typeof aiStreamText> {
    if (!this.isConfigured()) {
      throw new Error("AI Gateway is not configured. Cannot initiate stream.");
    }

    const { model, system, prompt, messages, temperature, maxTokens, abortSignal, tools } = params;
    const gatewayModel = this.getLanguageModel(model);
    const promptConfig = messages && messages.length > 0 ? { messages } : { prompt: prompt ?? "" };

    return aiStreamText({
      model: gatewayModel,
      ...(system ? { system } : {}),
      ...promptConfig,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(abortSignal ? { abortSignal } : {}),
      ...(tools ? { tools } : {}),
      ...(this.usesCompat()
        ? {}
        : {
            providerOptions: {
              openai: {
                reasoningEffort: "low",
              },
            },
          }),
    });
  }

  /**
   * Generate vector embedding for a single text using Vercel AI SDK embed().
   */
  async generateEmbedding(
    text: string,
    modelId = "openai/text-embedding-3-small",
  ): Promise<number[] | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const embeddingModel = this.getEmbeddingModel(modelId);
    try {
      const { embedding } = await aiEmbed({
        model: embeddingModel,
        value: text,
      });
      return embedding;
    } catch (err) {
      this.logger.warn({ err, modelId }, "Failed to generate embedding via AI Gateway");
      return null;
    }
  }

  /**
   * Generate vector embeddings for multiple texts using Vercel AI SDK embedMany().
   */
  async generateEmbeddings(
    texts: string[],
    modelId = "openai/text-embedding-3-small",
  ): Promise<number[][] | null> {
    if (!this.isConfigured() || texts.length === 0) {
      return null;
    }

    const embeddingModel = this.getEmbeddingModel(modelId);
    try {
      const { embeddings } = await aiEmbedMany({
        model: embeddingModel,
        values: texts,
      });
      return embeddings;
    } catch (err) {
      this.logger.warn(
        { err, modelId, count: texts.length },
        "Failed to generate batch embeddings via AI Gateway",
      );
      return null;
    }
  }

  /**
   * Normalizes and logs AI SDK errors safely without leaking internal secrets.
   */
  private handleAiError(err: unknown, model: string, provider: string): void {
    if (err instanceof APICallError) {
      this.logger.warn(
        {
          statusCode: err.statusCode,
          isRetryable: err.isRetryable,
          model,
          provider,
        },
        "AI Gateway API Call Error occurred",
      );
    } else if (err instanceof AISDKError) {
      this.logger.warn(
        {
          name: err.name,
          message: err.message,
          model,
          provider,
        },
        "AI SDK Core Error occurred",
      );
    } else {
      this.logger.warn(
        {
          err,
          model,
          provider,
        },
        "Unexpected AI Error occurred",
      );
    }
  }
}
