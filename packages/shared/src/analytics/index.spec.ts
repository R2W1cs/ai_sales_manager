import {
  AnalyticsPeriodSchema,
  AnalyticsOverviewQuerySchema,
  DailyMetricPointSchema,
  AnalyticsOverviewSummarySchema,
  AnalyticsOverviewResponseSchema,
} from "./index";

describe("Analytics Shared DTOs and Schemas", () => {
  it("validates allowed periods", () => {
    expect(AnalyticsPeriodSchema.safeParse("7d").success).toBe(true);
    expect(AnalyticsPeriodSchema.safeParse("30d").success).toBe(true);
    expect(AnalyticsPeriodSchema.safeParse("90d").success).toBe(true);
    expect(AnalyticsPeriodSchema.safeParse("180d").success).toBe(false);
  });

  it("validates overview query params", () => {
    // Valid: period only
    expect(
      AnalyticsOverviewQuerySchema.safeParse({
        period: "30d",
      }).success,
    ).toBe(true);

    // Valid: custom range with both from and to
    expect(
      AnalyticsOverviewQuerySchema.safeParse({
        from: "2026-08-01",
        to: "2026-08-31",
      }).success,
    ).toBe(true);

    // Invalid: partial range with only from
    expect(
      AnalyticsOverviewQuerySchema.safeParse({
        from: "2026-08-01",
      }).success,
    ).toBe(false);

    // Invalid: partial range with only to
    expect(
      AnalyticsOverviewQuerySchema.safeParse({
        to: "2026-08-31",
      }).success,
    ).toBe(false);

    // Invalid: conflicting period and custom range
    expect(
      AnalyticsOverviewQuerySchema.safeParse({
        from: "2026-08-01",
        to: "2026-08-31",
        period: "30d",
      }).success,
    ).toBe(false);

    // Invalid date format
    expect(
      AnalyticsOverviewQuerySchema.safeParse({
        from: "invalid-date",
        to: "2026-08-31",
      }).success,
    ).toBe(false);
  });

  it("validates summary and timeseries schemas", () => {
    const validSummary = {
      gmv: 14250000,
      ordersCount: 85,
      orders: 85,
      ordersCreated: 90,
      conversationsCount: 340,
      conversations: 340,
      aiResolutionRate: 0.82,
      messagesHandled: 1500,
      messagesAi: 1240,
      messagesHuman: 260,
      avgResponseTimeMs: 850,
      handoffsTotal: 15,
      handoffsByReason: { human_request: 10, complaint: 5 },
      conversionConfirmed: 30,
      conversionAiPending: 50,
      conversion: 0.6,
      conversionRate: 0.6,
    };

    expect(AnalyticsOverviewSummarySchema.safeParse(validSummary).success).toBe(true);

    // Allows summary without optional aliases
    const {
      orders: _orders,
      conversations: _conversations,
      conversionRate: _conversionRate,
      ...coreSummary
    } = validSummary;
    expect(AnalyticsOverviewSummarySchema.safeParse(coreSummary).success).toBe(true);

    const validTimeseriesPoint = {
      date: "2026-08-27",
      gmv: 520000,
      ordersCount: 4,
      ordersCreated: 4,
      conversationsCount: 18,
      aiResolutionRate: 0.85,
      messagesHandled: 20,
      messagesAi: 16,
      messagesHuman: 4,
      handoffsTotal: 1,
      handoffsByReason: { complaint: 1 },
      conversionConfirmed: 2,
      conversionAiPending: 3,
      conversion: 0.6667,
    };

    expect(DailyMetricPointSchema.safeParse(validTimeseriesPoint).success).toBe(true);

    expect(
      AnalyticsOverviewResponseSchema.safeParse({
        summary: validSummary,
        timeseries: [validTimeseriesPoint],
      }).success,
    ).toBe(true);
  });
});
