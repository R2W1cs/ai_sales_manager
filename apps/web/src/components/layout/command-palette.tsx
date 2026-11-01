"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Compass } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

import { getFilteredNavItems } from "./nav-items";
import { useTenant } from "./tenant-context";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): React.ReactElement {
  const router = useRouter();
  const { currentRole } = useTenant();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const items = useMemo(() => {
    const nav = getFilteredNavItems(currentRole).map((item) => ({
      key: item.key,
      href: item.href,
      label: tNav.has(item.key) ? tNav(item.key) : item.label,
      icon: item.icon,
    }));
    nav.push({
      key: "onboarding",
      href: "/onboarding",
      label: tNav.has("onboarding") ? tNav("onboarding") : "Onboarding",
      icon: Compass,
    });
    const q = query.trim().toLowerCase();
    if (!q) return nav;
    return nav.filter(
      (item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q),
    );
  }, [currentRole, query, tNav]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href as Route);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-xs" />
        <DialogPrimitive.Popup
          data-slot="command-palette"
          className="fixed inset-s-1/2 top-[18%] z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-2xl outline-none rtl:translate-x-1/2"
        >
          <DialogPrimitive.Title className="sr-only">{tCommon("search")}</DialogPrimitive.Title>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tCommon("search")}
            data-slot="command-palette-input"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
          />
          <div className="mt-2 max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {tCommon("none")}
              </p>
            ) : (
              items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => go(item.href)}
                    data-slot={`command-item-${item.key}`}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted"
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span>{item.label}</span>
                    <span className="ms-auto font-mono text-[10px] text-muted-foreground">
                      {item.href}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
