"use client";

import { Search, Flame, AlertTriangle, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Stack } from "@/components/ui/stack";
import type { LeadTemperature } from "@/hooks/use-realtime-inbox";
import { cn } from "@/lib/utils";
import type { ConversationSummaryDto } from "@app/shared";

export interface ConversationListProps {
  conversations: ConversationSummaryDto[];
  selectedConversationId: string | null;
  onSelectConversation: (conversation: ConversationSummaryDto) => void;
  activeView: "needs_me" | "all";
  onChangeView: (view: "needs_me" | "all") => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  channelFilter?: string;
  onChannelFilterChange?: (channel?: string) => void;
  temperatureFilter?: LeadTemperature;
  onTemperatureFilterChange?: (temp?: LeadTemperature) => void;
  hasPendingOrderFilter?: boolean;
  onHasPendingOrderFilterChange?: (hasOrder?: boolean) => void;
  isLoading?: boolean;
  totalUnread?: number;
  className?: string;
}

function formatRelativeTime(
  dateString: string | Date | null | undefined,
  units?: { now?: string; m?: string; h?: string; j?: string },
): string {
  if (!dateString) return "";
  try {
    const d = typeof dateString === "string" ? new Date(dateString) : dateString;
    const time = d.getTime();
    if (Number.isNaN(time)) return "";

    const now = new Date();
    const diffSec = Math.floor((now.getTime() - time) / 1000);

    const nowText = units?.now || "maintenant";
    const mUnit = units?.m || "m";
    const hUnit = units?.h || "h";
    const jUnit = units?.j || "j";

    // Handle future timestamps / slight clock skew safely with localized fallback
    if (diffSec < 0) return nowText;

    if (diffSec < 60) return nowText;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}${mUnit}`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}${hUnit}`;
    const diffDays = Math.floor(diffHours / 24);
    if (Number.isNaN(diffDays)) return "";
    return `${diffDays}${jUnit}`;
  } catch {
    return "";
  }
}

function TemperatureBadge({
  temperature,
  score,
}: {
  temperature: LeadTemperature;
  score: number;
}): React.ReactElement {
  switch (temperature) {
    case "hot":
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
          <Flame className="size-3 fill-current" />
          <span>{score}</span>
        </span>
      );
    case "warm":
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
          <span className="size-1.5 rounded-full bg-warning" />
          <span>{score}</span>
        </span>
      );
    case "cold":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          <span>{score}</span>
        </span>
      );
  }
}

interface ConversationListTabsProps {
  activeView: "needs_me" | "all";
  onChangeView: (view: "needs_me" | "all") => void;
  needsMeCount: number;
  totalCount: number;
  showFilters: boolean;
  onToggleFilters: () => void;
}

function ConversationListTabs({
  activeView,
  onChangeView,
  needsMeCount,
  totalCount,
  showFilters,
  onToggleFilters,
}: ConversationListTabsProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");

  return (
    <Stack
      direction="row"
      justify="between"
      className="h-14 shrink-0 border-b border-border bg-muted/20 px-3"
    >
      <Stack direction="row" size="xs" className="rounded-lg bg-muted p-1 text-xs">
        <button
          type="button"
          data-active={activeView === "needs_me"}
          onClick={() => onChangeView("needs_me")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
            activeView === "needs_me"
              ? "bg-background font-semibold text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>{tInbox("needsMe")}</span>
          {needsMeCount > 0 && (
            <span className="py-0.2 rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
              {needsMeCount}
            </span>
          )}
        </button>

        <button
          type="button"
          data-active={activeView === "all"}
          onClick={() => onChangeView("all")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
            activeView === "all"
              ? "bg-background font-semibold text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>{tCommon("all")}</span>
          <span className="text-[10px] text-muted-foreground">({totalCount})</span>
        </button>
      </Stack>

      <Button
        type="button"
        variant={showFilters ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggleFilters}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title={tInbox("filters")}
      >
        <SlidersHorizontal className="size-4" />
      </Button>
    </Stack>
  );
}

interface ConversationSearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function ConversationSearchBar({
  searchQuery,
  onSearchChange,
}: ConversationSearchBarProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="relative flex items-center">
        <Search className="absolute inset-s-2.5 size-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={tInbox("searchPlaceholder")}
          className="h-8 ps-8 pe-7 text-xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={tCommon("clear")}
            className="absolute inset-e-2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface ConversationFilterBarProps {
  channelFilter?: string;
  onChannelFilterChange?: (channel?: string) => void;
  temperatureFilter?: LeadTemperature;
  onTemperatureFilterChange?: (temp?: LeadTemperature) => void;
  hasPendingOrderFilter?: boolean;
  onHasPendingOrderFilterChange?: (hasOrder?: boolean) => void;
}

function ConversationFilterBar({
  channelFilter,
  onChannelFilterChange,
  temperatureFilter,
  onTemperatureFilterChange,
  hasPendingOrderFilter,
  onHasPendingOrderFilterChange,
}: ConversationFilterBarProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");
  const hasActiveFilters = Boolean(channelFilter || temperatureFilter || hasPendingOrderFilter);

  return (
    <div className="space-y-2 border-b border-border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">{tInbox("filters")}</span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              onChannelFilterChange?.(undefined);
              onTemperatureFilterChange?.(undefined);
              onHasPendingOrderFilterChange?.(undefined);
            }}
            className="text-[11px] text-primary underline"
          >
            {tCommon("reset")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["instagram", "messenger", "whatsapp", "website"].map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => onChannelFilterChange?.(channelFilter === ch ? undefined : ch)}
            className={cn(
              "rounded-sm border px-2 py-0.5 text-[11px] capitalize transition-colors",
              channelFilter === ch
                ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {ch === "website" ? "Web" : ch}
          </button>
        ))}

        {(["hot", "warm", "cold"] as LeadTemperature[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTemperatureFilterChange?.(temperatureFilter === t ? undefined : t)}
            className={cn(
              "rounded-sm border px-2 py-0.5 text-[11px] capitalize transition-colors",
              temperatureFilter === t
                ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {t === "hot"
              ? `🔥 ${tInbox("hot")}`
              : t === "warm"
                ? `🟡 ${tInbox("warm")}`
                : `⚪ ${tInbox("cold")}`}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onHasPendingOrderFilterChange?.(hasPendingOrderFilter ? undefined : true)}
          className={cn(
            "flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] transition-colors",
            hasPendingOrderFilter
              ? "border-primary/40 bg-primary/10 font-semibold text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          <ShoppingBag className="size-3" />
          <span>{tInbox("filterPendingOrders")}</span>
        </button>
      </div>
    </div>
  );
}

interface ConversationListContentProps {
  isLoading: boolean;
  totalConversations: number;
  tier1Conversations: ConversationSummaryDto[];
  tier2Conversations: ConversationSummaryDto[];
  selectedConversationId: string | null;
  onSelectConversation: (conversation: ConversationSummaryDto) => void;
}

function ConversationListContent({
  isLoading,
  totalConversations,
  tier1Conversations,
  tier2Conversations,
  selectedConversationId,
  onSelectConversation,
}: ConversationListContentProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  if (isLoading && totalConversations === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
        <Spinner className="mb-2 size-5 animate-spin text-primary" />
        <span>{tInbox("loadingConversations")}</span>
      </div>
    );
  }

  if (totalConversations === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        {tInbox("noConversationsFound")}
      </div>
    );
  }

  return (
    <>
      {tier1Conversations.length > 0 && (
        <div className="bg-destructive/5">
          <div className="flex items-center gap-1.5 bg-destructive/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-destructive uppercase">
            <AlertTriangle className="size-3" />
            <span>{tInbox("actionRequiredCount", { count: tier1Conversations.length })}</span>
          </div>
          {tier1Conversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === selectedConversationId}
              onSelect={() => onSelectConversation(conv)}
            />
          ))}
        </div>
      )}

      {tier2Conversations.length > 0 && (
        <div>
          {tier1Conversations.length > 0 && (
            <div className="bg-muted/40 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {tInbox("activeAiManagementCount", { count: tier2Conversations.length })}
            </div>
          )}
          {tier2Conversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === selectedConversationId}
              onSelect={() => onSelectConversation(conv)}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  activeView,
  onChangeView,
  searchQuery,
  onSearchChange,
  channelFilter,
  onChannelFilterChange,
  temperatureFilter,
  onTemperatureFilterChange,
  hasPendingOrderFilter,
  onHasPendingOrderFilterChange,
  isLoading = false,
  totalUnread: _totalUnread = 0,
  className,
}: ConversationListProps): React.ReactElement {
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Group into Tier 1 (Action Requise / HUMAN_REQUIRED) and Tier 2 (Active AI / Other)
  const tier1Conversations = conversations.filter((c) => c.status === "HUMAN_REQUIRED");
  const tier2Conversations = conversations.filter((c) => c.status !== "HUMAN_REQUIRED");

  // Calculate needs_me count
  const needsMeCount = conversations.filter(
    (c) =>
      c.status === "HUMAN_REQUIRED" ||
      c.status === "HUMAN_HANDLING" ||
      c.leadTemperature === "hot" ||
      c.unread,
  ).length;

  return (
    <div
      data-slot="conversation-list"
      className={cn(
        "flex h-full w-full flex-col border-e border-border bg-card select-none",
        className,
      )}
    >
      <ConversationListTabs
        activeView={activeView}
        onChangeView={onChangeView}
        needsMeCount={needsMeCount}
        totalCount={conversations.length}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((prev) => !prev)}
      />

      <ConversationSearchBar searchQuery={searchQuery} onSearchChange={onSearchChange} />

      {showFilters && (
        <ConversationFilterBar
          channelFilter={channelFilter}
          onChannelFilterChange={onChannelFilterChange}
          temperatureFilter={temperatureFilter}
          onTemperatureFilterChange={onTemperatureFilterChange}
          hasPendingOrderFilter={hasPendingOrderFilter}
          onHasPendingOrderFilterChange={onHasPendingOrderFilterChange}
        />
      )}

      <div className="flex-1 divide-y divide-border/60 overflow-y-auto">
        <ConversationListContent
          isLoading={isLoading}
          totalConversations={conversations.length}
          tier1Conversations={tier1Conversations}
          tier2Conversations={tier2Conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={onSelectConversation}
        />
      </div>
    </div>
  );
}

interface ConversationCardProps {
  conversation: ConversationSummaryDto;
  isSelected: boolean;
  onSelect: () => void;
}

function ConversationCard({
  conversation,
  isSelected,
  onSelect,
}: ConversationCardProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");
  const isTier1 = conversation.status === "HUMAN_REQUIRED";
  const unread = conversation.unread;

  return (
    <button
      type="button"
      data-slot="conversation-card"
      onClick={onSelect}
      className={cn(
        "group relative flex min-h-18 w-full cursor-pointer flex-col gap-1.5 p-3 text-start transition-colors outline-none",
        isSelected
          ? "border-s-4 border-s-primary bg-accent/40 font-normal"
          : "border-s-4 border-s-transparent hover:bg-muted/60",
        unread && !isSelected && "bg-muted/40 font-medium",
      )}
    >
      {/* Top Row: Channel badge + Customer name + Relative time */}
      <div className="flex items-center justify-between gap-1.5 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
            {conversation.channel === "website" ? "Web" : conversation.channel.slice(0, 2)}
          </span>
          <span
            className={cn(
              "truncate font-semibold",
              unread ? "font-bold text-foreground" : "text-foreground",
            )}
            title={conversation.customer.name || tInbox("clientLabel")}
          >
            {conversation.customer.name || tInbox("unnamedCustomer")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {unread && (
            <span className="size-2 rounded-full bg-primary" title={tInbox("newMessage")} />
          )}
          <span>
            {formatRelativeTime(conversation.lastMessageAt || conversation.handoffAt, {
              now: tCommon("now"),
              m: tCommon("minuteShort"),
              h: tCommon("hourShort"),
              j: tCommon("dayShort"),
            })}
          </span>
        </div>
      </div>

      {/* Middle Row: Message snippet with dir=auto */}
      <p
        dir="auto"
        className={cn("line-clamp-1 text-xs text-muted-foreground", unread && "text-foreground")}
      >
        {conversation.lastMessagePreview || tInbox("noMessages")}
      </p>

      {/* Bottom Row: Temperature & Score + Pending Order Value + Urgency */}
      <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
        <div className="flex items-center gap-1.5">
          <TemperatureBadge
            temperature={conversation.leadTemperature}
            score={conversation.leadScore}
          />

          {conversation.pendingOrder && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success">
              <ShoppingBag className="size-3" />
              <span>{conversation.pendingOrder.total} DT</span>
            </span>
          )}
        </div>

        {/* Tier 1 Escalation Reason */}
        {isTier1 && conversation.escalationReason && (
          <span
            className="max-w-32.5 truncate rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive"
            title={conversation.escalationReason}
          >
            {conversation.escalationReason}
          </span>
        )}
      </div>
    </button>
  );
}
