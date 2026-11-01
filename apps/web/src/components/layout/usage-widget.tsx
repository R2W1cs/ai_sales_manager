"use client";

import { AlertTriangle, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { BillingUsageResponse, MemberRole } from "@app/shared";

import { useTenant } from "./tenant-context";

interface UsageStatus {
  percent: number;
  isDanger: boolean;
  isWarning: boolean;
  badgeClass: string;
  barColorClass: string;
}

function getUsageStatus(usage: BillingUsageResponse): UsageStatus {
  const percent = Math.min(100, Math.max(0, usage.percentUsed));
  const isDanger = percent >= 95 || usage.aiPaused;
  const isWarning = percent >= 80 && !isDanger;

  const badgeClass = isDanger
    ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
    : isWarning
      ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
      : "border-border bg-card/60 text-muted-foreground hover:bg-muted hover:text-foreground";

  const barColorClass = isDanger ? "bg-destructive" : isWarning ? "bg-warning" : "bg-primary";

  return { percent, isDanger, isWarning, badgeClass, barColorClass };
}

function useBillingUsage(businessId: string | null, role: MemberRole | null) {
  const [usage, setUsage] = useState<BillingUsageResponse | null>(null);

  useEffect(() => {
    if (role !== "owner" || !businessId) {
      return;
    }

    let mounted = true;

    apiClient
      .get<BillingUsageResponse>("/api/v1/billing/usage", {
        headers: { "x-business-id": businessId },
        skipRefresh: true,
      })
      .then((res) => {
        if (mounted) setUsage(res);
      })
      .catch(() => {
        if (mounted) setUsage(null);
      });

    return () => {
      mounted = false;
    };
  }, [businessId, role]);

  return usage;
}

function UsageDetailsContent({
  usage,
  status,
}: {
  usage: BillingUsageResponse;
  status: UsageStatus;
}) {
  const tUsage = useTranslations("usage");
  const { percent, isDanger, isWarning, barColorClass } = status;

  return (
    <DropdownMenuContent
      align="end"
      className="w-64 space-y-2.5 border border-border bg-popover p-3 text-popover-foreground shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <DropdownMenuLabel className="p-0 text-xs font-semibold text-foreground">
          {tUsage("planUsageTitle")}
        </DropdownMenuLabel>
        <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
          {usage.planCode}
        </span>
      </div>

      <DropdownMenuSeparator className="bg-border" />

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{tUsage("aiMessages")}</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            {usage.current.aiMessages.toLocaleString()} / {usage.limits.aiMessages.toLocaleString()}
          </span>
        </div>

        {/* Quota Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-300", barColorClass)}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex justify-between pt-0.5 text-[11px] text-muted-foreground">
          <span>{tUsage("consumed")}</span>
          <span className="font-semibold text-foreground tabular-nums">{percent}%</span>
        </div>
      </div>

      {isDanger && (
        <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{usage.aiPaused ? tUsage("quotaExhausted") : tUsage("quotaWarning")}</span>
        </div>
      )}

      {isWarning && (
        <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{tUsage("quotaCaution")}</span>
        </div>
      )}
    </DropdownMenuContent>
  );
}

export interface UsageWidgetProps {
  className?: string;
}

export function UsageWidget({ className }: UsageWidgetProps): React.ReactElement | null {
  const tUsage = useTranslations("usage");
  const { currentBusinessId, currentRole } = useTenant();
  const usage = useBillingUsage(currentBusinessId, currentRole);

  if (currentRole !== "owner" || !usage) {
    return null;
  }

  const status = getUsageStatus(usage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
              status.badgeClass,
              className,
            )}
            aria-label={tUsage("usageStats")}
          />
        }
      >
        {status.isDanger || status.isWarning ? (
          <AlertTriangle className="size-3.5 shrink-0" />
        ) : (
          <Zap className="size-3.5 shrink-0 text-primary" />
        )}
        <span className="font-mono tabular-nums">{status.percent}%</span>
      </DropdownMenuTrigger>
      <UsageDetailsContent usage={usage} status={status} />
    </DropdownMenu>
  );
}

export function PlanUsageCard({ className }: { className?: string }): React.ReactElement | null {
  const tUsage = useTranslations("usage");
  const { currentBusinessId, currentRole } = useTenant();
  const usage = useBillingUsage(currentBusinessId, currentRole);

  if (currentRole !== "owner" || !usage) {
    return null;
  }

  const status = getUsageStatus(usage);

  return (
    <div
      data-slot="plan-usage-card"
      className={cn(
        "rounded-lg border border-border bg-card p-2.5 text-xs shadow-2xs select-none",
        status.isDanger && "border-destructive/30 bg-destructive/5",
        status.isWarning && "border-warning/30 bg-warning/5",
        className,
      )}
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-foreground">{tUsage("aiUsage")}</span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase">
          {usage.planCode}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", status.barColorClass)}
          style={{ width: `${status.percent}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>
          {usage.current.aiMessages} / {usage.limits.aiMessages}
        </span>
        <span className="font-semibold text-foreground">{status.percent}%</span>
      </div>
    </div>
  );
}
