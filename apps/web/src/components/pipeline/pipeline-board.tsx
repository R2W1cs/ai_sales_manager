"use client";

import { AlertCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React from "react";

import { useTenant } from "@/components/layout/tenant-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineCardDto } from "@app/shared";

import { PipelineColumn, type PipelineColumnId } from "./pipeline-column";
import { resolvePipelineCurrency } from "./pipeline-formatter";
import { PipelineMetricsBar } from "./pipeline-metrics-bar";
import { PipelineSkeletonGrid } from "./pipeline-skeleton-grid";
import { usePipelineBoardData } from "./use-pipeline-board-data";

export interface PipelineBoardProps {
  onCardSelect?: (card: PipelineCardDto) => void;
  className?: string;
}

const CANONICAL_COLUMNS: PipelineColumnId[] = ["new_leads", "qualified", "payment_pending", "sold"];

export function PipelineBoard({ onCardSelect, className }: PipelineBoardProps): React.ReactElement {
  const t = useTranslations("pipeline");
  const locale = useLocale();
  const { currentBusinessId } = useTenant();

  const { pipeline, isLoading, isRefreshing, error, isRealtimeActive, refreshData } =
    usePipelineBoardData(currentBusinessId);

  const totalDeals = CANONICAL_COLUMNS.reduce((acc, colId) => {
    return acc + (pipeline?.columns[colId]?.count ?? 0);
  }, 0);

  const totalPipelineValue = CANONICAL_COLUMNS.reduce((acc, colId) => {
    return acc + (pipeline?.columns[colId]?.totalValue ?? 0);
  }, 0);

  const currencyUnit = t("currencyUnit");
  const currency = resolvePipelineCurrency(pipeline?.currency, currencyUnit);

  return (
    <div data-testid="pipeline-board" className={cn("flex h-full flex-col space-y-4", className)}>
      <PipelineMetricsBar
        totalDeals={totalDeals}
        totalPipelineValue={totalPipelineValue}
        currency={currency}
        locale={locale}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isRealtimeActive={isRealtimeActive}
        onRefresh={() => void refreshData(true)}
      />

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshData(true)}
            className="ms-3 h-7 border-destructive/30 text-xs hover:bg-destructive/20"
          >
            {t("retry")}
          </Button>
        </div>
      )}

      {isLoading && !pipeline ? (
        <PipelineSkeletonGrid columns={CANONICAL_COLUMNS} />
      ) : (
        <div
          data-testid="pipeline-grid"
          className="grid flex-1 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {CANONICAL_COLUMNS.map((colId) => {
            const columnData = pipeline?.columns[colId] ?? {
              count: 0,
              totalValue: 0,
              cards: [],
            };
            return (
              <PipelineColumn
                key={colId}
                columnId={colId}
                column={columnData}
                businessId={currentBusinessId}
                currency={currency}
                locale={locale}
                onCardSelect={onCardSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
