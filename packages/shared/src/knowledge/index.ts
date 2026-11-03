import { z } from "zod";

import { RuleTypeSchema, type RuleType } from "../enums";
import {
  DeliveryRulePayloadSchema,
  PaymentRulePayloadSchema,
  ReturnsRulePayloadSchema,
  WorkingHoursPayloadSchema,
  DiscountRulePayloadSchema,
  MinOrderPayloadSchema,
  FreeShippingPayloadSchema,
} from "../jsonb";
export type { RuleType };

/**
 * Registry mapping every accepted alias → { canonical RuleType, payload Zod schema }.
 * Single source of truth: add a rule type here to update both normalisation and
 * validation automatically — no parallel switch/if chains.
 */
interface RuleRegistryEntry {
  canonical: RuleType;
  schema: z.ZodType;
}

export const RULE_REGISTRY: Readonly<Record<string, RuleRegistryEntry>> = {
  // delivery
  delivery: { canonical: "delivery", schema: DeliveryRulePayloadSchema },
  shipping: { canonical: "delivery", schema: DeliveryRulePayloadSchema },
  // payment
  payment: { canonical: "payment", schema: PaymentRulePayloadSchema },
  payments: { canonical: "payment", schema: PaymentRulePayloadSchema },
  // returns
  returns: { canonical: "returns", schema: ReturnsRulePayloadSchema },
  return: { canonical: "returns", schema: ReturnsRulePayloadSchema },
  return_policy: { canonical: "returns", schema: ReturnsRulePayloadSchema },
  // working_hours
  working_hours: { canonical: "working_hours", schema: WorkingHoursPayloadSchema },
  workinghours: { canonical: "working_hours", schema: WorkingHoursPayloadSchema },
  hours: { canonical: "working_hours", schema: WorkingHoursPayloadSchema },
  // discount
  discount: { canonical: "discount", schema: DiscountRulePayloadSchema },
  discounts: { canonical: "discount", schema: DiscountRulePayloadSchema },
  // min_order
  min_order: { canonical: "min_order", schema: MinOrderPayloadSchema },
  minorder: { canonical: "min_order", schema: MinOrderPayloadSchema },
  // free_shipping
  free_shipping: { canonical: "free_shipping", schema: FreeShippingPayloadSchema },
  freeshipping: { canonical: "free_shipping", schema: FreeShippingPayloadSchema },
};

/**
 * Returns the canonical RuleType for any accepted alias.
 * Falls through to the raw normalised string for unknown types so that Zod
 * validation downstream can produce a useful error.
 */
export function normalizeRuleType(type: string): RuleType {
  const key = type.toLowerCase().trim();
  return RULE_REGISTRY[key]?.canonical ?? (key as RuleType);
}

/**
 * Validates payload against the strict Zod schema for the given rule type (12 §14.8).
 * Throws ZodError on failure.
 */
export function validateRulePayload(ruleType: string, payload: unknown): unknown {
  const key = ruleType.toLowerCase().trim();
  const entry = RULE_REGISTRY[key];
  if (!entry) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["ruleType"],
        message: `Unknown or unsupported rule type: ${ruleType}`,
      },
    ]);
  }
  return entry.schema.parse(payload);
}

/**
 * 13 §12.4 POST /api/v1/business-rules Request Schema
 */
export const CreateBusinessRuleSchema = z
  .object({
    ruleType: z.string().trim().min(1).optional(),
    rule_type: z.string().trim().min(1).optional(),
    payload: z.unknown(),
    priority: z.number().int().min(0).default(100).optional(),
    enabled: z.boolean().default(true).optional(),
    is_enabled: z.boolean().optional(),
    effectiveFrom: z.union([z.date(), z.string()]).optional(),
    effective_from: z.union([z.date(), z.string()]).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.ruleType ?? data.rule_type), {
    message: "ruleType is required",
    path: ["ruleType"],
  });

export type CreateBusinessRuleDto = z.infer<typeof CreateBusinessRuleSchema>;

/**
 * 13 §12.4 PATCH /api/v1/business-rules/:id Request Schema.
 * `payload` is intentionally absent — `.strict()` rejects any unknown key including
 * `payload`, giving callers an unambiguous 400 without the confusing declare-then-refine pattern.
 */
export const UpdateBusinessRuleSchema = z
  .object({
    enabled: z.boolean().optional(),
    is_enabled: z.boolean().optional(),
    effectiveTo: z.union([z.date(), z.string(), z.null()]).optional(),
    effective_to: z.union([z.date(), z.string(), z.null()]).optional(),
  })
  .strict();

export type UpdateBusinessRuleDto = z.infer<typeof UpdateBusinessRuleSchema>;

/**
 * 13 §12.4 Business Rule Response Schema
 */
export const BusinessRuleResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  ruleType: RuleTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  priority: z.number().int(),
  enabled: z.boolean(),
  effectiveFrom: z.union([z.date(), z.string()]),
  effectiveTo: z.union([z.date(), z.string(), z.null()]),
  createdAt: z.union([z.date(), z.string()]),
  version: z.number().int().positive().optional(),
});

export type BusinessRuleResponse = z.infer<typeof BusinessRuleResponseSchema>;

const boolQueryParam = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((val) => val === true || val === "true");

/**
 * 13 §12.4 GET /api/v1/business-rules Query Schema
 */
export const ListBusinessRulesQuerySchema = z.object({
  ruleType: z.string().optional(),
  rule_type: z.string().optional(),
  effectiveAt: z.union([z.date(), z.string()]).optional(),
  effective_at: z.union([z.date(), z.string()]).optional(),
  asOf: z.union([z.date(), z.string()]).optional(),
  as_of: z.union([z.date(), z.string()]).optional(),
  history: boolQueryParam.optional(),
  includeHistory: boolQueryParam.optional(),
  /** Pass flat=true to receive a flat array instead of the default grouped-by-type object. */
  flat: boolQueryParam.optional(),
});

export type ListBusinessRulesQueryDto = z.infer<typeof ListBusinessRulesQuerySchema>;

/**
 * 13 §12.3 Knowledge Document validation schemas and DTOs
 */

export const CreateKnowledgeDocumentSchema = z
  .object({
    title: z.string().trim().min(1, "title is required"),
    content: z.string().trim().min(1).optional(),
    rawText: z.string().trim().min(1).optional(),
    raw_text: z.string().trim().min(1).optional(),
    category: z.string().trim().optional(),
    sourceType: z.string().trim().optional(),
    source_type: z.string().trim().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.content || data.rawText || data.raw_text), {
    message: "content or raw_text is required",
    path: ["content"],
  });

export type CreateKnowledgeDocumentDto = z.infer<typeof CreateKnowledgeDocumentSchema>;
export type CreateDocumentDto = CreateKnowledgeDocumentDto;

export const UpdateKnowledgeDocumentSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    rawText: z.string().trim().min(1).optional(),
    raw_text: z.string().trim().min(1).optional(),
    category: z.string().trim().optional(),
    sourceType: z.string().trim().optional(),
    source_type: z.string().trim().optional(),
  })
  .strict();

export type UpdateKnowledgeDocumentDto = z.infer<typeof UpdateKnowledgeDocumentSchema>;
export type UpdateDocumentDto = UpdateKnowledgeDocumentDto;

export const KnowledgeDocumentResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  title: z.string(),
  sourceType: z.string(),
  rawText: z.string(),
  contentHash: z.string(),
  indexingStatus: z.enum(["pending", "indexing", "ready", "failed"]),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type KnowledgeDocumentResponse = z.infer<typeof KnowledgeDocumentResponseSchema>;

export const ListKnowledgeDocumentsQuerySchema = z.object({
  sourceType: z.string().optional(),
  source_type: z.string().optional(),
  status: z.enum(["pending", "indexing", "ready", "failed"]).optional(),
  indexingStatus: z.enum(["pending", "indexing", "ready", "failed"]).optional(),
  indexing_status: z.enum(["pending", "indexing", "ready", "failed"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
});

export type ListKnowledgeDocumentsQueryDto = z.infer<typeof ListKnowledgeDocumentsQuerySchema>;
