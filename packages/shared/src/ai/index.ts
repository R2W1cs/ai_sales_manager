import { z } from "zod";

import {
  ReplyModeSchema,
  CANONICAL_INTENTS,
  CanonicalIntentSchema,
  type CanonicalIntent,
} from "../enums";
import { SalesStrategySchema } from "../jsonb";

export { CANONICAL_INTENTS, CanonicalIntentSchema, type CanonicalIntent };

/**
 * 11 §9.0 / §9.3 Allowed Model IDs for Response Generator / AI settings
 */
export const ALLOWED_PRIMARY_MODELS = [
  "gemini-3.5-flash",
  "gpt-5.6-terra",
  "claude-sonnet-5",
] as const;

export const AllowedPrimaryModelSchema = z.enum(ALLOWED_PRIMARY_MODELS);
export type AllowedPrimaryModel = z.infer<typeof AllowedPrimaryModelSchema>;

export const ALLOWED_FALLBACK_MODELS = [
  "gpt-5.6-terra",
  "claude-sonnet-5",
  "gemini-3.5-flash",
] as const;

export const AllowedFallbackModelSchema = z.enum(ALLOWED_FALLBACK_MODELS);
export type AllowedFallbackModel = z.infer<typeof AllowedFallbackModelSchema>;

/**
 * All valid pinned LLM model IDs across stages (11 §9.0)
 */
export const PINNED_MODEL_IDS = [
  "gemini-3.5-flash",
  "gpt-5.6-terra",
  "claude-sonnet-5",
  "gpt-5.6-luna",
  "text-embedding-3-small",
] as const;

export const PinnedModelIdSchema = z.enum(PINNED_MODEL_IDS);
export type PinnedModelId = z.infer<typeof PinnedModelIdSchema>;

/**
 * Entities extracted from conversational customer messages
 */
export const ExtractedEntitiesSchema = z.object({
  product: z.string().optional(),
  variant: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  orderReference: z.string().optional(),
  location: z.string().optional(),
});
export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;

/**
 * Classification source
 */
export const ClassifierSourceSchema = z.enum(["rule", "llm"]);
export type ClassifierSource = z.infer<typeof ClassifierSourceSchema>;

/**
 * Deterministic rule match result
 */
export const RuleMatchSchema = z.object({
  intent: CanonicalIntentSchema,
  confidence: z.number().min(0).max(1),
  matchedRule: z.string(),
  secondary: z.array(CanonicalIntentSchema).default([]),
  entities: ExtractedEntitiesSchema.optional(),
});
export type RuleMatch = z.infer<typeof RuleMatchSchema>;

/**
 * Structured Output Intent Classification Schema
 */
export const IntentClassificationSchema = z.object({
  intent: CanonicalIntentSchema,
  confidence: z.number().min(0).max(1),
  secondary: z.array(CanonicalIntentSchema).default([]),
  entities: ExtractedEntitiesSchema.default({}),
  matchedRule: z.string().optional(),
  source: ClassifierSourceSchema.default("rule"),
  latencyMs: z.number().default(0),
  model: z.string().optional(),
});
export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

/**
 * 13 §11 / 12 §11 AI Agent DTO & Update Schema
 */
export const UpdateAiAgentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  personality: z.string().trim().max(1000).nullable().optional(),
  language: z.string().trim().min(2).max(10).optional(),
  tone: z.string().trim().max(200).nullable().optional(),
  salesStrategy: SalesStrategySchema.nullable().optional(),
  greetingTemplate: z.string().trim().max(1000).nullable().optional(),
  fallbackTemplate: z.string().trim().max(1000).nullable().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  enabled: z.boolean().optional(),
});

export type UpdateAiAgentDto = z.infer<typeof UpdateAiAgentSchema>;

export const AiAgentResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  name: z.string(),
  personality: z.string().nullable(),
  language: z.string(),
  tone: z.string().nullable(),
  salesStrategy: SalesStrategySchema.nullable(),
  greetingTemplate: z.string().nullable(),
  fallbackTemplate: z.string().nullable(),
  confidenceThreshold: z.number(),
  enabled: z.boolean(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type AiAgentResponse = z.infer<typeof AiAgentResponseSchema>;

/**
 * 13 §11 / 12 §11 AI Settings DTO & Update Schema
 */
export const UpdateAiSettingsSchema = z.object({
  modelPrimary: AllowedPrimaryModelSchema.optional(),
  modelFallback: AllowedFallbackModelSchema.optional(),
  maxTokens: z.number().int().min(50).max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  ragTopK: z.number().int().min(1).max(20).optional(),
  includeProductImagesInContext: z.boolean().optional(),
  blockedTopics: z.array(z.string().trim().min(1)).optional(),
  customSystemAppend: z.string().trim().max(2000).nullable().optional(),
  replyMode: ReplyModeSchema.optional(),
  leadHotMin: z.number().int().min(0).max(100).optional(),
  leadWarmMin: z.number().int().min(0).max(100).optional(),
  reservationTtlMinutes: z.number().int().min(1).max(1440).optional(),
  inactivityCloseDays: z.number().int().min(1).max(365).optional(),
  monthlyAiBudgetUsd: z.string().nullable().optional(),
});

export type UpdateAiSettingsDto = z.infer<typeof UpdateAiSettingsSchema>;

export const AiSettingsResponseSchema = z.object({
  businessId: z.uuid(),
  modelPrimary: z.string(),
  modelFallback: z.string(),
  maxTokens: z.number(),
  temperature: z.number(),
  ragTopK: z.number(),
  includeProductImagesInContext: z.boolean(),
  blockedTopics: z.array(z.string()),
  customSystemAppend: z.string().nullable(),
  replyMode: ReplyModeSchema,
  leadHotMin: z.number(),
  leadWarmMin: z.number(),
  reservationTtlMinutes: z.number(),
  inactivityCloseDays: z.number(),
  monthlyAiBudgetUsd: z.string().nullable(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type AiSettingsResponse = z.infer<typeof AiSettingsResponseSchema>;

/**
 * 13 §11 / 15 §3 Playground Simulation Scenarios & Prompts
 */
export const PlaygroundScenarioEnum = z.enum(["price", "angry", "buying_intent", "recommendation"]);
export type PlaygroundScenario = z.infer<typeof PlaygroundScenarioEnum>;

export const PLAYGROUND_SCENARIO_PROMPTS: Record<PlaygroundScenario, string> = {
  price: "Bonjour, quel est le prix et la disponibilité de vos produits ?",
  angry: "Je suis très insatisfait de ma commande, je veux un remboursement immédiat !",
  buying_intent:
    "Bonjour, je souhaite commander cet article en taille M, comment passer commande ?",
  recommendation: "Bonjour, que me conseillez-vous pour un cadeau d'anniversaire ?",
};

/**
 * 13 §11 / 15 §3 POST /api/v1/ai/playground input schema
 * Accepts either a free-form message or a canned simulation scenario.
 * Standardizes strictly on 'message' as canonical field.
 */
export const PlaygroundSimulateSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Simulation message cannot be empty")
      .max(2000, "Simulation message cannot exceed 2000 characters")
      .optional(),
    conversationId: z.string().trim().min(1).optional(),
    scenario: PlaygroundScenarioEnum.optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .refine((data) => !(data.message && data.scenario), {
    message:
      "Cannot specify both free-form message and scenario; provide only one simulation definition",
  })
  .refine((data) => Boolean(data.message || data.scenario), {
    message: "Either message or scenario must be provided",
  });

export type PlaygroundSimulateDto = z.input<typeof PlaygroundSimulateSchema>;

/**
 * 13 §11 / 15 §3 Playground Simulation Response Schema & Type
 */
export const PlaygroundSimulateResponseSchema = z.object({
  response: z.string(),
  executionSummary: z.string(),
  explanation: z.string(),
  reasoning: z.string().optional(),
  toolCalls: z.array(z.string()),
  handoffTriggered: z.boolean(),
  handoffReason: z.string().optional(),
  conversationId: z.string(),
  decisionTraceId: z.string().optional(),
  groundingPassed: z.boolean(),
  usage: z
    .object({
      provider: z.string(),
      model: z.string(),
      tokensInput: z.number(),
      tokensOutput: z.number(),
      estimatedCostUsd: z.number(),
    })
    .optional(),
});

export type PlaygroundSimulateResponse = z.infer<typeof PlaygroundSimulateResponseSchema>;
