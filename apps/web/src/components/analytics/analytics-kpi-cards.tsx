"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Coins,
  MessageSquare,
  Minus,
  ShoppingBag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import type { AnalyticsOverviewSummary, AnalyticsTrends } from "@app/shared";

import { formatDeltaPercent, formatDeltaPoints, formatGmvMoney } from "./analytics-formatters";

export interface AnalyticsKpiCardsProps {
  summary?: AnalyticsOverviewSummary | null;
  trends?: AnalyticsTrends | null;
  isLoading?: boolean;
  locale?: string;
  className?: string;
}

interface TrendBadgeProps {
  deltaInfo: { text: string; direction: "up" | "down" | "neutral" };
  ariaLabel?: string;
}

function TrendBadge({ deltaInfo, ariaLabel }: TrendBadgeProps): React.ReactElement {
  const { text, direction } = deltaInfo;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors",
        direction === "up" && "border-success/25 bg-success/10 text-success",
        direction === "down" && "border-destructive/25 bg-destructive/10 text-destructive",
        direction === "neutral" && "border-border bg-muted text-muted-foreground",
      )}
      aria-label={ariaLabel ?? text}
    >
      {direction === "up" && <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />}
      {direction === "down" && <ArrowDownRight className="size-3 shrink-0" aria-hidden="true" />}
      {direction === "neutral" && <Minus className="size-3 shrink-0" aria-hidden="true" />}
      <span>{text}</span>
    </span>
  );
}

function KpiSkeletons({ className }: { className?: string }): React.ReactElement {
  return (
    <div
      data-testid="analytics-kpi-skeletons"
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
    >
      {Array.from({ length: 4 }).map((_, idx) => (
        <Card key={idx} className="border-border/60 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="mb-3 h-8 w-36" />
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}

interface CardProps {
  summary?: AnalyticsOverviewSummary | null;
  trends?: AnalyticsTrends | null;
  locale: string;
}

function GmvKpiCard({ summary, trends, locale }: CardProps): React.ReactElement {
  const t = useTranslations("analytics");
  const gmvValue = formatGmvMoney(summary?.gmv, locale);
  const gmvDelta = formatDeltaPercent(trends?.gmvDelta);

  return (
    <Card className="border-border/70 bg-card shadow-xs transition-shadow hover:shadow-sm">
      <CardHeader className="p-5 pb-2">
        <Stack direction="row" justify="between" className="w-full">
          <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("kpiGmvTitle")}
          </CardTitle>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Coins className="size-4 shrink-0" aria-hidden="true" />
          </div>
        </Stack>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <Stack direction="column" size="sm">
          <div
            className="text-2xl font-bold tracking-tight text-foreground"
            data-testid="kpi-gmv-value"
          >
            {gmvValue}
          </div>
          <Stack direction="row" justify="between" className="w-full text-xs text-muted-foreground">
            <TrendBadge deltaInfo={gmvDelta} ariaLabel={t("periodDescription")} />
            <span className="truncate ps-2">{t("kpiGmvSubtext")}</span>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function OrdersKpiCard({ summary, trends, locale }: CardProps): React.ReactElement {
  const t = useTranslations("analytics");
  const ordersCount = (summary?.ordersCount ?? summary?.ordersCreated ?? 0).toLocaleString(locale);
  const ordersDelta = formatDeltaPercent(trends?.ordersDelta);
  const confirmedCount = summary?.conversionConfirmed ?? 0;

  return (
    <Card className="border-border/70 bg-card shadow-xs transition-shadow hover:shadow-sm">
      <CardHeader className="p-5 pb-2">
        <Stack direction="row" justify="between" className="w-full">
          <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("kpiOrdersTitle")}
          </CardTitle>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
          </div>
        </Stack>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <Stack direction="column" size="sm">
          <div
            className="text-2xl font-bold tracking-tight text-foreground"
            data-testid="kpi-orders-value"
          >
            {ordersCount}
          </div>
          <Stack direction="row" justify="between" className="w-full text-xs text-muted-foreground">
            <TrendBadge deltaInfo={ordersDelta} ariaLabel={t("periodDescription")} />
            <span className="truncate ps-2">
              {t("kpiOrdersSubtext", { count: confirmedCount })}
            </span>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ConversationsKpiCard({ summary, trends, locale }: CardProps): React.ReactElement {
  const t = useTranslations("analytics");
  const convsCount = (summary?.conversationsCount ?? 0).toLocaleString(locale);
  const convsDelta = formatDeltaPercent(trends?.conversationsDelta);
  const messagesAi = summary?.messagesAi ?? 0;
  const messagesHuman = summary?.messagesHuman ?? 0;
  const totalMessages = messagesAi + messagesHuman;
  const aiPercent = totalMessages > 0 ? Math.round((messagesAi / totalMessages) * 100) : 0;
  const humanPercent = totalMessages > 0 ? 100 - aiPercent : 0;

  return (
    <Card className="border-border/70 bg-card shadow-xs transition-shadow hover:shadow-sm">
      <CardHeader className="p-5 pb-2">
        <Stack direction="row" justify="between" className="w-full">
          <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("kpiConversationsTitle")}
          </CardTitle>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
          </div>
        </Stack>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <Stack direction="column" size="sm">
          <div
            className="text-2xl font-bold tracking-tight text-foreground"
            data-testid="kpi-convs-value"
          >
            {convsCount}
          </div>
          <div className="w-full space-y-1.5">
            <Stack
              direction="row"
              justify="between"
              className="w-full text-xs text-muted-foreground"
            >
              <TrendBadge deltaInfo={convsDelta} ariaLabel={t("periodDescription")} />
              <span className="truncate ps-2 text-[11px]">
                {t("kpiConversationsSubtext", { aiPercent, humanPercent })}
              </span>
            </Stack>
            {totalMessages > 0 && (
              <div
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
                aria-label={t("aiPercentAria", { percent: aiPercent })}
              >
                <div className="bg-primary transition-[width]" style={{ width: `${aiPercent}%` }} />
                <div
                  className="bg-muted-foreground/40 transition-[width]"
                  style={{ width: `${humanPercent}%` }}
                />
              </div>
            )}
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AiResolutionKpiCard({ summary, trends }: CardProps): React.ReactElement {
  const t = useTranslations("analytics");
  const aiResolutionRate =
    summary?.aiResolutionRate !== null && summary?.aiResolutionRate !== undefined
      ? `${Math.round(summary.aiResolutionRate * 100)}%`
      : "—";
  const aiResolutionDelta = formatDeltaPoints(trends?.aiResolutionRateDelta);
  const handoffsCount = summary?.handoffsTotal ?? 0;

  let topReasonSnippet = "";
  if (summary?.handoffsByReason && Object.keys(summary.handoffsByReason).length > 0) {
    const top = Object.entries(summary.handoffsByReason).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) {
      topReasonSnippet = ` (${top[0]}: ${top[1]})`;
    }
  }

  return (
    <Card className="border-border/70 bg-card shadow-xs transition-shadow hover:shadow-sm">
      <CardHeader className="p-5 pb-2">
        <Stack direction="row" justify="between" className="w-full">
          <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("kpiAiResolutionTitle")}
          </CardTitle>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="size-4 shrink-0" aria-hidden="true" />
          </div>
        </Stack>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <Stack direction="column" size="sm">
          <div
            className="text-2xl font-bold tracking-tight text-foreground"
            data-testid="kpi-airesolution-value"
          >
            {aiResolutionRate}
          </div>
          <Stack direction="row" justify="between" className="w-full text-xs text-muted-foreground">
            <TrendBadge deltaInfo={aiResolutionDelta} ariaLabel={t("periodDescription")} />
            <span
              className="truncate ps-2"
              title={topReasonSnippet ? `${handoffsCount}${topReasonSnippet}` : undefined}
            >
              {t("kpiAiResolutionSubtext", { handoffs: handoffsCount })}
              {topReasonSnippet}
            </span>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function AnalyticsKpiCards({
  summary,
  trends,
  isLoading = false,
  locale = "fr-FR",
  className,
}: AnalyticsKpiCardsProps): React.ReactElement {
  if (isLoading) {
    return <KpiSkeletons className={className} />;
  }

  return (
    <div
      data-testid="analytics-kpi-cards"
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
    >
      <GmvKpiCard summary={summary} trends={trends} locale={locale} />
      <OrdersKpiCard summary={summary} trends={trends} locale={locale} />
      <ConversationsKpiCard summary={summary} trends={trends} locale={locale} />
      <AiResolutionKpiCard summary={summary} trends={trends} locale={locale} />
    </div>
  );
}
