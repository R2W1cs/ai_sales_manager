import { z } from "zod";

import { MembershipSchema } from "../auth";

/**
 * 13 §5 POST /api/v1/businesses Request Schema
 */
export const CreateBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
  currency: z.string().default("TND").optional(),
  timezone: z.string().default("Africa/Tunis").optional(),
  country: z.string().default("TN").optional(),
  defaultLanguage: z.enum(["fr", "ar"]).default("fr").optional(),
  industry: z.string().default("fashion").optional(),
  phone: z.string().nullable().optional(),
});

export type CreateBusinessDto = z.infer<typeof CreateBusinessSchema>;

/**
 * 13 §3.1 Business DTO
 */
export const BusinessDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  industry: z.string(),
  country: z.string(),
  defaultLanguage: z.string(),
  timezone: z.string(),
  currency: z.string(),
  createdAt: z.union([z.date(), z.iso.datetime()]),
});

export type BusinessDto = z.infer<typeof BusinessDtoSchema>;

/**
 * 13 §3.1 AI Agent DTO
 */
export const AiAgentDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  language: z.string(),
  confidenceThreshold: z.number(),
  enabled: z.boolean(),
});

export type AiAgentDto = z.infer<typeof AiAgentDtoSchema>;

/**
 * 13 §3.1 Onboarding DTO
 */
export const OnboardingDtoSchema = z.object({
  businessCreated: z.boolean(),
  channelConnected: z.boolean(),
  productsImported: z.boolean(),
  aiConfigured: z.boolean(),
  playgroundPassed: z.boolean(),
  approvalTrialPassed: z.boolean(),
  handoffAcknowledged: z.boolean(),
  aiActivated: z.boolean(),
});

export type OnboardingDto = z.infer<typeof OnboardingDtoSchema>;

/**
 * 13 §5 POST /api/v1/businesses Response Schema
 */
export const CreateBusinessResponseSchema = z.object({
  business: BusinessDtoSchema,
  membership: MembershipSchema,
  aiAgent: AiAgentDtoSchema,
  onboarding: OnboardingDtoSchema,
});

export type CreateBusinessResponse = z.infer<typeof CreateBusinessResponseSchema>;
