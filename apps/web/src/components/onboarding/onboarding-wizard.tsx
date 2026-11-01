"use client";

import { Store, Share2, PackageCheck, FileText, Bot, Zap, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { useTenant } from "@/components/layout/tenant-context";
import { Container } from "@/components/ui/container";
import { Stack } from "@/components/ui/stack";
import { Wrapper } from "@/components/ui/wrapper";
import { apiClient } from "@/lib/api-client";

import { StepBusinessRules } from "./step-business-rules";
import { StepCatalogUpload } from "./step-catalog-upload";
import { StepChannelConnect } from "./step-channel-connect";
import { StepLiveActivation, type OnboardingState } from "./step-live-activation";
import { StepPlaygroundTest } from "./step-playground-test";
import { StepStoreSetup } from "./step-store-setup";

export type WizardStepId = 1 | 2 | 3 | 4 | 5 | 6;

export interface OnboardingWizardProps {
  initialStep?: WizardStepId;
}

function getInitialStep(fallback: WizardStepId = 1): WizardStepId {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const s = parseInt(params.get("step") || "", 10);
    if (s >= 1 && s <= 6) {
      return s as WizardStepId;
    }
  }
  return fallback;
}

export function OnboardingWizard({ initialStep = 1 }: OnboardingWizardProps): React.ReactElement {
  const { currentBusinessId, businessName, switchBusiness } = useTenant();
  const t = useTranslations("onboarding");
  const [currentStep, setCurrentStep] = useState<WizardStepId>(() => getInitialStep(initialStep));
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [createdBusinessId, setCreatedBusinessId] = useState<string | null>(null);
  const effectiveBusinessId = currentBusinessId || createdBusinessId || "";

  // Helper to fetch latest onboarding state
  function fetchOnboardingState(bizId: string) {
    apiClient
      .get<OnboardingState>(`/api/v1/businesses/${bizId}/onboarding`)
      .then((state) => {
        if (!state) return;
        setOnboardingState(state);
      })
      .catch(() => {
        // Non-fatal
      });
  }

  // Handle step transitions with URL query and backend persistence
  function handleStepChange(newStep: WizardStepId) {
    setCurrentStep(newStep);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(newStep));
      window.history.replaceState(null, "", url.toString());
    }

    if (effectiveBusinessId) {
      apiClient
        .patch(`/api/v1/businesses/${effectiveBusinessId}/onboarding`, {
          currentStep: newStep,
        })
        .then(() => {
          fetchOnboardingState(effectiveBusinessId);
        })
        .catch(() => {
          // Non-fatal
        });
    }
  }

  useEffect(() => {
    let mounted = true;
    if (!effectiveBusinessId) return;

    apiClient
      .get<OnboardingState>(`/api/v1/businesses/${effectiveBusinessId}/onboarding`)
      .then((state) => {
        if (!mounted || !state) return;
        setOnboardingState(state);

        // If no URL parameter was set and initialStep prop is default 1, restore from backend
        const hasUrlParam =
          typeof window !== "undefined" && new URLSearchParams(window.location.search).has("step");

        if (!hasUrlParam && initialStep === 1 && state.currentStep) {
          const stepNum = state.currentStep as WizardStepId;
          if (stepNum >= 1 && stepNum <= 6) {
            setCurrentStep(stepNum);
          }
        }
      })
      .catch(() => {
        // Non-fatal
      });

    return () => {
      mounted = false;
    };
  }, [effectiveBusinessId, initialStep]);

  const steps: Array<{
    id: WizardStepId;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 1,
      title: t("stepStore"),
      description: t("storeName"),
      icon: Store,
    },
    {
      id: 2,
      title: t("stepChannels"),
      description: t("connectInstagram"),
      icon: Share2,
    },
    {
      id: 3,
      title: t("stepCatalog"),
      description: t("uploadCsv"),
      icon: PackageCheck,
    },
    {
      id: 4,
      title: t("stepRules"),
      description: t("rulesTitle"),
      icon: FileText,
    },
    {
      id: 5,
      title: t("stepPlayground"),
      description: t("simulateConversation"),
      icon: Bot,
    },
    {
      id: 6,
      title: t("stepActivation"),
      description: t("activateAgent"),
      icon: Zap,
    },
  ];

  return (
    <Container className="py-fluid-sm">
      <Wrapper gap="lg" data-slot="onboarding-wizard" className="mx-auto max-w-5xl">
        {/* Wizard Header & Stepper */}
        <Stack direction="column" size="sm" align="center" className="text-center">
          <Stack
            direction="row"
            size="xs"
            className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
          >
            <Zap className="size-3.5" />
            <span>{t("wizardBadge")}</span>
          </Stack>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("wizardMainTitle")}
          </h1>
          <p className="mx-auto max-w-xl text-xs text-muted-foreground sm:text-sm">
            {t("wizardSubtitle")}
          </p>
        </Stack>

        {/* Stepper Navigation */}
        <nav aria-label={t("progressLabel")} className="relative">
          <ol
            data-slot="stepper-list"
            className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card shadow-xs sm:grid-cols-6"
          >
            {steps.map((step) => {
              const Icon = step.icon;
              const isPersistedComplete =
                onboardingState?.completedSteps?.includes(`step-${step.id}`) ||
                onboardingState?.completedSteps?.includes(String(step.id));
              const isCompleted = isPersistedComplete || step.id < currentStep;
              const isCurrent = step.id === currentStep;

              return (
                <li key={step.id} className="relative">
                  <button
                    type="button"
                    onClick={() => handleStepChange(step.id)}
                    data-slot={`stepper-item-${step.id}`}
                    aria-current={isCurrent ? "step" : undefined}
                    className={`group flex w-full flex-col items-center gap-2 p-3 text-center transition-colors outline-none hover:bg-muted/40 ${
                      isCurrent
                        ? "bg-primary/5 font-semibold text-primary"
                        : isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                        isCompleted && !isCurrent
                          ? "bg-success/20 text-success"
                          : isCurrent
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "border border-border bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {isCompleted && !isCurrent ? (
                        <Check className="size-4" />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </div>

                    <div className="hidden sm:block">
                      <p className="text-xs leading-none font-semibold">{step.title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{step.description}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Active Step Content */}
        <main data-slot="wizard-step-canvas" className="min-h-100">
          {currentStep === 1 && (
            <StepStoreSetup
              businessId={effectiveBusinessId}
              initialName={businessName !== "Mon Entreprise" ? businessName : ""}
              onNext={(newBusinessId) => {
                if (newBusinessId) {
                  setCreatedBusinessId(newBusinessId);
                  try {
                    switchBusiness(newBusinessId);
                  } catch {
                    // Tenant context may still be catching up after session refresh
                  }
                }
                handleStepChange(2);
              }}
            />
          )}
          {currentStep === 2 && (
            <StepChannelConnect
              businessId={effectiveBusinessId}
              onNext={() => handleStepChange(3)}
              onPrev={() => handleStepChange(1)}
            />
          )}
          {currentStep === 3 && (
            <StepCatalogUpload
              businessId={effectiveBusinessId}
              onNext={() => handleStepChange(4)}
              onPrev={() => handleStepChange(2)}
            />
          )}
          {currentStep === 4 && (
            <StepBusinessRules
              businessId={effectiveBusinessId}
              onNext={() => handleStepChange(5)}
              onPrev={() => handleStepChange(3)}
            />
          )}
          {currentStep === 5 && (
            <StepPlaygroundTest
              businessId={effectiveBusinessId}
              onNext={() => handleStepChange(6)}
              onPrev={() => handleStepChange(4)}
            />
          )}
          {currentStep === 6 && (
            <StepLiveActivation
              businessId={effectiveBusinessId}
              initialState={onboardingState}
              onPrev={() => handleStepChange(5)}
            />
          )}
        </main>

        {/* Trust Footer */}
        <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
          <p>{t("trustFooter")}</p>
        </footer>
      </Wrapper>
    </Container>
  );
}
