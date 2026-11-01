/**
 * Automated TDD Test Suite for T-WEB-09 — Web Analytics Dashboard UI (`/analytics`)
 * Generated from backlog card acceptance criteria.
 */

import { NextIntlClientProvider } from "next-intl";
/// <reference types="jest" />
import React from "react";
import { renderToString } from "react-dom/server";

import { AiResolutionChart } from "@/components/analytics/ai-resolution-chart";
import {
  formatDeltaPercent,
  formatDeltaPoints,
  formatGmvMoney,
} from "@/components/analytics/analytics-formatters";
import { AnalyticsKpiCards } from "@/components/analytics/analytics-kpi-cards";
import { RevenueChart } from "@/components/analytics/revenue-chart";
import { TenantContext, type TenantContextValue } from "@/components/layout/tenant-context";
import messages from "@/i18n/messages/fr.json";
import type { AnalyticsOverviewResponse, DailyMetricPoint } from "@app/shared";

import AnalyticsPage from "./page";

// Mock api-client
const mockTimeseries: DailyMetricPoint[] = [
  {
    date: "2026-09-01",
    gmv: 450000,
    ordersCount: 4,
    ordersCreated: 4,
    conversationsCount: 18,
    aiResolutionRate: 0.88,
    messagesHandled: 42,
    messagesAi: 37,
    messagesHuman: 5,
    handoffsTotal: 2,
    handoffsByReason: { UNKNOWN_INTENT: 2 },
    conversionConfirmed: 3,
    conversionAiPending: 4,
    conversion: 0.75,
  },
  {
    date: "2026-09-02",
    gmv: 720000,
    ordersCount: 6,
    ordersCreated: 6,
    conversationsCount: 25,
    aiResolutionRate: 0.92,
    messagesHandled: 60,
    messagesAi: 55,
    messagesHuman: 5,
    handoffsTotal: 1,
    handoffsByReason: { HUMAN_REQUESTED: 1 },
    conversionConfirmed: 5,
    conversionAiPending: 6,
    conversion: 0.8333,
  },
  {
    date: "2026-09-03",
    gmv: 1250000,
    ordersCount: 10,
    ordersCreated: 10,
    conversationsCount: 34,
    aiResolutionRate: 0.85,
    messagesHandled: 85,
    messagesAi: 72,
    messagesHuman: 13,
    handoffsTotal: 4,
    handoffsByReason: { NEGOTIATION: 4 },
    conversionConfirmed: 8,
    conversionAiPending: 10,
    conversion: 0.8,
  },
];

const mockAnalyticsData: AnalyticsOverviewResponse = {
  summary: {
    gmv: 2420000,
    ordersCount: 20,
    orders: 20,
    ordersCreated: 20,
    conversationsCount: 77,
    conversations: 77,
    aiResolutionRate: 0.88,
    messagesHandled: 187,
    messagesAi: 164,
    messagesHuman: 23,
    avgResponseTimeMs: 1250,
    handoffsTotal: 7,
    handoffsByReason: { UNKNOWN_INTENT: 2, HUMAN_REQUESTED: 1, NEGOTIATION: 4 },
    conversionConfirmed: 16,
    conversionAiPending: 20,
    conversion: 0.8,
    conversionRate: 0.8,
    trends: {
      gmvDelta: 0.142,
      ordersDelta: 0.085,
      conversationsDelta: -0.034,
      aiResolutionRateDelta: 0.045,
      messagesHandledDelta: 0.12,
      conversionDelta: 0.02,
    },
  },
  timeseries: mockTimeseries,
  trends: {
    gmvDelta: 0.142,
    ordersDelta: 0.085,
    conversationsDelta: -0.034,
    aiResolutionRateDelta: 0.045,
    messagesHandledDelta: 0.12,
    conversionDelta: 0.02,
  },
};

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes("/analytics/overview")) {
        return Promise.resolve(mockAnalyticsData);
      }
      return Promise.resolve({});
    }),
    post: jest.fn().mockResolvedValue({}),
    patch: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details?: unknown,
      public raw?: unknown,
    ) {
      super(message);
    }
  },
}));

function renderWithProviders(
  ui: React.ReactElement,
  tenantValue: Partial<TenantContextValue> = {},
  locale = "fr",
): string {
  const defaultTenant: TenantContextValue = {
    currentBusinessId: "biz-12345",
    currentRole: "owner",
    currentMembership: null,
    memberships: [],
    businessName: "Maison Alyssa",
    switchBusiness: jest.fn(),
    isLoading: false,
    ...tenantValue,
  };

  return renderToString(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TenantContext.Provider value={defaultTenant}>{ui}</TenantContext.Provider>
    </NextIntlClientProvider>,
  );
}

describe("Web Analytics Dashboard UI (`/analytics`) (T-WEB-09)", () => {
  describe("1. Currency & Trend Formatting Helpers", () => {
    it("formatGmvMoney: formats millimes into dinars accurately with DT unit", () => {
      expect(formatGmvMoney(0)).toBe("0 DT");
      expect(formatGmvMoney(null)).toBe("0 DT");
      expect(formatGmvMoney(undefined)).toBe("0 DT");
      expect(formatGmvMoney(1250000)).toBe("1 250 DT");
      expect(formatGmvMoney(1250000, "ar-TN")).toContain("د.ت");
      expect(formatGmvMoney(42500, "fr-FR")).toBe("42,500 DT");
      expect(formatGmvMoney(42500, "en-US")).toBe("42.500 DT");
    });

    it("formatDeltaPercent: formats positive, negative and zero percentages accurately", () => {
      expect(formatDeltaPercent(0.142)).toEqual({ text: "+14.2%", direction: "up" });
      expect(formatDeltaPercent(-0.085)).toEqual({ text: "-8.5%", direction: "down" });
      expect(formatDeltaPercent(0)).toEqual({ text: "0%", direction: "neutral" });
      expect(formatDeltaPercent(null)).toEqual({ text: "—", direction: "neutral" });
      expect(formatDeltaPercent(undefined)).toEqual({ text: "—", direction: "neutral" });
    });

    it("formatDeltaPoints: formats delta points accurately", () => {
      expect(formatDeltaPoints(0.045)).toEqual({ text: "+4.5 pts", direction: "up" });
      expect(formatDeltaPoints(-0.021)).toEqual({ text: "-2.1 pts", direction: "down" });
      expect(formatDeltaPoints(0)).toEqual({ text: "0 pts", direction: "neutral" });
      expect(formatDeltaPoints(null)).toEqual({ text: "—", direction: "neutral" });
    });
  });

  describe("2. Analytics KPI Cards Component", () => {
    it("renders all 4 core KPI cards with values and delta badges", () => {
      const html = renderWithProviders(
        <AnalyticsKpiCards
          summary={mockAnalyticsData.summary}
          trends={mockAnalyticsData.trends}
          locale="fr-FR"
        />,
      );

      // Card 1: GMV Revenue
      expect(html).toContain("Chiffre d&#x27;affaires GMV");
      expect(html).toContain("2 420 DT");
      expect(html).toContain("+14.2%");

      // Card 2: Total Orders
      expect(html).toContain("Commandes créées");
      expect(html).toContain("20");
      expect(html).toContain("+8.5%");

      // Card 3: Conversations
      expect(html).toContain("Conversations");
      expect(html).toContain("77");
      expect(html).toContain("-3.4%");
      // Message AI/Human split breakdown
      expect(html).toContain("88% IA");
      expect(html).toContain("12% humain");

      // Card 4: AI Resolution Rate
      expect(html).toContain("Taux de résolution IA");
      expect(html).toContain("88%");
      expect(html).toContain("+4.5 pts");
      expect(html).toContain("7 escalades humaines");
    });

    it("renders loading skeletons when isLoading is true", () => {
      const html = renderWithProviders(<AnalyticsKpiCards isLoading={true} />);
      expect(html).toContain("analytics-kpi-skeletons");
      expect(html).not.toContain("2 420 DT");
    });
  });

  describe("3. Revenue Chart Component", () => {
    it("renders timeseries area & line chart accurately", () => {
      const html = renderWithProviders(
        <RevenueChart timeseries={mockTimeseries} period="30d" locale="fr-FR" />,
      );

      expect(html).toContain("revenue-chart");
      expect(html).toContain("Évolution du chiffre d&#x27;affaires (GMV)");
      expect(html).toContain("2 420 DT"); // Total revenue
      expect(html).toContain("<svg");
      expect(html).toContain("<path");
    });

    it("renders empty state when timeseries is empty", () => {
      const html = renderWithProviders(
        <RevenueChart timeseries={[]} period="30d" locale="fr-FR" />,
      );

      expect(html).toContain("revenue-chart-empty");
      expect(html).toContain("Aucune donnée de revenu pour cette période");
    });

    it("renders skeleton when isLoading is true", () => {
      const html = renderWithProviders(<RevenueChart isLoading={true} />);
      expect(html).toContain("revenue-chart-skeleton");
    });
  });

  describe("4. AI Resolution Chart Component", () => {
    it("renders AI activity & resolution chart accurately", () => {
      const html = renderWithProviders(
        <AiResolutionChart timeseries={mockTimeseries} period="30d" locale="fr-FR" />,
      );

      expect(html).toContain("ai-resolution-chart");
      expect(html).toContain("Activité &amp; Résolution IA");
      expect(html).toContain("Messages IA");
      expect(html).toContain("Messages Humains");
      expect(html).toContain("Taux de résolution");
      expect(html).toContain("<svg");
      expect(html).toContain("<rect");
    });

    it("renders empty state when timeseries is empty", () => {
      const html = renderWithProviders(
        <AiResolutionChart timeseries={[]} period="30d" locale="fr-FR" />,
      );

      expect(html).toContain("ai-resolution-chart-empty");
      expect(html).toContain("Aucune donnée d&#x27;activité pour cette période");
    });

    it("renders skeleton when isLoading is true", () => {
      const html = renderWithProviders(<AiResolutionChart isLoading={true} />);
      expect(html).toContain("ai-resolution-chart-skeleton");
    });

    it("renders stacked bars proportionally when message counts exceed baseline scale", () => {
      const highVolumeTimeseries: DailyMetricPoint[] = [
        {
          date: "2026-09-04",
          gmv: 500000,
          ordersCount: 5,
          conversationsCount: 20,
          aiResolutionRate: 0.8,
          messagesHandled: 100,
          messagesAi: 150,
          messagesHuman: 50,
        },
      ];
      const html = renderWithProviders(
        <AiResolutionChart timeseries={highVolumeTimeseries} period="7d" locale="fr-FR" />,
      );
      expect(html).toContain("ai-resolution-chart");
      expect(html).toContain("<rect");
    });
  });

  describe("5. Full Analytics Page Component", () => {
    it("renders page header, period selector tabs, and container elements", () => {
      const html = renderWithProviders(<AnalyticsPage />);

      expect(html).toContain("Analyses de performance");
      expect(html).toContain(
        "Suivi des ventes, volume de commandes et efficacité de l&#x27;agent IA",
      );
      expect(html).toContain("7 jours");
      expect(html).toContain("30 jours");
      expect(html).toContain("90 jours");
      expect(html).toContain("Actualiser");
    });
  });
});
