/**
 * Automated TDD Test Suite for T-WEB-10 — Web Settings Tabs UI (Personality, Channels, Rules, Team, Billing)
 * Generated from backlog card acceptance criteria.
 */

import { NextIntlClientProvider } from "next-intl";
/// <reference types="jest" />
import React from "react";
import { renderToString } from "react-dom/server";

import { TenantContext, type TenantContextValue } from "@/components/layout/tenant-context";
import { SettingsBillingTab } from "@/components/settings/settings-billing-tab";
import { SettingsChannelsTab } from "@/components/settings/settings-channels-tab";
import { SettingsPersonalityTab } from "@/components/settings/settings-personality-tab";
import { SettingsRulesTab } from "@/components/settings/settings-rules-tab";
import { SettingsTeamTab } from "@/components/settings/settings-team-tab";
import messages from "@/i18n/messages/fr.json";

import SettingsPage from "./page";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
  usePathname: () => "/settings",
}));

// Mock api-client
jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes("/ai/agents")) {
        return Promise.resolve([
          {
            id: "agent-1",
            businessId: "biz-1",
            name: "Alyssa Test",
            language: "ar",
            tone: "Chaleureux & Commercial",
            confidenceThreshold: 0.75,
            enabled: true,
          },
        ]);
      }
      if (url.includes("/ai/settings")) {
        return Promise.resolve({
          businessId: "biz-1",
          replyMode: "approval_required",
        });
      }
      if (url.includes("/integrations")) {
        return Promise.resolve([
          {
            id: "chan-1",
            channel: "instagram",
            status: "active",
            displayName: "boutique.tn",
            externalAccountId: "ig-12345",
          },
        ]);
      }
      if (url.includes("/business-rules")) {
        return Promise.resolve([
          {
            id: "rule-1",
            ruleType: "delivery",
            payload: {
              zones: [{ name: "Grand Tunis", fee: 7, currency: "TND", eta_hours: 24 }],
            },
            enabled: true,
          },
        ]);
      }
      if (url.includes("/members")) {
        return Promise.resolve([
          {
            userId: "user-1",
            email: "owner@boutique.tn",
            name: "Owner User",
            role: "owner",
          },
        ]);
      }
      if (url.includes("/invitations")) {
        return Promise.resolve([]);
      }
      if (url.includes("/billing/usage") || url.includes("/usage")) {
        return Promise.resolve({
          cycleStart: "2026-09-01T00:00:00.000Z",
          cycleEnd: "2026-10-01T00:00:00.000Z",
          planCode: "starter",
          limits: { aiMessages: 500, seats: 2, channels: 1 },
          current: { aiMessages: 150, seats: 1, channels: 1 },
          percentUsed: 30,
          aiPaused: false,
        });
      }
      if (url.includes("/billing/plans")) {
        return Promise.resolve([
          {
            code: "starter",
            name: "Starter",
            limits: { ai_messages_per_month: 500, seats: 2, channel_accounts: 1 },
          },
        ]);
      }
      return Promise.resolve([]);
    }),
    post: jest.fn().mockResolvedValue({}),
    patch: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  ApiClientError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

function renderWithProviders(
  ui: React.ReactElement,
  tenantOverrides?: Partial<TenantContextValue>,
) {
  const mockTenant: TenantContextValue = {
    currentBusinessId: "biz-1",
    currentRole: "owner",
    currentMembership: {
      businessId: "biz-1",
      role: "owner",
      joinedAt: new Date().toISOString(),
    },
    memberships: [
      {
        businessId: "biz-1",
        role: "owner",
        joinedAt: new Date().toISOString(),
      },
    ],
    businessName: "Boutique Tunisienne",
    switchBusiness: jest.fn(),
    isLoading: false,
    ...tenantOverrides,
  };

  return renderToString(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <TenantContext.Provider value={mockTenant}>{ui}</TenantContext.Provider>
    </NextIntlClientProvider>,
  );
}

describe("Web Settings Tabs UI (Personality, Channels, Rules, Team, Billing) (T-WEB-10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Settings Tabs: Owner can configure personality, channels, rules, team, and billing.", () => {
    const html = renderWithProviders(<SettingsPage />);

    // Page title and subtitle
    expect(html).toContain("Paramètres");
    expect(html).toContain("Gérez la configuration de votre agent IA");

    // All 5 tabs visible for owner
    expect(html).toContain("Personnalité IA");
    expect(html).toContain("Canaux");
    expect(html).toContain("Règles Commerciales");
    expect(html).toContain("Équipe");
    expect(html).toContain("Facturation");
    expect(html).toContain("tab-trigger-billing");
  });

  it("Hides billing tab for non-owner members (Admin role)", () => {
    const html = renderWithProviders(<SettingsPage />, { currentRole: "admin" });

    // Personality, Channels, Rules, Team are visible
    expect(html).toContain("Personnalité IA");
    expect(html).toContain("Canaux");
    expect(html).toContain("Règles Commerciales");
    expect(html).toContain("Équipe");

    // Billing tab is strictly hidden
    expect(html).not.toContain("tab-trigger-billing");
  });

  it("Renders SettingsPersonalityTab component properly", () => {
    const html = renderWithProviders(<SettingsPersonalityTab businessId="biz-1" />);
    expect(html).toContain("settings-personality-form");
    expect(html).toContain("Nom de l&#x27;agent");
    expect(html).toContain("Tonalité de communication");
    expect(html).toContain("reply-mode-radios");
  });

  it("Renders SettingsChannelsTab component properly", () => {
    const html = renderWithProviders(<SettingsChannelsTab businessId="biz-1" />);
    expect(html).toContain("settings-channels-tab");
    expect(html).toContain("Instagram Direct");
    expect(html).toContain("Facebook Messenger");
    expect(html).toContain("WhatsApp Business");
    expect(html).toContain("Bientôt disponible (Phase 2)");
  });

  it("Renders SettingsRulesTab component properly", () => {
    const html = renderWithProviders(<SettingsRulesTab businessId="biz-1" />);
    expect(html).toContain("settings-rules-form");
    expect(html).toContain("1. Politique de Livraison");
    expect(html).toContain("2. Seuil de Livraison Gratuite");
    expect(html).toContain("3. Politique de Remise");
    expect(html).toContain("4. Méthodes de Paiement");
    expect(html).toContain("5. Politique de Retour &amp; Échange");
  });

  it("Renders SettingsTeamTab component properly", () => {
    const html = renderWithProviders(<SettingsTeamTab businessId="biz-1" />);
    expect(html).toContain("settings-team-tab");
    expect(html).toContain("Membres de l&#x27;Équipe");
    expect(html).toContain("Inviter un membre");
    expect(html).toContain("invite-member-button");
  });

  it("Renders SettingsBillingTab component with quota bars and upgrade button for Owner", () => {
    const html = renderWithProviders(<SettingsBillingTab businessId="biz-1" isOwner={true} />);
    expect(html).toContain("settings-billing-tab");
    expect(html).toContain("Forfait Actuel");
    expect(html).toContain("upgrade-plan-button");
    expect(html).toContain("quota-progress-bars");
  });

  it("Denies access to SettingsBillingTab when isOwner is false", () => {
    const html = renderWithProviders(<SettingsBillingTab businessId="biz-1" isOwner={false} />);
    expect(html).toContain("billing-access-denied");
    expect(html).toContain("Cette section est strictement réservée au propriétaire du magasin");
    expect(html).not.toContain("quota-progress-bars");
  });
});
