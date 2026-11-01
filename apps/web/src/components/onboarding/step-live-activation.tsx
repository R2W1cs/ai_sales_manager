"use client";

import { Zap, CheckCircle2, XCircle, AlertCircle, ArrowLeft, ShieldAlert } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiClient, ApiClientError } from "@/lib/api-client";

export type ActivationGateId = "G1" | "G2" | "G3" | "G4" | "G5";

export interface OnboardingState {
  businessId: string;
  businessCreated: boolean;
  channelConnected: boolean;
  productsImported: boolean;
  aiConfigured: boolean;
  playgroundPassed: boolean;
  approvalTrialPassed: boolean;
  handoffAcknowledged: boolean;
  aiActivated: boolean;
  currentStep: number;
  completedSteps: string[];
  isReadyForLive: boolean;
  aiActivationReady: boolean;
  unmetGates: ActivationGateId[];
}

interface GateCardProps {
  id: string;
  title: string;
  description: string;
  satisfied: boolean;
}

function GateCard({ id, title, description, satisfied }: GateCardProps): React.ReactElement {
  return (
    <div
      data-slot={`gate-${id.toLowerCase()}`}
      className={`flex items-start gap-3 rounded-lg border p-3 text-xs transition-colors ${
        satisfied
          ? "border-success/30 bg-success/5 text-foreground"
          : "border-border bg-muted/20 text-muted-foreground"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {satisfied ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <XCircle className="size-4 text-muted-foreground/50" />
        )}
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export interface StepLiveActivationProps {
  businessId: string;
  initialState?: OnboardingState | null;
  onPrev: () => void;
  onActivated?: () => void;
}

interface TechnicalGatesSectionProps {
  gates: Array<{
    id: string;
    title: string;
    description: string;
    satisfied: boolean;
  }>;
}

function TechnicalGatesSection({ gates }: TechnicalGatesSectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {tOnboarding("technicalGatesCheck")}
      </h4>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {gates.map((g) => (
          <GateCard
            key={g.id}
            id={g.id}
            title={g.title}
            description={g.description}
            satisfied={g.satisfied}
          />
        ))}
      </div>
    </div>
  );
}

interface GateG5HandoffSectionProps {
  handoffChecked: boolean;
  isUpdatingG5: boolean;
  onHandoffChange: (checked: boolean) => void;
}

function GateG5HandoffSection({
  handoffChecked,
  isUpdatingG5,
  onHandoffChange,
}: GateG5HandoffSectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div data-slot="gate-g5" className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id="g5-handoff-ack"
          checked={handoffChecked}
          onCheckedChange={(checked) => onHandoffChange(Boolean(checked))}
          disabled={isUpdatingG5}
          className="mt-0.5"
          data-slot="checkbox-g5-handoff"
        />
        <div className="space-y-1">
          <Label
            htmlFor="g5-handoff-ack"
            className="cursor-pointer text-xs font-semibold text-foreground"
          >
            {tOnboarding("gate5Title")}
          </Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tOnboarding("gate5Desc")}
          </p>
        </div>
      </div>
    </div>
  );
}

interface ReplyModeSectionProps {
  autoSendEnabled: boolean;
  onToggleAutoSend: (checked: boolean) => void;
}

function ReplyModeSection({
  autoSendEnabled,
  onToggleAutoSend,
}: ReplyModeSectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <ShieldAlert className="size-4 text-primary" />
        <span>{tOnboarding("replyModeTitle")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{tOnboarding("replyModeDesc")}</p>

      <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onToggleAutoSend(false)}
          className={`cursor-pointer rounded-lg border p-3 text-start text-xs transition-all ${
            !autoSendEnabled
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-muted/20 hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center justify-between pb-1.5">
            <span className="font-semibold text-foreground">{tOnboarding("draftModeTitle")}</span>
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              {tOnboarding("recommendedBadge")}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {tOnboarding("draftModeDesc")}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onToggleAutoSend(true)}
          className={`cursor-pointer rounded-lg border p-3 text-start text-xs transition-all ${
            autoSendEnabled
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-muted/20 hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center justify-between pb-1.5">
            <span className="font-semibold text-foreground">
              {tOnboarding("autoSendModeTitle")}
            </span>
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
              {tOnboarding("autonomousBadge")}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {tOnboarding("autoSendModeDesc")}
          </p>
        </button>
      </div>

      <input
        type="checkbox"
        checked={autoSendEnabled}
        onChange={(e) => onToggleAutoSend(e.target.checked)}
        data-slot="toggle-auto-send"
        className="sr-only"
        aria-label={tOnboarding("replyModeTitle")}
      />
    </div>
  );
}

interface ActivationCtaFooterProps {
  canActivate: boolean;
  isActivating: boolean;
  onPrev: () => void;
  onActivateLive: () => void;
}

function ActivationCtaFooter({
  canActivate,
  isActivating,
  onPrev,
  onActivateLive,
}: ActivationCtaFooterProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const tCommon = useTranslations("common");

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onPrev}
          data-slot="btn-prev-step"
          className="gap-2"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
          <span>{tCommon("back")}</span>
        </Button>

        <Button
          type="button"
          onClick={onActivateLive}
          disabled={!canActivate || isActivating}
          loading={isActivating}
          data-slot="btn-activate-live"
          className="gap-2 px-6"
        >
          <Zap className="size-4" />
          <span>{tOnboarding("activateLiveButton")}</span>
        </Button>
      </div>

      {!canActivate && (
        <p className="flex items-center justify-end gap-1 text-end text-[11px] text-muted-foreground">
          <ShieldAlert className="size-3 text-warning" />
          <span>{tOnboarding("lockedButtonHint")}</span>
        </p>
      )}
    </div>
  );
}

export function StepLiveActivation({
  businessId,
  initialState,
  onPrev,
  onActivated,
}: StepLiveActivationProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(initialState || null);
  const [handoffChecked, setHandoffChecked] = useState(initialState?.handoffAcknowledged ?? false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);

  const [isUpdatingG5, setIsUpdatingG5] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [unmetGatesList, setUnmetGatesList] = useState<ActivationGateId[]>(
    initialState?.unmetGates || [],
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!businessId || initialState) return;

    apiClient
      .get<OnboardingState>(`/api/v1/businesses/${businessId}/onboarding`)
      .then((data) => {
        if (!mounted || !data) return;
        setState(data);
        setHandoffChecked(Boolean(data.handoffAcknowledged));
        setUnmetGatesList(data.unmetGates || []);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [businessId, initialState]);

  function handleHandoffChange(checked: boolean) {
    setHandoffChecked(checked);
    if (!businessId) return;

    setIsUpdatingG5(true);
    setErrorMessage(null);

    apiClient
      .patch<OnboardingState>(`/api/v1/businesses/${businessId}/onboarding`, {
        handoffAcknowledged: checked,
      })
      .then((updated) => {
        if (updated) {
          setState(updated);
          setUnmetGatesList(updated.unmetGates || []);
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : tOnboarding("handoffAckError");
        setErrorMessage(msg);
        setHandoffChecked(!checked);
      })
      .finally(() => {
        setIsUpdatingG5(false);
      });
  }

  function handleAutoSendToggle(checked: boolean) {
    setAutoSendEnabled(checked);
    const targetMode = checked ? "auto_send" : "approval_required";

    apiClient
      .patch(
        "/api/v1/ai/settings",
        { replyMode: targetMode },
        { headers: businessId ? { "x-business-id": businessId } : undefined },
      )
      .catch(() => {
        setAutoSendEnabled(!checked);
      });
  }

  function handleActivateLive() {
    setIsActivating(true);
    setErrorMessage(null);

    apiClient
      .patch("/api/v1/integrations/live", { enabled: true })
      .then(() => {
        if (onActivated) {
          onActivated();
        } else {
          router.push("/inbox" as Route);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.status === 422) {
          const rawPayload = err.raw as { error?: { unmet_gates?: ActivationGateId[] } };
          const rawUnmet = rawPayload?.error?.unmet_gates || ["G1", "G2", "G3", "G4", "G5"];
          setUnmetGatesList(rawUnmet);
          setErrorMessage(tOnboarding("activationUnmetGatesError", { gates: rawUnmet.join(", ") }));
        } else {
          const msg = err instanceof Error ? err.message : tOnboarding("activationUnexpectedError");
          setErrorMessage(msg);
        }
      })
      .finally(() => {
        setIsActivating(false);
      });
  }

  const g1Satisfied = !unmetGatesList.includes("G1");
  const g2Satisfied = !unmetGatesList.includes("G2");
  const g3Satisfied = !unmetGatesList.includes("G3");
  const g4Satisfied = !unmetGatesList.includes("G4");

  const canActivate =
    Boolean(state?.aiActivationReady) && handoffChecked && unmetGatesList.length === 0;

  const gates = [
    {
      id: "G1",
      title: tOnboarding("gateCatalogTitle"),
      description: tOnboarding("gateCatalogDesc"),
      satisfied: g1Satisfied,
    },
    {
      id: "G2",
      title: tOnboarding("gateRulesTitle"),
      description: tOnboarding("gateRulesDesc"),
      satisfied: g2Satisfied,
    },
    {
      id: "G3",
      title: tOnboarding("gateChannelTitle"),
      description: tOnboarding("gateChannelDesc"),
      satisfied: g3Satisfied,
    },
    {
      id: "G4",
      title: tOnboarding("gatePlaygroundTitle"),
      description: tOnboarding("gatePlaygroundDesc"),
      satisfied: g4Satisfied,
    },
  ];

  return (
    <div data-slot="step-live-activation" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Zap className="size-5" />
            <CardTitle>{tOnboarding("activationTitle")}</CardTitle>
          </div>
          <CardDescription>{tOnboarding("activationDesc")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <TechnicalGatesSection gates={gates} />

          <GateG5HandoffSection
            handoffChecked={handoffChecked}
            isUpdatingG5={isUpdatingG5}
            onHandoffChange={handleHandoffChange}
          />

          <ReplyModeSection
            autoSendEnabled={autoSendEnabled}
            onToggleAutoSend={handleAutoSendToggle}
          />

          <ActivationCtaFooter
            canActivate={canActivate}
            isActivating={isActivating}
            onPrev={onPrev}
            onActivateLive={handleActivateLive}
          />
        </CardContent>
      </Card>
    </div>
  );
}
