"use client";

import { Flame, Snowflake, Sparkles, User, Package } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useContext, useSyncExternalStore } from "react";

import { TenantContext } from "@/components/layout/tenant-context";
import { cn } from "@/lib/utils";
import type { PipelineCardDto } from "@app/shared";

import type { PipelineColumnId } from "./pipeline-column";
import {
  formatPipelineMoney,
  formatPipelineTime,
  resolvePipelineCurrency,
} from "./pipeline-formatter";

const emptySubscribe = () => () => {};

export interface PipelineCardProps {
  card: PipelineCardDto;
  columnId?: PipelineColumnId;
  businessId?: string | null;
  currency?: string;
  locale?: string;
  onSelect?: (card: PipelineCardDto) => void;
  className?: string;
}

const TEMPERATURE_CONFIG: Record<
  "hot" | "warm" | "cold",
  {
    labelKey: "temperatureHot" | "temperatureWarm" | "temperatureCold";
    icon: React.ElementType;
    badgeClass: string;
    iconClass: string;
  }
> = {
  hot: {
    labelKey: "temperatureHot",
    icon: Flame,
    badgeClass: "border-destructive/20 bg-destructive/10 text-destructive",
    iconClass: "text-destructive",
  },
  warm: {
    labelKey: "temperatureWarm",
    icon: Sparkles,
    badgeClass: "border-warning/20 bg-warning/10 text-warning",
    iconClass: "text-warning",
  },
  cold: {
    labelKey: "temperatureCold",
    icon: Snowflake,
    badgeClass: "border-primary/20 bg-primary/10 text-primary",
    iconClass: "text-primary",
  },
};

function PipelineCardBadge({
  tempConfig,
  columnId,
  t,
}: {
  tempConfig: (typeof TEMPERATURE_CONFIG)[keyof typeof TEMPERATURE_CONFIG] | null;
  columnId?: PipelineColumnId;
  t: ReturnType<typeof useTranslations>;
}): React.ReactElement | null {
  if (tempConfig) {
    const TempIcon = tempConfig.icon;
    return (
      <span
        data-testid="pipeline-temperature-badge"
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          tempConfig.badgeClass,
        )}
      >
        <TempIcon className={cn("size-3", tempConfig.iconClass)} aria-hidden="true" />
        <span>{t(tempConfig.labelKey)}</span>
      </span>
    );
  }

  if (columnId === "payment_pending") {
    return (
      <span
        data-testid="pipeline-status-badge"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
      >
        {t("paymentPending")}
      </span>
    );
  }

  return null;
}

function PipelineCardTimestamp({
  lastActivityAt,
  isMounted,
  locale,
}: {
  lastActivityAt?: string | Date | null;
  isMounted: boolean;
  locale: string;
}): React.ReactElement | null {
  if (!lastActivityAt || !isMounted) return null;
  const timeStr = formatPipelineTime(lastActivityAt, locale);
  if (!timeStr) return null;

  return (
    <time
      dateTime={typeof lastActivityAt === "string" ? lastActivityAt : lastActivityAt.toISOString()}
      className="text-[11px] text-muted-foreground/70"
    >
      {timeStr}
    </time>
  );
}

export function PipelineCard({
  card,
  columnId,
  businessId: propBusinessId,
  currency,
  locale: propLocale,
  onSelect,
  className,
}: PipelineCardProps): React.ReactElement {
  const router = useRouter();
  const t = useTranslations("pipeline");
  const tenantContext = useContext(TenantContext);
  const effectiveBusinessId = propBusinessId ?? tenantContext?.currentBusinessId ?? null;
  const activeLocale = useLocale();
  const locale = propLocale || activeLocale;
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const handleClick = () => {
    if (onSelect) {
      onSelect(card);
      return;
    }
    if (card.conversationId) {
      const params = new URLSearchParams({
        conversationId: card.conversationId,
        id: card.conversationId,
      });
      if (effectiveBusinessId) {
        params.set("businessId", effectiveBusinessId);
      }
      router.push(`/inbox?${params.toString()}`);
      return;
    }
    if (card.orderId) {
      const params = new URLSearchParams({
        orderId: card.orderId,
      });
      if (effectiveBusinessId) {
        params.set("businessId", effectiveBusinessId);
      }
      router.push(`/inbox?${params.toString()}`);
    }
  };

  const customerDisplay = card.customerName?.trim() || t("unknownCustomer");
  const productDisplay = card.productSnapshot?.trim() || t("noProduct");
  const effectiveCurrency = resolvePipelineCurrency(currency, t("currencyUnit"));
  const formattedValue = formatPipelineMoney(card.value, effectiveCurrency, locale);
  const tempConfig = card.temperature ? TEMPERATURE_CONFIG[card.temperature] : null;

  return (
    <button
      type="button"
      draggable={false}
      onClick={handleClick}
      data-testid="pipeline-card"
      data-conversation-id={card.conversationId ?? undefined}
      data-order-id={card.orderId ?? undefined}
      aria-label={`${customerDisplay} - ${productDisplay} - ${formattedValue}`}
      className={cn(
        "group relative flex w-full flex-col gap-2.5 rounded-lg border border-border/80 bg-card p-3.5 text-start shadow-sm transition-all duration-150 select-none",
        "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "cursor-pointer active:translate-y-0 active:scale-[0.99]",
        className,
      )}
    >
      {/* Top row: Customer Name & Temperature / Status Badge */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="size-3.5" aria-hidden="true" />
          </div>
          <span
            dir="auto"
            className="truncate text-sm font-semibold text-foreground"
            title={customerDisplay}
          >
            {customerDisplay}
          </span>
        </div>

        <PipelineCardBadge tempConfig={tempConfig} columnId={columnId} t={t} />
      </div>

      {/* Middle row: Product snapshot */}
      <div className="flex w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Package className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span dir="auto" className="truncate" title={productDisplay}>
          {productDisplay}
        </span>
      </div>

      {/* Bottom row: Value & Value Type */}
      <div className="flex w-full items-center justify-between border-t border-border/60 pt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold tracking-tight text-foreground">{formattedValue}</span>
          {card.valueType && (
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase">
              ({card.valueType === "actual" ? t("actual") : t("estimated")})
            </span>
          )}
        </div>

        <PipelineCardTimestamp
          lastActivityAt={card.lastActivityAt}
          isMounted={isMounted}
          locale={locale}
        />
      </div>
    </button>
  );
}
