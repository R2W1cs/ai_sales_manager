"use client";

import { Coins, Layers, Radio, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";

import { formatPipelineMoney } from "./pipeline-formatter";

export interface PipelineMetricsBarProps {
  totalDeals: number;
  totalPipelineValue: number;
  currency: string;
  locale: string;
  isLoading: boolean;
  isRefreshing: boolean;
  isRealtimeActive: boolean;
  onRefresh: () => void;
}

export function PipelineMetricsBar({
  totalDeals,
  totalPipelineValue,
  currency,
  locale,
  isLoading,
  isRefreshing,
  isRealtimeActive,
  onRefresh,
}: PipelineMetricsBarProps): React.ReactElement {
  const t = useTranslations("pipeline");

  return (
    <Stack
      direction="row"
      justify="between"
      wrap
      className="rounded-lg border border-border/70 bg-card p-4 shadow-xs"
    >
      <Stack direction="row" size="lg" wrap>
        {/* Total Deals Metric */}
        <Stack direction="row" size="sm">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("totalDeals")}</p>
            <div data-testid="pipeline-total-deals" className="text-lg font-bold text-foreground">
              {isLoading ? <Skeleton className="h-5 w-12" /> : totalDeals}
            </div>
          </div>
        </Stack>

        <div className="hidden h-8 w-px bg-border/80 sm:block" />

        {/* Total Value Metric */}
        <Stack direction="row" size="sm">
          <div className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success">
            <Coins className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("totalPipelineValue")}</p>
            <div data-testid="pipeline-total-value" className="text-lg font-bold text-foreground">
              {isLoading ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                formatPipelineMoney(totalPipelineValue, currency, locale)
              )}
            </div>
          </div>
        </Stack>
      </Stack>

      {/* Live indicator & Refresh button */}
      <Stack direction="row" size="md" className="ms-auto">
        <Stack
          direction="row"
          size="xs"
          data-testid="pipeline-realtime-status"
          className="text-xs text-muted-foreground"
        >
          <Radio
            className={cn(
              "size-3.5",
              isRealtimeActive ? "animate-pulse text-success" : "text-muted-foreground/60",
            )}
            aria-hidden="true"
          />
          <span>{t("liveUpdates")}</span>
        </Stack>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading || isRefreshing}
          data-testid="pipeline-refresh-button"
          className="gap-1.5"
        >
          <RefreshCw
            className={cn("size-3.5", isRefreshing && "animate-spin")}
            aria-hidden="true"
          />
          <span>{isRefreshing ? t("refreshing") : t("refresh")}</span>
        </Button>
      </Stack>
    </Stack>
  );
}
