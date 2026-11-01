/**
 * Automated TDD Test Suite for T-WEB-07 — Web Sales Pipeline Kanban Board UI (`/pipeline`)
 * Generated from backlog card acceptance criteria.
 */

import { NextIntlClientProvider } from "next-intl";
/// <reference types="jest" />
import React from "react";
import { renderToString } from "react-dom/server";

import { TenantContext, type TenantContextValue } from "@/components/layout/tenant-context";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { PipelineCard } from "@/components/pipeline/pipeline-card";
import { PipelineColumn } from "@/components/pipeline/pipeline-column";
import { formatPipelineMoney, formatPipelineTime } from "@/components/pipeline/pipeline-formatter";
import messages from "@/i18n/messages/fr.json";
import type { PipelineCardDto, PipelineResponseDto } from "@app/shared";

import PipelinePage from "./page";

// Mock Next.js router
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/pipeline",
}));

// Mock Socket.IO client
jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

// Mock api-client
const mockSamplePipeline: PipelineResponseDto = {
  currency: "TND",
  columns: {
    new_leads: {
      count: 12,
      totalValue: 0,
      cards: [
        {
          conversationId: "conv-1",
          customerName: "Karim S.",
          productSnapshot: "prix svp?",
          value: 0,
          valueType: "estimated",
          currency: "TND",
          temperature: "cold",
          lastActivityAt: "2026-09-09T10:00:00.000Z",
        },
      ],
    },
    qualified: {
      count: 8,
      totalValue: 640000,
      cards: [
        {
          conversationId: "conv-2",
          customerName: "Sonia B.",
          productSnapshot: "Robe Rouge (S)",
          value: 85000,
          valueType: "estimated",
          currency: "TND",
          temperature: "hot",
          lastActivityAt: "2026-09-09T10:15:00.000Z",
        },
      ],
    },
    payment_pending: {
      count: 4,
      totalValue: 508000,
      cards: [
        {
          conversationId: "conv-3",
          orderId: "order-1",
          customerName: "Ahmed Ben Ali",
          productSnapshot: "Hoodie Noir (M)",
          value: 127000,
          valueType: "actual",
          currency: "TND",
          temperature: "hot",
          lastActivityAt: "2026-09-09T10:30:00.000Z",
        },
      ],
    },
    sold: {
      count: 15,
      totalValue: 1890000,
      cards: [
        {
          conversationId: "conv-4",
          orderId: "order-2",
          customerName: "Meriem F.",
          productSnapshot: "Robe Fleurie (S)",
          value: 140000,
          valueType: "actual",
          currency: "TND",
          temperature: "warm",
          lastActivityAt: "2026-09-09T09:30:00.000Z",
        },
      ],
    },
  },
};

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes("/pipeline")) {
        return Promise.resolve(mockSamplePipeline);
      }
      return Promise.resolve({});
    }),
    post: jest.fn().mockResolvedValue({}),
    patch: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    getAccessToken: jest.fn().mockReturnValue("mock-token"),
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
      this.name = "ApiClientError";
    }
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  const mockTenantContext: TenantContextValue = {
    currentBusinessId: "biz-test-123",
    currentRole: "owner",
    currentMembership: {
      businessId: "biz-test-123",
      role: "owner",
      joinedAt: new Date().toISOString(),
    },
    memberships: [
      { businessId: "biz-test-123", role: "owner", joinedAt: new Date().toISOString() },
    ],
    businessName: "Boutique Carthage Mode",
    switchBusiness: jest.fn(),
    isLoading: false,
  };

  return renderToString(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <TenantContext.Provider value={mockTenantContext}>{ui}</TenantContext.Provider>
    </NextIntlClientProvider>,
  );
}

describe("Web Sales Pipeline Kanban Board UI (`/pipeline`) (T-WEB-07)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Currency & Unit Formatting Helpers", () => {
    it("formatPipelineMoney: formats millimes into formatted TND dinars accurately", () => {
      expect(formatPipelineMoney(0)).toBe("0 DT");
      expect(formatPipelineMoney(127000)).toBe("127 DT");
      expect(formatPipelineMoney(640000)).toBe("640 DT");
      expect(formatPipelineMoney(1890000)).toContain("1");
      expect(formatPipelineMoney(1890000)).toContain("890 DT");
      expect(formatPipelineMoney(42500)).toBe("42,500 DT");
    });

    it("formatPipelineTime: formats timestamp in Africa/Tunis timezone with locale", () => {
      const iso = "2026-09-09T10:30:00.000Z";
      // UTC 10:30 is 11:30 in Africa/Tunis (UTC+1)
      const formatted = formatPipelineTime(iso, "fr-FR", "Africa/Tunis");
      expect(formatted).toBe("11:30");

      expect(formatPipelineTime(null)).toBeNull();
      expect(formatPipelineTime(undefined)).toBeNull();
      expect(formatPipelineTime("not-a-date")).toBeNull();
    });
  });

  describe("Kanban View & Column Structure", () => {
    it("Kanban View: Renders 4 columns with active deal cards and totals.", () => {
      const pageHtml = renderWithProviders(<PipelinePage />);

      // Verify page title and subtitle
      expect(pageHtml).toContain("Pipeline de vente");
      expect(pageHtml).toContain("Suivi visuel des opportunités");

      // Verify board container
      expect(pageHtml).toContain('data-testid="pipeline-board"');

      // Verify all 4 canonical column testids are present
      expect(pageHtml).toContain('data-testid="pipeline-column-new_leads"');
      expect(pageHtml).toContain('data-testid="pipeline-column-qualified"');
      expect(pageHtml).toContain('data-testid="pipeline-column-payment_pending"');
      expect(pageHtml).toContain('data-testid="pipeline-column-sold"');

      // Verify column titles (French)
      expect(pageHtml).toContain("Nouveaux Leads");
      expect(pageHtml).toContain("Leads Qualifiés");
      expect(pageHtml).toContain("En attente de confirmation");
      expect(pageHtml).toContain("Commandes Confirmées");
    });

    it("PipelineBoard: Renders isolated board component with metrics bar", () => {
      const boardHtml = renderWithProviders(<PipelineBoard className="custom-test-board" />);

      expect(boardHtml).toContain('data-testid="pipeline-board"');
      expect(boardHtml).toContain("custom-test-board");
      expect(boardHtml).toContain('data-testid="pipeline-total-deals"');
      expect(boardHtml).toContain('data-testid="pipeline-total-value"');
      expect(boardHtml).toContain('data-testid="pipeline-refresh-button"');
    });

    it("PipelineColumn: Renders counts, aggregate sum, and card items", () => {
      const columnHtml = renderWithProviders(
        <PipelineColumn
          columnId="qualified"
          column={{
            count: 8,
            totalValue: 640000,
            cards: [
              {
                conversationId: "conv-88",
                customerName: "Sonia B.",
                productSnapshot: "Robe Rouge (S)",
                value: 85000,
                valueType: "estimated",
                currency: "TND",
                temperature: "hot",
              },
            ],
          }}
        />,
      );

      expect(columnHtml).toContain('data-testid="pipeline-column-qualified"');
      expect(columnHtml).toContain("8");
      expect(columnHtml).toContain("640 DT");
      expect(columnHtml).toContain("Sonia B.");
      expect(columnHtml).toContain("Robe Rouge (S)");
      expect(columnHtml).toContain("85 DT");
    });

    it("PipelineColumn: Renders clean empty state when no cards exist", () => {
      const emptyHtml = renderWithProviders(
        <PipelineColumn columnId="new_leads" column={{ count: 0, totalValue: 0, cards: [] }} />,
      );

      expect(emptyHtml).toContain("Aucune opportunité dans cette colonne");
    });

    it("PipelineColumn: Handles cards with missing identifiers without key collisions", () => {
      const columnHtml = renderWithProviders(
        <PipelineColumn
          columnId="sold"
          column={{
            count: 2,
            totalValue: 100000,
            cards: [
              {
                customerName: "Anonymous 1",
                value: 50000,
                valueType: "actual",
              } as unknown as PipelineCardDto,
              {
                customerName: "Anonymous 2",
                value: 50000,
                valueType: "actual",
              } as unknown as PipelineCardDto,
            ],
          }}
        />,
      );

      expect(columnHtml).toContain("Anonymous 1");
      expect(columnHtml).toContain("Anonymous 2");
    });
  });

  describe("PipelineCard Interaction & Invariants", () => {
    it("No Drag: Cards are strictly non-draggable and read-only projection", () => {
      const card: PipelineCardDto = {
        conversationId: "conv-101",
        customerName: "Yassine K.",
        productSnapshot: "Sneakers Blanches (42)",
        value: 195000,
        valueType: "actual",
        temperature: "hot",
      };

      const cardHtml = renderWithProviders(<PipelineCard card={card} />);

      // Verify non-draggable attribute and button semantics
      expect(cardHtml).toContain('draggable="false"');
      expect(cardHtml).toContain('data-testid="pipeline-card"');
      expect(cardHtml).toContain('dir="auto"');
      expect(cardHtml).toContain("Yassine K.");
      expect(cardHtml).toContain("Sneakers Blanches (42)");
      expect(cardHtml).toContain("195 DT");
      expect(cardHtml).toContain("Chaud");
    });

    it("Column 3 Copy: Renders 'En attente de confirmation' badge for payment_pending cards without temperature", () => {
      const card: PipelineCardDto = {
        orderId: "order-99",
        customerName: "Ahmed Ben Ali",
        productSnapshot: "Hoodie Noir (M)",
        value: 127000,
        valueType: "actual",
      };

      const cardHtml = renderWithProviders(<PipelineCard card={card} columnId="payment_pending" />);

      expect(cardHtml).toContain('data-testid="pipeline-status-badge"');
      expect(cardHtml).toContain("En attente de confirmation");
    });

    it("Navigation: Card click triggers navigation to inbox with conversationId and businessId", () => {
      const card: PipelineCardDto = {
        conversationId: "conv-42",
        customerName: "Fatma K.",
        productSnapshot: "Robe Fleurie",
        value: 45000,
        valueType: "actual",
        temperature: "warm",
      };

      let buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> | null = null;
      function TestCardConsumer() {
        const element = PipelineCard({ card });
        buttonProps = element.props as React.ButtonHTMLAttributes<HTMLButtonElement>;
        return element;
      }

      renderWithProviders(<TestCardConsumer />);

      expect(buttonProps).not.toBeNull();
      // Invoke the actual click handler from the rendered PipelineCard button
      buttonProps!.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

      expect(mockPush).toHaveBeenCalledWith(
        "/inbox?conversationId=conv-42&id=conv-42&businessId=biz-test-123",
      );
    });

    it("Navigation: Preserves explicit businessId prop when provided", () => {
      const card: PipelineCardDto = {
        conversationId: "conv-99",
        customerName: "Sami T.",
        value: 30000,
        valueType: "actual",
      };

      let buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> | null = null;
      function TestExplicitConsumer() {
        const element = PipelineCard({ card, businessId: "biz-custom-777" });
        buttonProps = element.props as React.ButtonHTMLAttributes<HTMLButtonElement>;
        return element;
      }

      renderWithProviders(<TestExplicitConsumer />);

      expect(buttonProps).not.toBeNull();
      buttonProps!.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

      expect(mockPush).toHaveBeenCalledWith(
        "/inbox?conversationId=conv-99&id=conv-99&businessId=biz-custom-777",
      );
    });

    it("PipelineColumn: Uses localized currency fallback when currency prop is omitted", () => {
      const columnHtml = renderWithProviders(
        <PipelineColumn
          columnId="new_leads"
          column={{
            count: 1,
            totalValue: 50000,
            cards: [
              {
                conversationId: "conv-1",
                customerName: "Test Customer",
                value: 50000,
              },
            ],
          }}
        />,
      );

      expect(columnHtml).toContain("50 DT");
    });

    it("Navigation Fallback: Card with orderId but no conversationId navigates to orders", () => {
      const orderCard: PipelineCardDto = {
        orderId: "order-888",
        customerName: "Leila B.",
        value: 50000,
        valueType: "actual",
      };

      let buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> | null = null;
      function TestFallbackConsumer() {
        const element = PipelineCard({ card: orderCard });
        buttonProps = element.props as React.ButtonHTMLAttributes<HTMLButtonElement>;
        return element;
      }

      renderWithProviders(<TestFallbackConsumer />);

      expect(buttonProps).not.toBeNull();
      mockPush.mockClear();
      buttonProps!.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

      expect(mockPush).toHaveBeenCalledWith("/inbox?orderId=order-888&businessId=biz-test-123");
    });

    it("Navigation: Card with neither conversationId nor orderId does not navigate", () => {
      const bareCard: PipelineCardDto = {
        customerName: "Bare Customer",
        value: 50000,
        valueType: "actual",
      };

      let buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> | null = null;
      function TestBareConsumer() {
        const element = PipelineCard({ card: bareCard });
        buttonProps = element.props as React.ButtonHTMLAttributes<HTMLButtonElement>;
        return element;
      }

      renderWithProviders(<TestBareConsumer />);

      expect(buttonProps).not.toBeNull();
      mockPush.mockClear();
      buttonProps!.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("Navigation Override: Card with onSelect invokes custom handler and bypasses router", () => {
      const card: PipelineCardDto = {
        conversationId: "conv-42",
        customerName: "Fatma K.",
        value: 45000,
        valueType: "actual",
      };
      const mockSelect = jest.fn();

      let buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> | null = null;
      function TestSelectConsumer() {
        const element = PipelineCard({ card, onSelect: mockSelect });
        buttonProps = element.props as React.ButtonHTMLAttributes<HTMLButtonElement>;
        return element;
      }

      renderWithProviders(<TestSelectConsumer />);

      expect(buttonProps).not.toBeNull();
      buttonProps!.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

      expect(mockSelect).toHaveBeenCalledWith(card);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
