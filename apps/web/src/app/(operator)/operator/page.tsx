"use client";

import { Building2, Flame, Hand, MessageSquare, Radio, ShoppingBag, Sparkles } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface PlatformOverview {
  generatedAt: string;
  totals: {
    businesses: number;
    conversations: number;
    messagesToday: number;
    aiTurns30d: number;
    aiCostUsd30d: number;
  };
  pulse: {
    activeNow: number;
    humanRequired: number;
    hotLeads: number;
    ordersPending: number;
  };
  series: { date: string; messages: number; aiTurns: number }[];
  feed: {
    id: string;
    businessId: string;
    businessName: string;
    customerName: string | null;
    source: string;
    status: string;
    preview: string | null;
    lastMessageAt: string | null;
    leadTemperature: string;
  }[];
  businesses: {
    id: string;
    name: string;
    country: string;
    planName: string | null;
    ownerEmail: string | null;
    memberCount: number;
    conversationCount: number;
    messageCountToday: number;
    lastActivityAt: string | null;
    channels: string[];
  }[];
}

const POLL_MS = 8000;

function ageLabel(
  value: string | null,
  now: number,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "—";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return t("agoNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("agoMin", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t("agoHour", { count: hours });
  return t("agoDay", { count: Math.floor(hours / 24) });
}

export default function OperatorHomePage(): React.ReactElement {
  const t = useTranslations("operator");
  const router = useRouter();
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasData = React.useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const overview = await apiClient.get<PlatformOverview>("/api/v1/platform/overview");
        if (!cancelled) {
          hasData.current = true;
          setData(overview);
          setError(null);
          setNow(Date.now());
        }
      } catch (err: unknown) {
        if (!cancelled && !hasData.current) {
          setError(err instanceof Error ? err.message : t("loadError"));
        }
      }
    }

    void load();
    const poll = window.setInterval(() => void load(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [t]);

  const updatedSeconds = data
    ? Math.max(0, Math.floor((now - Date.parse(data.generatedAt)) / 1000))
    : null;

  return (
    <div className="space-y-6" data-testid="operator-home">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          {t("live")}
          {updatedSeconds !== null ? (
            <span className="text-success/80">{t("updated", { count: updatedSeconds })}</span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          icon={Radio}
          label={t("activeNow")}
          value={data ? String(data.pulse.activeNow) : "…"}
          hint={t("activeHint")}
          tone="success"
          pulse={Boolean(data && data.pulse.activeNow > 0)}
        />
        <Kpi
          icon={Hand}
          label={t("needsHuman")}
          value={data ? String(data.pulse.humanRequired) : "…"}
          hint={t("needsHumanHint")}
          tone={data && data.pulse.humanRequired > 0 ? "warning" : "neutral"}
        />
        <Kpi
          icon={Flame}
          label={t("hotLeads")}
          value={data ? String(data.pulse.hotLeads) : "…"}
          hint={t("hotHint")}
          tone={data && data.pulse.hotLeads > 0 ? "hot" : "neutral"}
        />
        <Kpi
          icon={ShoppingBag}
          label={t("pendingOrders")}
          value={data ? String(data.pulse.ordersPending) : "…"}
          hint={t("ordersHint")}
          tone="neutral"
        />
        <Kpi
          icon={MessageSquare}
          label={t("statMessages")}
          value={data ? String(data.totals.messagesToday) : "…"}
          hint={t("messagesHint", { count: data?.totals.conversations ?? 0 })}
          tone="neutral"
        />
        <Kpi
          icon={Sparkles}
          label={t("statAi")}
          value={data ? String(data.totals.aiTurns30d) : "…"}
          hint={data ? t("costHint", { cost: data.totals.aiCostUsd30d.toFixed(3) }) : "…"}
          tone="neutral"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <section className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t("activityTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("activityHint")}</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-primary" />
                {t("activityMessages")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-warning" />
                {t("activityAi")}
              </span>
            </div>
          </div>
          <ActivityChart series={data?.series ?? []} label={t("activityTitle")} />
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <h2 className="mb-3 text-sm font-semibold">{t("feedTitle")}</h2>
          <ul className="space-y-2">
            {(data?.feed ?? []).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/operator/businesses/${item.businessId}` as Route)}
                  className="w-full rounded-lg border border-transparent px-2 py-2 text-start hover:border-border hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium">
                      {item.customerName ?? t("visitor")}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {item.businessName}
                      </span>
                    </p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {ageLabel(item.lastMessageAt, now, t)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {item.preview ?? "—"}
                  </p>
                  <p className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">
                    {item.source}
                    {item.leadTemperature === "hot" ? ` · ${t("hotLeads")}` : ""}
                    {item.status === "HUMAN_REQUIRED" ? ` · ${t("needsHuman")}` : ""}
                  </p>
                </button>
              </li>
            ))}
            {data && data.feed.length === 0 ? (
              <li className="text-sm text-muted-foreground">{t("quiet")}</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("colBusiness")}</h2>
          <p className="text-xs text-muted-foreground">
            <Building2 className="me-1 inline size-3.5" />
            {data ? data.totals.businesses : "…"}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(data?.businesses ?? []).map((business) => {
            const fresh =
              business.lastActivityAt !== null &&
              now - Date.parse(business.lastActivityAt) < 15 * 60 * 1000;
            return (
              <button
                key={business.id}
                type="button"
                onClick={() => router.push(`/operator/businesses/${business.id}` as Route)}
                className="rounded-lg border border-border bg-card p-4 text-start shadow-xs transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          fresh ? "bg-success" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="truncate">{business.name}</span>
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {business.country}
                      {business.ownerEmail ? ` · ${business.ownerEmail}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {business.planName ?? t("noPlan")}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <MiniStat
                    label={t("colConversations")}
                    value={String(business.conversationCount)}
                  />
                  <MiniStat label={t("colToday")} value={String(business.messageCountToday)} />
                  <MiniStat label={t("members")} value={String(business.memberCount)} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {business.channels.length > 0 ? business.channels.join(" · ") : t("noChannels")}
                  </span>
                  <span className="shrink-0">{ageLabel(business.lastActivityAt, now, t)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  pulse,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "success" | "warning" | "hot" | "neutral";
  pulse?: boolean;
}): React.ReactElement {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : tone === "hot"
          ? "bg-destructive/10 text-destructive"
          : "bg-primary/10 text-primary";
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 flex items-center gap-2 text-3xl font-semibold tracking-tight">
        {value}
        {pulse ? <span className="size-2 animate-pulse rounded-full bg-success" /> : null}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-2">
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ActivityChart({
  series,
  label,
}: {
  series: { date: string; messages: number; aiTurns: number }[];
  label: string;
}): React.ReactElement {
  const width = 560;
  const height = 160;
  const pad = 12;
  const max = Math.max(1, ...series.map((point) => Math.max(point.messages, point.aiTurns)));
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  const yFor = (value: number) => pad + (height - pad * 2) * (1 - value / max);
  const line = (key: "messages" | "aiTurns") =>
    series
      .map((point, index) => `${index === 0 ? "M" : "L"} ${pad + index * step} ${yFor(point[key])}`)
      .join(" ");
  const area =
    series.length > 0
      ? `${line("messages")} L ${pad + (series.length - 1) * step} ${height - pad} L ${pad} ${height - pad} Z`
      : "";

  const labelIndexes =
    series.length > 2
      ? [0, Math.floor((series.length - 1) / 2), series.length - 1]
      : series.map((_, index) => index);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" aria-label={label}>
        <path d={area} className="fill-primary/15" />
        <path d={line("messages")} className="fill-none stroke-primary" strokeWidth="2.5" />
        <path d={line("aiTurns")} className="fill-none stroke-warning" strokeWidth="2" />
        {series.map((point, index) =>
          point.messages > 0 ? (
            <circle
              key={point.date}
              cx={pad + index * step}
              cy={yFor(point.messages)}
              r="3.5"
              className="fill-primary"
            />
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {labelIndexes.map((index) => (
          <span key={series[index]?.date ?? index}>{series[index]?.date.slice(5) ?? ""}</span>
        ))}
      </div>
    </div>
  );
}
