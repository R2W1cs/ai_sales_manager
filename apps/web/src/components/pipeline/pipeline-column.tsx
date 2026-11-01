"use client";

import { UserCheck, Sparkles, ClockAlert, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { cn } from "@/lib/utils";
import type { PipelineCardDto, PipelineColumnDto } from "@app/shared";

import { PipelineCard } from "./pipeline-card";
import { formatPipelineMoney, resolvePipelineCurrency } from "./pipeline-formatter";

export type PipelineColumnId = "new_leads" | "qualified" | "payment_pending" | "sold";

export interface PipelineColumnProps {
  columnId: PipelineColumnId;
  column: PipelineColumnDto;
  businessId?: string | null;
  currency?: string;
  locale?: string;
  onCardSelect?: (card: PipelineCardDto) => void;
  className?: string;
}

const COLUMN_CONFIG: Record<
  PipelineColumnId,
  {
    titleKey: "newLeads" | "qualified" | "paymentPending" | "sold";
    icon: React.ElementType;
    badgeStyle: string;
    borderAccent: string;
    isOrderType: boolean;
  }
> = {
  new_leads: {
    titleKey: "newLeads",
    icon: Sparkles,
    badgeStyle: "bg-primary/10 text-primary border-primary/20",
    borderAccent: "border-t-primary",
    isOrderType: false,
  },
  qualified: {
    titleKey: "qualified",
    icon: UserCheck,
    badgeStyle: "bg-warning/10 text-warning border-warning/20",
    borderAccent: "border-t-warning",
    isOrderType: false,
  },
  payment_pending: {
    titleKey: "paymentPending",
    icon: ClockAlert,
    badgeStyle: "bg-destructive/10 text-destructive border-destructive/20",
    borderAccent: "border-t-destructive",
    isOrderType: true,
  },
  sold: {
    titleKey: "sold",
    icon: CheckCircle2,
    badgeStyle: "bg-success/10 text-success border-success/20",
    borderAccent: "border-t-success",
    isOrderType: true,
  },
};

export function PipelineColumn({
  columnId,
  column,
  businessId,
  currency,
  locale,
  onCardSelect,
  className,
}: PipelineColumnProps): React.ReactElement {
  const t = useTranslations("pipeline");
  const config = COLUMN_CONFIG[columnId];
  const Icon = config.icon;

  const title = t(config.titleKey);
  const effectiveCurrency = resolvePipelineCurrency(currency, t("currencyUnit"));
  const formattedTotal = formatPipelineMoney(column.totalValue, effectiveCurrency, locale);
  const countLabel = config.isOrderType
    ? t("ordersCount", { count: column.count })
    : t("leadsCount", { count: column.count });

  return (
    <section
      data-testid={`pipeline-column-${columnId}`}
      aria-label={`${title} - ${countLabel} - ${formattedTotal}`}
      className={cn(
        "flex h-full flex-col rounded-lg border border-border/80 bg-muted/30 shadow-xs",
        "border-t-[3px]",
        config.borderAccent,
        className,
      )}
    >
      {/* Column Header */}
      <div className="flex flex-col gap-1 rounded-t-lg border-b border-border/60 bg-muted/40 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="truncate text-sm font-bold tracking-tight text-foreground">{title}</h2>
          </div>

          <span
            data-testid={`pipeline-count-${columnId}`}
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
              config.badgeStyle,
            )}
          >
            {column.count}
          </span>
        </div>

        {/* Totals Summary */}
        <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground/80">
          <span>{countLabel}</span>
          <span
            data-testid={`pipeline-total-${columnId}`}
            className="font-semibold text-foreground"
          >
            {formattedTotal}
          </span>
        </div>
      </div>

      {/* Cards Scrollable Deck */}
      <div className="max-h-[calc(100vh-250px)] min-h-35 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {column.cards && column.cards.length > 0 ? (
          column.cards.map((card) => {
            const cardKey = card.orderId
              ? `order-${card.orderId}`
              : card.conversationId
                ? `conv-${card.conversationId}`
                : `card-${card.customerName ?? "item"}-${card.value}-${String(card.lastActivityAt ?? "")}`;
            const cardCurrency =
              card.currency && card.currency !== "TND" ? card.currency : effectiveCurrency;
            return (
              <PipelineCard
                key={cardKey}
                card={card}
                columnId={columnId}
                businessId={businessId}
                currency={cardCurrency}
                locale={locale}
                onSelect={onCardSelect}
              />
            );
          })
        ) : (
          <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            <p>{t("emptyColumn")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
