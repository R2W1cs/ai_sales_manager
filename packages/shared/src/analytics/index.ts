import { z } from "zod";

export const AnalyticsPeriodSchema = z.enum(["7d", "30d", "90d"]);
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>;

export const AnalyticsOverviewQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD format")
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD format")
      .optional(),
    period: AnalyticsPeriodSchema.optional(),
  })
  .refine(
    (data) => {
      // Partial range rejection: must provide both from and to, or neither
      if ((data.from && !data.to) || (!data.from && data.to)) {
        return false;
      }
      // Conflicting parameters: cannot supply period together with from or to
      if (data.period && (data.from || data.to)) {
        return false;
      }
      return true;
    },
    {
      message:
        "Provide either 'period' or both 'from' and 'to' dates (not both, and not partial dates)",
    },
  );
export type AnalyticsOverviewQueryDto = z.infer<typeof AnalyticsOverviewQuerySchema>;

export const DailyMetricPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gmv: z.number().int().nonnegative(),
  ordersCount: z.number().int().nonnegative(),
  ordersCreated: z.number().int().nonnegative().optional(),
  conversationsCount: z.number().int().nonnegative(),
  aiResolutionRate: z.number().min(0).max(1).nullable(),
  messagesHandled: z.number().int().nonnegative().optional(),
  messagesAi: z.number().int().nonnegative().optional(),
  messagesHuman: z.number().int().nonnegative().optional(),
  handoffsTotal: z.number().int().nonnegative().optional(),
  handoffsByReason: z.record(z.string(), z.number().int().nonnegative()).default({}).optional(),
  conversionConfirmed: z.number().int().nonnegative().optional(),
  conversionAiPending: z.number().int().nonnegative().optional(),
  conversion: z.number().min(0).max(1).nullable().optional(),
});
export type DailyMetricPoint = z.infer<typeof DailyMetricPointSchema>;

export const AnalyticsTrendsSchema = z.object({
  gmvDelta: z.number().nullable(),
  ordersDelta: z.number().nullable(),
  conversationsDelta: z.number().nullable(),
  aiResolutionRateDelta: z.number().nullable(),
  messagesHandledDelta: z.number().nullable().optional(),
  conversionDelta: z.number().nullable().optional(),
});
export type AnalyticsTrends = z.infer<typeof AnalyticsTrendsSchema>;

export const AnalyticsOverviewSummarySchema = z.object({
  gmv: z.number().int().nonnegative(),
  ordersCount: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative().optional(),
  ordersCreated: z.number().int().nonnegative(),
  conversationsCount: z.number().int().nonnegative(),
  conversations: z.number().int().nonnegative().optional(),
  aiResolutionRate: z.number().min(0).max(1).nullable(),
  messagesHandled: z.number().int().nonnegative(),
  messagesAi: z.number().int().nonnegative(),
  messagesHuman: z.number().int().nonnegative(),
  avgResponseTimeMs: z.number().int().nonnegative(),
  handoffsTotal: z.number().int().nonnegative(),
  handoffsByReason: z.record(z.string(), z.number().int().nonnegative()).default({}),
  conversionConfirmed: z.number().int().nonnegative(),
  conversionAiPending: z.number().int().nonnegative(),
  conversion: z.number().min(0).max(1).nullable(),
  conversionRate: z.number().min(0).max(1).nullable().optional(),
  trends: AnalyticsTrendsSchema.optional(),
});
export type AnalyticsOverviewSummary = z.infer<typeof AnalyticsOverviewSummarySchema>;

export const AnalyticsOverviewResponseSchema = z.object({
  summary: AnalyticsOverviewSummarySchema,
  timeseries: z.array(DailyMetricPointSchema),
  trends: AnalyticsTrendsSchema.optional(),
});
export type AnalyticsOverviewResponse = z.infer<typeof AnalyticsOverviewResponseSchema>;
