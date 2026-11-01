import React from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Container } from "@/components/ui/container";
import { Stack } from "@/components/ui/stack";

export function AuthCardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col justify-between overflow-y-auto bg-background p-4 sm:p-8">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

      {/* Top Header: Brand mark + LanguageSwitcher */}
      <Container className="px-0">
        <Stack direction="row" justify="between" className="w-full" asChild>
          <header>
            <Stack direction="row" size="sm">
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-xs">
                AI
              </div>
              <span className="text-sm font-semibold tracking-tight text-foreground">
                AI Sales Agent
              </span>
            </Stack>
            <LanguageSwitcher />
          </header>
        </Stack>
      </Container>

      {/* Main Container: Centered auth card */}
      <main className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
