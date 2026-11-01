"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { CommandPalette } from "./command-palette";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps): React.ReactElement {
  const tCommon = useTranslations("common");
  const tNav = useTranslations("nav");
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isCommandOpen, setIsCommandOpen] = useState<boolean>(false);

  // Automatic responsive sidebar collapse: icon-only on lg (1024-1279), expanded on xl (>=1280)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQueryXl = window.matchMedia("(min-width: 1280px)");
    const handleMediaChange = () => {
      setIsCollapsed(!mediaQueryXl.matches);
    };

    handleMediaChange();
    mediaQueryXl.addEventListener("change", handleMediaChange);

    return () => {
      mediaQueryXl.removeEventListener("change", handleMediaChange);
    };
  }, []);

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      data-slot="app-shell"
      className={cn(
        "flex h-screen w-full flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {/* Top Application Header (Fixed 56px / h-14, dark navy background, z-20) */}
      <Header
        onToggleMobileMenu={() => setIsMobileOpen((prev) => !prev)}
        onOpenCommandPalette={() => setIsCommandOpen(true)}
      />
      <CommandPalette open={isCommandOpen} onOpenChange={setIsCommandOpen} />

      <div className="relative flex flex-1 overflow-hidden">
        {/* Desktop Sidebar: 64px on lg (1024-1279), 240px on xl (>=1280) or manually toggled */}
        <div className="hidden h-full shrink-0 lg:flex">
          <Sidebar
            collapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
          />
        </div>

        {/* Mobile Drawer: Overlay Sheet at z-[15] below 56px header (header stays visible) */}
        <DialogPrimitive.Root open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Backdrop
              className="fixed inset-0 top-14 z-15 h-[calc(100vh-3.5rem)] bg-background/80 backdrop-blur-xs lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <DialogPrimitive.Popup
              className="fixed inset-s-0 top-14 z-15 flex h-[calc(100vh-3.5rem)] w-64 max-w-[80vw] flex-col border-e border-border bg-background shadow-2xl transition-transform duration-200 slide-in-from-left focus:outline-none lg:hidden rtl:slide-in-from-right"
              data-slot="mobile-drawer"
            >
              <div className="flex items-center justify-between border-b border-border p-3">
                <DialogPrimitive.Title className="text-xs font-semibold text-foreground">
                  {tCommon("navigation")}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close
                  render={
                    <button
                      type="button"
                      aria-label={tNav("closeMenu")}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    />
                  }
                >
                  <X className="size-4" />
                </DialogPrimitive.Close>
              </div>

              <div className="flex-1 overflow-y-auto">
                <Sidebar
                  collapsed={false}
                  onItemClick={() => setIsMobileOpen(false)}
                  className="border-e-0"
                />
              </div>
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {/* Main Workspace Canvas */}
        <main
          data-slot="main-canvas"
          className="min-w-0 flex-1 overflow-y-auto bg-background text-foreground"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
