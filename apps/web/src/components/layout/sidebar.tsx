"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";

import { formatBadgeCount, getFilteredNavItems } from "./nav-items";
import { useTenant } from "./tenant-context";
import { PlanUsageCard } from "./usage-widget";

export interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onItemClick?: () => void;
  className?: string;
  unreadCount?: number;
}

export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  onItemClick,
  className,
  unreadCount = 0,
}: SidebarProps): React.ReactElement {
  const { currentRole } = useTenant();
  const t = useTranslations("nav");
  const pathname = usePathname() || "";
  const navItems = getFilteredNavItems(currentRole);

  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "flex h-full flex-col border-e border-border bg-background transition-all duration-200 select-none",
        collapsed ? "w-16" : "w-60",
        className,
      )}
    >
      {/* Navigation List */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const itemLabel = t.has(item.key) ? t(item.key) : item.label;

          return (
            <NextLink
              key={item.key}
              href={item.href as Route}
              onClick={onItemClick}
              title={collapsed ? itemLabel : undefined}
              data-slot={`nav-item-${item.key}`}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors",
                isActive
                  ? "bg-accent font-semibold text-foreground shadow-2xs"
                  : "font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {!collapsed && (
                <Stack direction="row" justify="between" className="flex-1 overflow-hidden">
                  <span className="truncate text-xs tracking-tight">{itemLabel}</span>
                  {item.hasBadge && unreadCount > 0 && (
                    <span
                      data-slot="inbox-badge"
                      className="ms-auto rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                    >
                      {formatBadgeCount(unreadCount)}
                    </span>
                  )}
                </Stack>
              )}
              {collapsed && item.hasBadge && unreadCount > 0 && (
                <span className="absolute inset-e-2 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </NextLink>
          );
        })}
      </nav>

      {/* Sidebar Footer: PlanUsageCard (Owner-only) & Collapse Toggle Button */}
      <div className="space-y-2 border-t border-border p-2">
        {!collapsed && currentRole === "owner" && <PlanUsageCard />}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
            data-slot="sidebar-collapse-trigger"
            className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <ChevronRight className="size-4 rtl:rotate-180" />
            ) : (
              <Stack direction="row" justify="between" className="w-full px-2 text-xs">
                <span className="text-muted-foreground">{t("collapseSidebar")}</span>
                <ChevronLeft className="size-4 rtl:rotate-180" />
              </Stack>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
