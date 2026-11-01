"use client";

import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod, DailyMetricPoint } from "@app/shared";

import { formatDateLabel, getPeriodDateStep } from "./analytics-formatters";

export interface AiResolutionChartProps {
  timeseries?: DailyMetricPoint[];
  isLoading?: boolean;
  locale?: string;
  period?: AnalyticsPeriod;
  className?: string;
}

interface AiPoint {
  x: number;
  rateY: number | null;
  rate: number | null;
  aiMsg: number;
  humanMsg: number;
  totalMsg: number;
  aiHeight: number;
  humanHeight: number;
  data: DailyMetricPoint;
  idx: number;
}

function computeAiPoints(
  timeseries: DailyMetricPoint[],
  chartWidth: number,
  chartHeight: number,
  padLeft: number,
  padTop: number,
  maxVolume: number,
): AiPoint[] {
  if (!timeseries || timeseries.length === 0) return [];
  return timeseries.map((item, idx) => {
    const x =
      timeseries.length === 1
        ? padLeft + chartWidth / 2
        : padLeft + (idx / (timeseries.length - 1)) * chartWidth;

    const rate =
      item.aiResolutionRate !== null && item.aiResolutionRate !== undefined
        ? Math.min(1, Math.max(0, item.aiResolutionRate))
        : null;
    const rateY = rate !== null ? padTop + chartHeight - rate * chartHeight : null;

    const aiMsg = Math.max(0, item.messagesAi || 0);
    const humanMsg = Math.max(0, item.messagesHuman || 0);
    const stackedSum = aiMsg + humanMsg;
    const totalMsg = item.messagesHandled || stackedSum;

    const safeMaxVolume = Math.max(1, maxVolume);
    const totalStackedHeight = Math.min(chartHeight, (stackedSum / safeMaxVolume) * chartHeight);
    const aiHeight = stackedSum > 0 ? (aiMsg / stackedSum) * totalStackedHeight : 0;
    const humanHeight = totalStackedHeight - aiHeight;

    return {
      x,
      rateY,
      rate,
      aiMsg,
      humanMsg,
      totalMsg,
      aiHeight,
      humanHeight,
      data: item,
      idx,
    };
  });
}

function computeRateLinePath(points: AiPoint[]): string {
  const validRatePoints = points.filter((p) => p.rateY !== null);
  if (validRatePoints.length === 0) return "";
  if (validRatePoints.length === 1) {
    const p = validRatePoints[0]!;
    return `M ${p.x - 20} ${p.rateY} L ${p.x + 20} ${p.rateY}`;
  }
  return validRatePoints.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.rateY}` : `${acc} L ${curr.x} ${curr.rateY}`;
  }, "");
}

function AiResolutionSkeleton({ className }: { className?: string }): React.ReactElement {
  return (
    <Card
      data-testid="ai-resolution-chart-skeleton"
      className={cn("border-border/70 bg-card p-6 shadow-xs", className)}
    >
      <div className="flex items-center justify-between pb-6">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-24 rounded-md" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </Card>
  );
}

function AiResolutionEmpty(): React.ReactElement {
  const t = useTranslations("analytics");
  return (
    <div
      data-testid="ai-resolution-chart-empty"
      className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground"
    >
      <p className="text-sm">{t("chartAiEmpty")}</p>
    </div>
  );
}

interface AiTooltipProps {
  activePoint: AiPoint;
  locale: string;
  svgWidth: number;
}

function AiResolutionTooltip({
  activePoint,
  locale,
  svgWidth,
}: AiTooltipProps): React.ReactElement {
  const t = useTranslations("analytics");
  const leftPercent = Math.max(10, Math.min(80, (activePoint.x / svgWidth) * 100));

  return (
    <div
      data-testid="ai-resolution-chart-tooltip"
      className="pointer-events-none absolute -top-1 rounded-lg border border-border/80 bg-popover/95 px-3 py-2 text-xs shadow-md backdrop-blur-xs"
      style={{
        left: `${leftPercent}%`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="font-medium text-foreground">
        {formatDateLabel(activePoint.data.date, locale)}
      </div>
      <div className="font-semibold text-foreground">
        {t("chartAiTooltipRate", {
          rate: activePoint.rate !== null ? Math.round(activePoint.rate * 100) : "—",
        })}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{t("chartAiTooltipAiMessages", { count: activePoint.aiMsg })}</span>
        <span>•</span>
        <span>{t("chartAiTooltipHumanMessages", { count: activePoint.humanMsg })}</span>
      </div>
      {activePoint.data.handoffsTotal !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          {t("chartAiTooltipHandoffs", { count: activePoint.data.handoffsTotal })}
        </div>
      )}
    </div>
  );
}

interface AiSvgPlotProps {
  points: AiPoint[];
  rateLinePath: string;
  yTicks: { yPos: number; ratePercent: string; vol: number }[];
  xLabels: AiPoint[];
  activePoint: AiPoint | null;
  hoveredIdx: number | null;
  locale: string;
  svgWidth: number;
  svgHeight: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  chartWidth: number;
  chartHeight: number;
  onHover: (idx: number | null) => void;
}

function AiResolutionSvgPlot({
  points,
  rateLinePath,
  yTicks,
  xLabels,
  activePoint,
  hoveredIdx,
  locale,
  svgWidth,
  svgHeight,
  padLeft,
  padRight,
  padTop,
  padBottom,
  chartWidth,
  chartHeight,
  onHover,
}: AiSvgPlotProps): React.ReactElement {
  const t = useTranslations("analytics");

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="h-56 w-full overflow-visible select-none"
      aria-label={t("chartAiTitle")}
    >
      {/* Horizontal Grid lines */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={padLeft}
            y1={tick.yPos}
            x2={svgWidth - padRight}
            y2={tick.yPos}
            stroke="var(--color-border)"
            strokeOpacity="0.6"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={padLeft - 8}
            y={tick.yPos + 3.5}
            textAnchor="end"
            className="fill-muted-foreground font-mono text-[10px]"
          >
            {tick.vol}
          </text>
          <text
            x={svgWidth - padRight + 8}
            y={tick.yPos + 3.5}
            textAnchor="start"
            className="fill-muted-foreground font-mono text-[10px]"
          >
            {tick.ratePercent}
          </text>
        </g>
      ))}

      {/* Stacked Bars: Human at bottom, AI stacked above */}
      {points.map((p) => {
        const barWidth = Math.max(3, Math.min(12, (chartWidth / points.length) * 0.5));
        const humanY = padTop + chartHeight - p.humanHeight;
        const aiY = humanY - p.aiHeight;

        return (
          <g key={`bars-${p.idx}`}>
            {p.humanHeight > 0 && (
              <rect
                x={p.x - barWidth / 2}
                y={humanY}
                width={barWidth}
                height={p.humanHeight}
                rx={1.5}
                className="fill-muted-foreground/45"
              />
            )}
            {p.aiHeight > 0 && (
              <rect
                x={p.x - barWidth / 2}
                y={aiY}
                width={barWidth}
                height={p.aiHeight}
                rx={1.5}
                className="fill-primary/80"
              />
            )}
          </g>
        );
      })}

      {/* Rate Line */}
      {rateLinePath && (
        <path
          d={rateLinePath}
          fill="none"
          stroke="var(--color-foreground)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Active Guideline */}
      {activePoint && (
        <line
          x1={activePoint.x}
          y1={padTop}
          x2={activePoint.x}
          y2={padTop + chartHeight}
          stroke="var(--color-foreground)"
          strokeWidth="1"
          strokeDasharray="3 3"
          className="opacity-60"
        />
      )}

      {/* Rate Points */}
      {points.map((p) => {
        const isHovered = hoveredIdx === p.idx;
        return (
          <g key={`point-${p.idx}`}>
            {p.rateY !== null && (
              <circle
                cx={p.x}
                cy={p.rateY}
                r={isHovered ? 4.5 : 2.5}
                className={
                  isHovered
                    ? "fill-foreground stroke-card stroke-2"
                    : "fill-card stroke-foreground stroke-[1.5]"
                }
              />
            )}
            <rect
              x={p.x - 12}
              y={padTop}
              width={24}
              height={chartHeight + padBottom}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => onHover(p.idx)}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}

      {/* Date Labels */}
      {xLabels.map((lbl, idx) => (
        <text
          key={`x-${idx}`}
          x={lbl.x}
          y={svgHeight - 10}
          textAnchor="middle"
          className="fill-muted-foreground font-sans text-[10px]"
        >
          {formatDateLabel(lbl.data.date, locale)}
        </text>
      ))}
    </svg>
  );
}

export function AiResolutionChart({
  timeseries = [],
  isLoading = false,
  locale = "fr-FR",
  period = "30d",
  className,
}: AiResolutionChartProps): React.ReactElement {
  const t = useTranslations("analytics");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (isLoading) {
    return <AiResolutionSkeleton className={className} />;
  }

  const hasData = timeseries && timeseries.length > 0;

  const svgWidth = 640;
  const svgHeight = 240;
  const padLeft = 45;
  const padRight = 45;
  const padTop = 20;
  const padBottom = 35;
  const chartWidth = svgWidth - padLeft - padRight;
  const chartHeight = svgHeight - padTop - padBottom;

  const maxVolumeRaw = hasData
    ? Math.max(
        ...timeseries.map((d) => {
          const stacked = Math.max(0, d.messagesAi || 0) + Math.max(0, d.messagesHuman || 0);
          const handled = Math.max(0, d.messagesHandled || 0);
          return Math.max(stacked, handled, 1);
        }),
      )
    : 10;
  const maxVolume = Math.ceil(maxVolumeRaw * 1.2) || 10;

  const points = computeAiPoints(timeseries, chartWidth, chartHeight, padLeft, padTop, maxVolume);
  const rateLinePath = computeRateLinePath(points);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const yPos = padTop + chartHeight - ratio * chartHeight;
    const ratePercent = `${Math.round(ratio * 100)}%`;
    const vol = Math.round(ratio * maxVolume);
    return { yPos, ratePercent, vol };
  });

  const step = getPeriodDateStep(period);
  const xLabels = points.filter((_, idx) => idx % step === 0 || idx === points.length - 1);
  const activePoint = hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : null;
  const periodLabel = t(
    period === "7d" ? "period7d" : period === "90d" ? "period90d" : "period30d",
  );

  return (
    <Card
      data-testid="ai-resolution-chart"
      className={cn(
        "border-border/70 bg-card shadow-xs transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold text-foreground">
              {t("chartAiTitle")}
            </CardTitle>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Bot className="size-3" aria-hidden="true" />
              {periodLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t("chartAiSubtitle")}</p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-primary" />
            <span className="text-muted-foreground">{t("chartAiLegendAi")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-muted-foreground/50" />
            <span className="text-muted-foreground">{t("chartAiLegendHuman")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-foreground" />
            <span className="text-muted-foreground">{t("chartAiLegendRate")}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {!hasData ? (
          <AiResolutionEmpty />
        ) : (
          <div className="relative w-full overflow-hidden">
            <AiResolutionSvgPlot
              points={points}
              rateLinePath={rateLinePath}
              yTicks={yTicks}
              xLabels={xLabels}
              activePoint={activePoint}
              hoveredIdx={hoveredIdx}
              locale={locale}
              svgWidth={svgWidth}
              svgHeight={svgHeight}
              padLeft={padLeft}
              padRight={padRight}
              padTop={padTop}
              padBottom={padBottom}
              chartWidth={chartWidth}
              chartHeight={chartHeight}
              onHover={setHoveredIdx}
            />
            {activePoint && (
              <AiResolutionTooltip activePoint={activePoint} locale={locale} svgWidth={svgWidth} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
