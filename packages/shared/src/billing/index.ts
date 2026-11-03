import { z } from "zod";

import { UsageMetricSchema, type UsageMetric } from "../enums";
import { PlanLimitsSchema, type PlanLimits } from "../jsonb";

export const PlanTierSchema = z.enum(["starter", "growth", "scale"]);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const PlanResponseSchema = z.object({
  id: z.uuid().optional(),
  code: z.string(),
  name: z.string(),
  limits: PlanLimitsSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type PlanDto = PlanResponse;

/**
 * 🔒 Canonical Plan Quotas (12 §12.1, 12 §14.4, T-BILL-01 invariants):
 * - Starter: 2 seats, 1 channel, 500 AI messages/mo
 * - Growth: 5 seats, 3 channels, 3,000 AI messages/mo
 * - Scale: 15 seats, 10 channels, 15,000 AI messages/mo
 */
export const CANONICAL_PLANS: Record<
  PlanTier,
  { code: PlanTier; name: string; limits: PlanLimits }
> = {
  starter: {
    code: "starter",
    name: "Starter",
    limits: {
      seats: 2,
      channel_accounts: 1,
      ai_messages_per_month: 500,
      max_ai_replies_per_month: 500,
      max_conversations: null,
      monthly_ai_budget_usd: null,
    },
  },
  growth: {
    code: "growth",
    name: "Growth",
    limits: {
      seats: 5,
      channel_accounts: 3,
      ai_messages_per_month: 3000,
      max_ai_replies_per_month: 3000,
      max_conversations: null,
      monthly_ai_budget_usd: null,
    },
  },
  scale: {
    code: "scale",
    name: "Scale",
    limits: {
      seats: 15,
      channel_accounts: 10,
      ai_messages_per_month: 15000,
      max_ai_replies_per_month: 15000,
      max_conversations: null,
      monthly_ai_budget_usd: null,
    },
  },
};

export const TUNISIA_TIMEZONE = "Africa/Tunis";

/**
 * 🔒 Usage Metering & Aggregates Schemas (12 §12.3-12.4, T-BILL-02)
 */
export const RecordUsageSchema = z.object({
  businessId: z.uuid({ message: "businessId must be a valid UUID" }),
  metric: UsageMetricSchema,
  quantity: z
    .number()
    .int({ message: "quantity must be an integer" })
    .min(1, { message: "quantity must be a positive integer >= 1" })
    .default(1),
  isTest: z.boolean().default(false),
  recordedAt: z.coerce.date().optional(),
});
export type RecordUsageDto = z.infer<typeof RecordUsageSchema>;

export const UsageEventResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  metric: UsageMetricSchema,
  quantity: z.number().int(),
  periodBucket: z.string(), // ISO Date string (YYYY-MM-DD)
  isTest: z.boolean(),
  recordedAt: z.string(), // ISO Timestamptz
});
export type UsageEventDto = z.infer<typeof UsageEventResponseSchema>;

export const UsageAggregateResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  periodStart: z.string(), // ISO Timestamptz
  periodEnd: z.string(), // ISO Timestamptz
  metric: UsageMetricSchema,
  quantity: z.number().int(),
  updatedAt: z.string(), // ISO Timestamptz
});
export type UsageAggregateDto = z.infer<typeof UsageAggregateResponseSchema>;

export const SyncUsageAggregatesJobDataSchema = z
  .object({
    businessId: z.uuid({ message: "businessId must be a valid UUID" }).optional(),
    periodStart: z.iso.datetime({ message: "periodStart must be a valid ISO datetime" }).optional(),
    periodEnd: z.iso.datetime({ message: "periodEnd must be a valid ISO datetime" }).optional(),
    hour: z
      .string()
      .refine(
        (val) => {
          const dateStr = val.length === 13 && !val.includes(":") ? `${val}:00:00.000Z` : val;
          const ref = new Date(dateStr);
          return !isNaN(ref.getTime());
        },
        { message: "hour must be a valid date or timestamp string" },
      )
      .optional(),
    referenceTime: z.iso
      .datetime({ message: "referenceTime must be a valid ISO datetime" })
      .optional(),
    enqueuedAt: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if ((data.periodStart && !data.periodEnd) || (!data.periodStart && data.periodEnd)) {
        return false;
      }
      if (data.periodStart && data.periodEnd) {
        return new Date(data.periodStart).getTime() < new Date(data.periodEnd).getTime();
      }
      return true;
    },
    {
      message:
        "periodStart and periodEnd must both be provided together, and periodStart must be strictly before periodEnd",
      path: ["periodStart"],
    },
  );
export type SyncUsageAggregatesJobData = z.infer<typeof SyncUsageAggregatesJobDataSchema>;

/**
 * 🔒 Quota Enforcement & Usage Response Schemas (13 §13, T-BILL-03)
 */
export const BillingLimitsSchema = z.object({
  aiMessages: z.number().int().nonnegative(),
  seats: z.number().int().nonnegative(),
  channels: z.number().int().nonnegative(),
});
export type BillingLimits = z.infer<typeof BillingLimitsSchema>;

export const BillingCurrentUsageSchema = z.object({
  aiMessages: z.number().int().nonnegative(),
  seats: z.number().int().nonnegative(),
  channels: z.number().int().nonnegative(),
});
export type BillingCurrentUsage = z.infer<typeof BillingCurrentUsageSchema>;

export const BillingUsageResponseSchema = z.object({
  cycleStart: z.string(),
  cycleEnd: z.string(),
  planCode: z.string(),
  limits: BillingLimitsSchema,
  current: BillingCurrentUsageSchema,
  percentUsed: z.number(),
  aiPaused: z.boolean(),
});
export type BillingUsageResponse = z.infer<typeof BillingUsageResponseSchema>;
export type BillingUsageDto = BillingUsageResponse;

export type { UsageMetric };
