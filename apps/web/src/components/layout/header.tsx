"use client";

import { LogOut, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Stack } from "@/components/ui/stack";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

import { LanguageSwitcher } from "./language-switcher";
import { NotificationPopover } from "./notification-popover";
import { formatRoleLabel, useTenant } from "./tenant-context";
import { TenantSwitcher } from "./tenant-switcher";
import { UsageWidget } from "./usage-widget";

export interface HeaderProps {
  onToggleMobileMenu?: () => void;
  onOpenCommandPalette?: () => void;
  className?: string;
}

export function Header({
  onToggleMobileMenu,
  onOpenCommandPalette,
  className,
}: HeaderProps): React.ReactElement {
  const { user, logout } = useAuth();
  const { currentRole } = useTenant();
  const tCommon = useTranslations("common");
  const tNav = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const tChannels = useTranslations("channels");
  const tRoles = useTranslations("roles");

  const userInitials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <header
      data-slot="header"
      className={cn(
        "sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-border bg-background/90 px-3 text-foreground backdrop-blur-md select-none sm:px-4",
        className,
      )}
    >
      {/* Left section: Hamburger (mobile) + Brand + Tenant Switcher */}
      <Stack size="md" wrap={false} className="min-w-0">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label={tNav("openMenu")}
          data-slot="mobile-menu-trigger"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        {/* Brand Mark */}
        <Stack size="sm" wrap={false} className="shrink-0">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground shadow-xs">
            AI
          </span>
          <span className="hidden text-xs font-semibold tracking-tight text-foreground sm:inline-block md:text-sm">
            AI Sales Agent
          </span>
        </Stack>

        <div className="hidden h-4 w-px shrink-0 bg-border sm:block" />

        {/* Tenant Switcher */}
        <TenantSwitcher />
      </Stack>

      {/* Center/Right section: Search (Cmd+K) + SocketStatus + Usage + Language + Notifications + User Menu */}
      <Stack size="sm" wrap={false} className="items-center">
        {/* Command Palette Trigger (Cmd+K) */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label={`${tCommon("search")} (Cmd+K)`}
          className="hidden h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground md:flex"
        >
          <Search className="size-3.5" />
          <span className="text-[11px]">{tCommon("search")}</span>
          <kbd className="ms-1 rounded-sm border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        {/* SocketStatus Indicator */}
        <Stack
          data-slot="socket-status"
          size="xs"
          wrap={false}
          className="hidden px-1.5 text-xs text-muted-foreground sm:flex"
          title={tChannels("connected")}
        >
          <span className="size-2 rounded-full bg-success ring-2 ring-success/20" />
          <span className="hidden text-[11px] font-medium text-muted-foreground lg:inline">
            {tChannels("connected")}
          </span>
        </Stack>

        {/* Quota Progress / Usage Widget (Owner-only) */}
        <UsageWidget />

        {/* Language Switcher */}
        <LanguageSwitcher className="h-9 gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground" />

        {/* Notification Bell Popover */}
        <NotificationPopover />

        <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2 rounded-md px-2 text-xs text-foreground hover:bg-muted"
                aria-label={tAuth("userMenu")}
              />
            }
          >
            <div className="flex size-6 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-bold text-foreground uppercase">
              {userInitials}
            </div>
            <span className="hidden max-w-25 truncate text-xs font-medium text-foreground md:inline-block">
              {user?.name || tAuth("userFallback")}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 border border-border bg-popover text-popover-foreground shadow-xl"
          >
            <DropdownMenuLabel className="p-3 font-normal">
              <Stack direction="column" size="xs" wrap={false} className="w-full">
                <p className="truncate text-xs leading-none font-semibold text-foreground">
                  {user?.name || tAuth("userFallback")}
                </p>
                <p className="truncate text-[11px] leading-none text-muted-foreground">
                  {user?.email}
                </p>
                <p className="pt-1 text-[10px] font-medium text-primary capitalize">
                  {currentRole && tRoles.has(currentRole)
                    ? tRoles(currentRole)
                    : formatRoleLabel(currentRole)}
                </p>
              </Stack>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={() => logout()}
              className="flex cursor-pointer items-center gap-2 text-xs text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="size-3.5" />
              <span>{tAuth("logout")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Stack>
    </header>
  );
}
