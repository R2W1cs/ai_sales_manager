"use client";

import { TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useId, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod, DailyMetricPoint } from "@app/shared";

import {
  formatDateLabel,
  formatGmvMoney,
  formatGmvNumber,
  getPeriodDateStep,
} from "./analytics-formatters";

export interface RevenueChartProps {
  timeseries?: DailyMetricPoint[];
  isLoading?: boolean;
  locale?: string;
  period?: AnalyticsPeriod;
  className?: string;
}

interface RevenuePoint {
  x: number;
  y: number;
  data: DailyMetricPoint;
  idx: number;
}

function computeRevenuePoints(
  timeseries: DailyMetricPoint[],
  chartWidth: number,
  chartHeight: number,
  padLeft: number,
  padTop: number,
  yCeilMillimes: number,
): RevenuePoint[] {
  if (!timeseries || timeseries.length === 0) return [];
  return timeseries.map((item, idx) => {
    const x =
      timeseries.length === 1
        ? padLeft + chartWidth / 2
        : padLeft + (idx / (timeseries.length - 1)) * chartWidth;
    const normalizedY = Math.min(1, Math.max(0, (item.gmv || 0) / yCeilMillimes));
    const y = padTop + chartHeight - normalizedY * chartHeight;
    return { x, y, data: item, idx };
  });
}

function computeRevenuePaths(
  points: RevenuePoint[],
  chartHeight: number,
  padTop: number,
): { linePath: string; areaPath: string } {
  if (points.length === 0) return { linePath: "", areaPath: "" };
  if (points.length === 1) {
    const p = points[0]!;
    const linePath = `M ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y}`;
    const areaPath = `M ${p.x - 20} ${padTop + chartHeight} L ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y} L ${p.x + 20} ${padTop + chartHeight} Z`;
    return { linePath, areaPath };
  }
  const linePath = points.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, "");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const areaPath = `${linePath} L ${last.x} ${padTop + chartHeight} L ${first.x} ${padTop + chartHeight} Z`;
  return { linePath, areaPath };
}

function RevenueChartSkeleton({ className }: { className?: string }): React.ReactElement {
  return (
    <Card
      data-testid="revenue-chart-skeleton"
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

function RevenueChartEmpty(): React.ReactElement {
  const t = useTranslations("analytics");
  return (
    <div
      data-testid="revenue-chart-empty"
      className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 p-6 text-center text-muted-foreground"
    >
      <p className="text-sm">{t("chartRevenueEmpty")}</p>
    </div>
  );
}

interface RevenueTooltipProps {
  activePoint: RevenuePoint;
  locale: string;
  svgWidth: number;
}

function RevenueTooltip({
  activePoint,
  locale,
  svgWidth,
}: RevenueTooltipProps): React.ReactElement {
  const t = useTranslations("analytics");
  const leftPercent = Math.max(10, Math.min(80, (activePoint.x / svgWidth) * 100));

  return (
    <div
      data-testid="revenue-chart-tooltip"
      className="pointer-events-none absolute -top-1 rounded-lg border border-border/80 bg-popover/95 px-3 py-2 text-xs shadow-md backdrop-blur-xs"
      style={{
        left: `${leftPercent}%`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="font-medium text-foreground">
        {formatDateLabel(activePoint.data.date, locale)}
      </div>
      <div className="flex items-center gap-1.5 font-semibold text-primary">
        <span>
          {t("chartRevenueTooltipRevenue", {
            amount: formatGmvNumber(activePoint.data.gmv, locale),
          })}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {t("chartRevenueTooltipOrders", {
          count: activePoint.data.ordersCount ?? activePoint.data.ordersCreated ?? 0,
        })}
      </div>
    </div>
  );
}

interface RevenueSvgPlotProps {
  points: RevenuePoint[];
  linePath: string;
  areaPath: string;
  yTicks: { yPos: number; label: string }[];
  xLabels: RevenuePoint[];
  activePoint: RevenuePoint | null;
  hoveredIdx: number | null;
  gradientId: string;
  locale: string;
  svgWidth: number;
  svgHeight: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  chartHeight: number;
  onHover: (idx: number | null) => void;
}

function RevenueSvgPlot({
  points,
  linePath,
  areaPath,
  yTicks,
  xLabels,
  activePoint,
  hoveredIdx,
  gradientId,
  locale,
  svgWidth,
  svgHeight,
  padLeft,
  padRight,
  padTop,
  padBottom,
  chartHeight,
  onHover,
}: RevenueSvgPlotProps): React.ReactElement {
  const t = useTranslations("analytics");

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="h-56 w-full overflow-visible select-none"
      aria-label={t("chartRevenueTitle")}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Grid lines and labels */}
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
            {tick.label}
          </text>
        </g>
      ))}

      {/* Volume bars */}
      {points.map((p) => {
        const ordersCount = p.data.ordersCount ?? p.data.ordersCreated ?? 0;
        const barHeight = Math.min(chartHeight * 0.4, ordersCount * 4);
        return (
          <rect
            key={`bar-${p.idx}`}
            x={p.x - 4}
            y={padTop + chartHeight - barHeight}
            width={8}
            height={barHeight}
            rx={2}
            className="fill-muted-foreground/15"
          />
        );
      })}

      {/* Area & Line */}
      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Crosshair */}
      {activePoint && (
        <line
          x1={activePoint.x}
          y1={padTop}
          x2={activePoint.x}
          y2={padTop + chartHeight}
          stroke="var(--color-primary)"
          strokeWidth="1"
          strokeDasharray="3 3"
          className="opacity-70"
        />
      )}

      {/* Interactive points */}
      {points.map((p) => {
        const isHovered = hoveredIdx === p.idx;
        return (
          <g key={`pt-${p.idx}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isHovered ? 5 : 3}
              className={
                isHovered
                  ? "fill-primary stroke-card stroke-2"
                  : "fill-card stroke-primary stroke-[1.5]"
              }
            />
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

      {/* Date labels */}
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

export function RevenueChart({
  timeseries = [],
  isLoading = false,
  locale = "fr-FR",
  period = "30d",
  className,
}: RevenueChartProps): React.ReactElement {
  const t = useTranslations("analytics");
  const gradientId = useId();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (isLoading) {
    return <RevenueChartSkeleton className={className} />;
  }

  const hasData = timeseries && timeseries.length > 0;
  const totalRevenueInMillimes = hasData
    ? timeseries.reduce((acc, curr) => acc + (curr.gmv || 0), 0)
    : 0;
  const totalRevenueFormatted = formatGmvMoney(totalRevenueInMillimes, locale);

  const avgDailyRevenueInMillimes =
    hasData && timeseries.length > 0 ? Math.round(totalRevenueInMillimes / timeseries.length) : 0;
  const avgDailyRevenueFormatted = formatGmvMoney(avgDailyRevenueInMillimes, locale);

  const svgWidth = 640;
  const svgHeight = 240;
  const padLeft = 65;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const chartWidth = svgWidth - padLeft - padRight;
  const chartHeight = svgHeight - padTop - padBottom;

  const maxRawGmv = hasData ? Math.max(...timeseries.map((d) => d.gmv || 0), 0) : 0;
  const maxDinars = maxRawGmv / 1000;
  const yCeilDinars = maxDinars > 0 ? Math.ceil(maxDinars * 1.15) : 100;
  const yCeilMillimes = yCeilDinars * 1000;

  const points = computeRevenuePoints(
    timeseries,
    chartWidth,
    chartHeight,
    padLeft,
    padTop,
    yCeilMillimes,
  );
  const { linePath, areaPath } = computeRevenuePaths(points, chartHeight, padTop);

  const yTicks = [0, 0.33, 0.66, 1].map((ratio) => {
    const valueMillimes = Math.round(yCeilMillimes * ratio);
    const yPos = padTop + chartHeight - ratio * chartHeight;
    const label = formatGmvMoney(valueMillimes, locale);
    return { yPos, label };
  });

  const step = getPeriodDateStep(period);
  const xLabels = points.filter((_, idx) => idx % step === 0 || idx === points.length - 1);
  const activePoint = hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : null;
  const periodLabel = t(
    period === "7d" ? "period7d" : period === "90d" ? "period90d" : "period30d",
  );

  return (
    <Card
      data-testid="revenue-chart"
      className={cn(
        "border-border/70 bg-card shadow-xs transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold text-foreground">
              {t("chartRevenueTitle")}
            </CardTitle>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <TrendingUp className="size-3" aria-hidden="true" />
              {periodLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t("chartRevenueSubtitle")}</p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-end">
            <span className="text-muted-foreground">{t("totalRevenuePeriod")}: </span>
            <span className="font-semibold text-foreground">{totalRevenueFormatted}</span>
          </div>
          <div className="text-end">
            <span className="text-muted-foreground">{t("avgDailyRevenue")}: </span>
            <span className="font-semibold text-foreground">{avgDailyRevenueFormatted}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {!hasData ? (
          <RevenueChartEmpty />
        ) : (
          <div className="relative w-full overflow-hidden">
            <RevenueSvgPlot
              points={points}
              linePath={linePath}
              areaPath={areaPath}
              yTicks={yTicks}
              xLabels={xLabels}
              activePoint={activePoint}
              hoveredIdx={hoveredIdx}
              gradientId={gradientId}
              locale={locale}
              svgWidth={svgWidth}
              svgHeight={svgHeight}
              padLeft={padLeft}
              padRight={padRight}
              padTop={padTop}
              padBottom={padBottom}
              chartHeight={chartHeight}
              onHover={setHoveredIdx}
            />
            {activePoint && (
              <RevenueTooltip activePoint={activePoint} locale={locale} svgWidth={svgWidth} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
