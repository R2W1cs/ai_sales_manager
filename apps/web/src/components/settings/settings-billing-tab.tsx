"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react";
import {
  AlertTriangle,
  Headphones,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import type { BillingUsageResponse } from "@app/shared";

export interface SettingsBillingTabProps {
  businessId: string | null;
  isOwner: boolean;
}

export function SettingsBillingTab({
  businessId,
  isOwner,
}: SettingsBillingTabProps): React.ReactElement | null {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [usage, setUsage] = useState<BillingUsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format cycle dates in Africa/Tunis
  const dateFormatter = React.useMemo(() => {
    return new Intl.DateTimeFormat(
      locale === "ar" ? "ar-TN" : locale === "en" ? "en-US" : "fr-TN",
      {
        timeZone: "Africa/Tunis",
        year: "numeric",
        month: "short",
        day: "numeric",
      },
    );
  }, [locale]);

  useEffect(() => {
    if (!isOwner) return;

    let isMounted = true;
    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};

    apiClient
      .get<BillingUsageResponse>("/api/v1/usage", { headers })
      .then((usageData) => {
        if (!isMounted) return;
        setUsage(usageData);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : t("errorLoadBilling");
        setError(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [businessId, isOwner, t]);

  // Invariant: Billing tab is strictly visible to OWNER role
  if (!isOwner) {
    return (
      <div
        className="flex flex-col items-center justify-center p-12 text-center"
        data-testid="billing-access-denied"
      >
        <Lock className="mb-3 size-8 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">{t("tabBilling")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("billingOwnerOnly")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="settings-billing-loading">
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const currentPlanCode = usage?.planCode || "starter";
  const limits = usage?.limits || { aiMessages: 500, seats: 2, channels: 1 };
  const current = usage?.current || { aiMessages: 0, seats: 1, channels: 0 };
  const percentUsed = usage?.percentUsed || 0;
  const isHardLimit = usage?.aiPaused || percentUsed >= 100;
  const isCritical95 = !isHardLimit && percentUsed >= 95;
  const isWarning80 = !isHardLimit && !isCritical95 && percentUsed >= 80;

  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      return dateFormatter.format(new Date(isoString));
    } catch {
      return isoString;
    }
  };

  const cycleStartFormatted = formatDate(usage?.cycleStart);
  const cycleEndFormatted = formatDate(usage?.cycleEnd);

  return (
    <div className="space-y-6" data-testid="settings-billing-tab">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Quota Warnings */}
      {isHardLimit && (
        <div
          data-testid="quota-hard-limit-banner"
          className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs font-medium text-destructive"
        >
          <AlertTriangle className="size-5 shrink-0" />
          <span>{t("quotaHardLimit")}</span>
        </div>
      )}

      {isCritical95 && (
        <div
          data-testid="quota-critical-banner"
          className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs font-medium text-destructive"
        >
          <AlertTriangle className="size-5 shrink-0" />
          <span>{t("quotaWarning95")}</span>
        </div>
      )}

      {isWarning80 && (
        <div
          data-testid="quota-warning-banner"
          className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-xs font-medium text-warning"
        >
          <AlertTriangle className="size-5 shrink-0" />
          <span>{t("quotaWarning85")}</span>
        </div>
      )}

      {/* Current Plan Overview */}
      <Card data-testid="current-plan-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Zap className="size-5" />
              <CardTitle className="text-base">{t("currentPlan")}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {cycleStartFormatted && cycleEndFormatted
                ? t("cycleDates", {
                    start: cycleStartFormatted,
                    end: cycleEndFormatted,
                    timezone: "Africa/Tunis",
                  })
                : t("billingCycle")}
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-black tracking-wide text-primary uppercase">
              {currentPlanCode}
            </span>
            <Button
              type="button"
              data-testid="upgrade-plan-button"
              onClick={() => setIsUpgradeOpen(true)}
            >
              <Sparkles className="me-2 size-4" />
              <span>{t("upgradePlan")}</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Quota Usage Bars */}
      <Card data-testid="quota-progress-bars">
        <CardHeader>
          <CardTitle className="text-base">{t("billingTitle")}</CardTitle>
          <CardDescription className="text-xs">{t("billingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI Messages Quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                {t("quotaAiMessages")}
              </span>
              <span className="font-mono text-muted-foreground">
                <strong className="text-foreground">{current.aiMessages}</strong> /{" "}
                {limits.aiMessages} ({Math.round(percentUsed)}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all duration-300 ${
                  isHardLimit || isCritical95
                    ? "bg-destructive"
                    : isWarning80
                      ? "bg-warning"
                      : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
              />
            </div>
          </div>

          {/* Seats Quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <Users className="size-3.5 text-primary" />
                {t("quotaSeats")}
              </span>
              <span className="font-mono text-muted-foreground">
                <strong className="text-foreground">{current.seats}</strong> / {limits.seats}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, (current.seats / Math.max(1, limits.seats)) * 100))}%`,
                }}
              />
            </div>
          </div>

          {/* Channels Quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <MessageSquare className="size-3.5 text-primary" />
                {t("quotaChannels")}
              </span>
              <span className="font-mono text-muted-foreground">
                <strong className="text-foreground">{current.channels}</strong> / {limits.channels}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, (current.channels / Math.max(1, limits.channels)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trust Footer */}
      <div className="flex items-center justify-center gap-2 py-4 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" />
        <span>{t("trustFooter")}</span>
      </div>

      {/* Manual Plan Upgrade Modal */}
      <DialogPrimitive.Root open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
          <DialogPrimitive.Popup
            data-testid="upgrade-modal"
            className="fixed inset-s-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl transition-opacity outline-none rtl:translate-x-1/2"
          >
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="size-5" />
                <h3 className="text-base font-bold text-foreground">{t("upgradeModalTitle")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUpgradeOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
                <span className="sr-only">{t("close")}</span>
              </button>
            </div>

            <p className="pb-4 text-xs text-muted-foreground">{t("upgradeModalDesc")}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Starter Plan */}
              <div
                className={`rounded-lg border p-4 ${
                  currentPlanCode === "starter"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-foreground">{t("planStarter")}</h4>
                  {currentPlanCode === "starter" && (
                    <span className="text-[10px] font-semibold text-primary">
                      {t("currentPlan")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("planStarterDesc")}</p>
              </div>

              {/* Growth Plan */}
              <div
                className={`rounded-lg border p-4 ${
                  currentPlanCode === "growth"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-foreground">{t("planGrowth")}</h4>
                  {currentPlanCode === "growth" && (
                    <span className="text-[10px] font-semibold text-primary">
                      {t("currentPlan")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("planGrowthDesc")}</p>
              </div>

              {/* Scale Plan */}
              <div
                className={`rounded-lg border p-4 ${
                  currentPlanCode === "scale"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-foreground">{t("planScale")}</h4>
                  {currentPlanCode === "scale" && (
                    <span className="text-[10px] font-semibold text-primary">
                      {t("currentPlan")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("planScaleDesc")}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Headphones className="size-4 text-primary" />
                <span>{t("dedicatedSupport")}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsUpgradeOpen(false)}>
                  {t("close")}
                </Button>
                <Button
                  data-testid="contact-sales-button"
                  onClick={() => {
                    window.location.href =
                      "mailto:sales@moufid.ai?subject=Demande%20d%27upgrade%20forfait";
                  }}
                >
                  {t("contactSales")}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
