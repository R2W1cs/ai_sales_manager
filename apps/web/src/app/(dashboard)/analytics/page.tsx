"use client";

import { AlertCircle, BarChart3, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { AiResolutionChart } from "@/components/analytics/ai-resolution-chart";
import { AnalyticsKpiCards } from "@/components/analytics/analytics-kpi-cards";
import { RevenueChart } from "@/components/analytics/revenue-chart";
import { useTenant } from "@/components/layout/tenant-context";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Stack } from "@/components/ui/stack";
import { Wrapper } from "@/components/ui/wrapper";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AnalyticsOverviewResponse, AnalyticsPeriod } from "@app/shared";

export default function AnalyticsPage(): React.ReactElement {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const { currentBusinessId } = useTenant();

  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [prevBusinessId, setPrevBusinessId] = useState<string | null>(currentBusinessId);
  if (currentBusinessId !== prevBusinessId) {
    setPrevBusinessId(currentBusinessId);
    setData(null);
    setIsLoading(true);
  }

  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAnalytics = useCallback(
    (targetBusinessId: string, targetPeriod: AnalyticsPeriod, signal: AbortSignal) => {
      const requestId = ++activeRequestIdRef.current;

      return apiClient
        .get<AnalyticsOverviewResponse>(`/api/v1/analytics/overview?period=${targetPeriod}`, {
          headers: { "x-business-id": targetBusinessId },
          signal,
        })
        .then((res) => {
          if (signal.aborted || activeRequestIdRef.current !== requestId) {
            return;
          }
          setData(res);
          setError(null);
        })
        .catch((err: unknown) => {
          if (
            signal.aborted ||
            activeRequestIdRef.current !== requestId ||
            (err instanceof Error && err.name === "AbortError")
          ) {
            return;
          }
          const errorMsg = err instanceof Error ? err.message : t("errorDesc");
          setError(errorMsg);
          setData(null);
        })
        .finally(() => {
          if (!signal.aborted && activeRequestIdRef.current === requestId) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        });
    },
    [t],
  );

  useEffect(() => {
    if (!currentBusinessId) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    void fetchAnalytics(currentBusinessId, period, controller.signal);

    return () => {
      controller.abort();
    };
  }, [currentBusinessId, period, fetchAnalytics]);

  const handlePeriodChange = (newPeriod: AnalyticsPeriod): void => {
    if (newPeriod === period) return;
    setData(null);
    setIsLoading(true);
    setPeriod(newPeriod);
  };

  const handleRefresh = (): void => {
    if (!currentBusinessId) return;
    setIsRefreshing(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    void fetchAnalytics(currentBusinessId, period, controller.signal);
  };

  const periods: { id: AnalyticsPeriod; label: string }[] = [
    { id: "7d", label: t("period7d") },
    { id: "30d", label: t("period30d") },
    { id: "90d", label: t("period90d") },
  ];

  return (
    <div className="h-full flex-1 overflow-y-auto bg-background">
      <Container className="py-4 md:py-6">
        <Wrapper gap="lg">
          {/* Page Header */}
          <Stack direction="row" justify="between" wrap className="border-b border-border/60 pb-4">
            <Stack direction="column" size="xs">
              <Stack direction="row" size="sm">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="size-4.5" aria-hidden="true" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
              </Stack>
              <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
            </Stack>

            {/* Period Selector & Refresh Controls */}
            <Stack direction="row" size="sm" wrap>
              <div
                role="tablist"
                aria-label={t("periodLabel")}
                className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-1"
              >
                {periods.map((p) => {
                  const isActive = period === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => handlePeriodChange(p.id)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-medium transition-all",
                        isActive
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={isLoading || isRefreshing}
                onClick={handleRefresh}
                className="h-8 gap-1.5 border-border/70 text-xs"
                aria-label={t("refresh")}
              >
                <RefreshCw
                  className={cn("size-3.5", isRefreshing && "animate-spin")}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">
                  {isRefreshing ? t("refreshing") : t("refresh")}
                </span>
              </Button>
            </Stack>
          </Stack>

          {/* Error Alert */}
          {error && (
            <Stack
              direction="row"
              justify="between"
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
            >
              <Stack direction="row" size="sm">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </Stack>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="ms-3 h-7 border-destructive/30 text-xs hover:bg-destructive/20"
              >
                {t("retry")}
              </Button>
            </Stack>
          )}

          {/* KPI Cards Grid */}
          <AnalyticsKpiCards
            summary={data?.summary}
            trends={data?.trends}
            isLoading={isLoading}
            locale={locale}
          />

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RevenueChart
              timeseries={data?.timeseries}
              isLoading={isLoading}
              locale={locale}
              period={period}
            />
            <AiResolutionChart
              timeseries={data?.timeseries}
              isLoading={isLoading}
              locale={locale}
              period={period}
            />
          </div>
        </Wrapper>
      </Container>
    </div>
  );
}
