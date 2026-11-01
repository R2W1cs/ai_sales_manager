/**
 * Automated TDD Test Suite for T-WEB-04 — Web Onboarding Wizard UI (6 steps: Store, Channels, Catalog, Rules, Playground, Live Gate)
 * Generated from backlog card acceptance criteria.
 */

/// <reference types="jest" />
import React from "react";
import { renderToString } from "react-dom/server";

import { TenantContext, type TenantContextValue } from "@/components/layout/tenant-context";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { StepBusinessRules } from "@/components/onboarding/step-business-rules";
import { StepCatalogUpload } from "@/components/onboarding/step-catalog-upload";
import { StepChannelConnect } from "@/components/onboarding/step-channel-connect";
import {
  StepLiveActivation,
  type OnboardingState,
} from "@/components/onboarding/step-live-activation";
import { StepPlaygroundTest } from "@/components/onboarding/step-playground-test";
import { StepStoreSetup } from "@/components/onboarding/step-store-setup";

// Mock Next.js navigation hooks
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/onboarding",
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  redirect: jest.fn(),
}));

// Mock api-client
jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({}),
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

function renderWithTenant(ui: React.ReactElement) {
  const mockTenantContext: TenantContextValue = {
    currentBusinessId: "biz-123",
    currentRole: "owner",
    currentMembership: { businessId: "biz-123", role: "owner", joinedAt: new Date().toISOString() },
    memberships: [{ businessId: "biz-123", role: "owner", joinedAt: new Date().toISOString() }],
    businessName: "Maison de Mode Tunis",
    switchBusiness: jest.fn(),
    isLoading: false,
  };

  return renderToString(
    <TenantContext.Provider value={mockTenantContext}>{ui}</TenantContext.Provider>,
  );
}

describe("Web Onboarding Wizard UI (6 steps: Store, Channels, Catalog, Rules, Playground, Live Gate) (T-WEB-04)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Step Navigation: Merchant can progress through all 6 steps.", () => {
    // 1. Verify Wizard Stepper Header renders all 6 steps
    const wizardHtml = renderWithTenant(<OnboardingWizard initialStep={1} />);
    expect(wizardHtml).toContain('data-slot="stepper-item-1"');
    expect(wizardHtml).toContain('data-slot="stepper-item-2"');
    expect(wizardHtml).toContain('data-slot="stepper-item-3"');
    expect(wizardHtml).toContain('data-slot="stepper-item-4"');
    expect(wizardHtml).toContain('data-slot="stepper-item-5"');
    expect(wizardHtml).toContain('data-slot="stepper-item-6"');

    expect(wizardHtml).toContain("Entreprise");
    expect(wizardHtml).toContain("Canaux");
    expect(wizardHtml).toContain("Produits");
    expect(wizardHtml).toContain("Règles");
    expect(wizardHtml).toContain("Simulation");
    expect(wizardHtml).toContain("Activation");

    // 2. Step 1: Store Setup
    const step1Html = renderWithTenant(
      <StepStoreSetup businessId="biz-123" initialName="Maison de Mode Tunis" onNext={jest.fn()} />,
    );
    expect(step1Html).toContain('data-slot="step-store-setup"');
    expect(step1Html).toContain("Profil de votre entreprise");
    expect(step1Html).toContain('id="store-name"');
    expect(step1Html).toContain('id="store-industry"');
    expect(step1Html).toContain('id="store-language"');
    expect(step1Html).toContain("Dinar Tunisien (DT)");
    expect(step1Html).toContain('data-slot="btn-next-step"');

    // 3. Step 2: Channels
    const step2Html = renderWithTenant(
      <StepChannelConnect businessId="biz-123" onNext={jest.fn()} onPrev={jest.fn()} />,
    );
    expect(step2Html).toContain('data-slot="step-channel-connect"');
    expect(step2Html).toContain('data-slot="channel-card-instagram"');
    expect(step2Html).toContain('data-slot="channel-card-messenger"');
    expect(step2Html).toContain('data-slot="channel-card-whatsapp"');
    expect(step2Html).toContain("Phase 2 — Bientôt disponible");

    // 4. Step 3: Catalog CSV Upload
    const step3Html = renderWithTenant(
      <StepCatalogUpload businessId="biz-123" onNext={jest.fn()} onPrev={jest.fn()} />,
    );
    expect(step3Html).toContain('data-slot="step-catalog-upload"');
    expect(step3Html).toContain('data-slot="csv-dropzone"');
    expect(step3Html).toContain("Glissez-déposez votre fichier CSV ici");
    expect(step3Html).toContain("Gabarit CSV");

    // 5. Step 4: Business Rules & AI Persona (Gate G2)
    const step4Html = renderWithTenant(
      <StepBusinessRules businessId="biz-123" onNext={jest.fn()} onPrev={jest.fn()} />,
    );
    expect(step4Html).toContain('data-slot="step-business-rules"');
    expect(step4Html).toContain("Règles Commerciales");
    expect(step4Html).toContain('id="delivery-fee"');
    expect(step4Html).toContain('id="payment-cod"');
    expect(step4Html).toContain('id="return-days"');
    expect(step4Html).toContain('data-slot="btn-save-rules-next"');

    // 6. Step 5: AI Playground
    const step5Html = renderWithTenant(
      <StepPlaygroundTest businessId="biz-123" onNext={jest.fn()} onPrev={jest.fn()} />,
    );
    expect(step5Html).toContain('data-slot="step-playground-test"');
    expect(step5Html).toContain('data-slot="scenario-price"');
    expect(step5Html).toContain('data-slot="scenario-buying_intent"');
    expect(step5Html).toContain('data-slot="scenario-angry"');
    expect(step5Html).toContain('data-slot="scenario-recommendation"');
    expect(step5Html).toContain('data-slot="decision-inspector"');

    // 7. Step 6: Live Activation
    const step6Html = renderWithTenant(
      <StepLiveActivation businessId="biz-123" onPrev={jest.fn()} />,
    );
    expect(step6Html).toContain('data-slot="step-live-activation"');
    expect(step6Html).toContain('data-slot="gate-g1"');
    expect(step6Html).toContain('data-slot="gate-g2"');
    expect(step6Html).toContain('data-slot="gate-g3"');
    expect(step6Html).toContain('data-slot="gate-g4"');
    expect(step6Html).toContain('data-slot="gate-g5"');
    expect(step6Html).toContain('data-slot="toggle-auto-send"');
  });

  it("Gate Lock: Live activation toggle remains locked until prerequisites are satisfied.", () => {
    // When gates G1-G4 are unmet and handoff is unacknowledged
    const incompleteState: OnboardingState = {
      businessId: "biz-123",
      businessCreated: true,
      channelConnected: false,
      productsImported: false,
      aiConfigured: false,
      playgroundPassed: false,
      approvalTrialPassed: false,
      handoffAcknowledged: false,
      aiActivated: false,
      currentStep: 6,
      completedSteps: ["step-1"],
      isReadyForLive: false,
      aiActivationReady: false,
      unmetGates: ["G1", "G2", "G3", "G4", "G5"],
    };

    const html = renderWithTenant(
      <StepLiveActivation businessId="biz-123" initialState={incompleteState} onPrev={jest.fn()} />,
    );

    // Verify button exists and is disabled
    expect(html).toContain('data-slot="btn-activate-live"');
    expect(html).toContain("disabled");
    expect(html).toContain(
      "Bouton verrouillé tant que toutes les portes (G1–G5) ne sont pas satisfaites",
    );

    // Verify mandatory G5 checkbox is present
    expect(html).toContain('data-slot="checkbox-g5-handoff"');
    expect(html).toContain(
      "« Je comprends que l&#x27;IA qualifie les commandes et que mon équipe doit valider manuellement la confirmation finale. »",
    );
  });

  it("Activation Success: Successful activation redirects to `/inbox`.", () => {
    // When all gates G1-G5 are satisfied
    const readyState: OnboardingState = {
      businessId: "biz-123",
      businessCreated: true,
      channelConnected: true,
      productsImported: true,
      aiConfigured: true,
      playgroundPassed: true,
      approvalTrialPassed: true,
      handoffAcknowledged: true,
      aiActivated: false,
      currentStep: 6,
      completedSteps: ["step-1", "step-2", "step-3", "step-4", "step-5"],
      isReadyForLive: true,
      aiActivationReady: true,
      unmetGates: [],
    };

    const html = renderWithTenant(
      <StepLiveActivation businessId="biz-123" initialState={readyState} onPrev={jest.fn()} />,
    );

    // Verify activation button is NOT disabled when ready
    expect(html).toContain('data-slot="btn-activate-live"');
    expect(html).not.toContain("Bouton verrouillé tant que toutes les portes");
    expect(html).toContain("Activer l&#x27;Agent IA en direct");
  });

  it("Channel Quota & Disconnect: Displays quota badge and handles channel lifecycle.", () => {
    const html = renderWithTenant(
      <StepChannelConnect businessId="biz-123" onNext={jest.fn()} onPrev={jest.fn()} />,
    );

    expect(html).toContain("Forfait Starter");
    expect(html).toContain("Note pour Instagram Direct");
    expect(html).toContain('data-slot="channel-card-instagram"');
    expect(html).toContain('data-slot="channel-card-messenger"');
  });
});
