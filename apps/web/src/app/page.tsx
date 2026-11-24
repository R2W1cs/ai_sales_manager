import type { Route } from "next";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.92_0.04_145)_0%,transparent_55%),linear-gradient(180deg,oklch(0.98_0.01_95)_0%,oklch(0.96_0.02_145)_100%)] dark:bg-[radial-gradient(ellipse_at_top,oklch(0.28_0.04_145)_0%,transparent_55%),linear-gradient(180deg,oklch(0.16_0.01_260)_0%,oklch(0.14_0.02_145)_100%)]"
      />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            AI
          </div>
          <span className="text-base font-semibold tracking-tight">AI Sales Manager</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href={"/login" as Route}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pt-10 pb-20 sm:pt-16">
        <section className="max-w-2xl space-y-5">
          <p className="text-sm font-medium text-muted-foreground">
            For Tunisian fashion & beauty shops
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Derja replies on Instagram & WhatsApp. Ready buyers land in your order inbox.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            Catalog-grounded AI answers price, size, and stock questions. When a customer wants to
            buy, your team confirms the pending COD order — no invented prices, no silent checkout.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={"/register" as Route} className={cn(buttonVariants({ size: "lg" }))}>
              Start free pilot
            </Link>
            <Link
              href={"/login" as Route}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Open workspace
            </Link>
          </div>
        </section>

        <section className="grid gap-6 border-t border-border/60 pt-10 sm:grid-cols-3">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Grounded answers</h2>
            <p className="text-sm text-muted-foreground">
              Replies use your catalog, stock, and shop rules — French, MSA, Derja, and Arabizi.
            </p>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Human closes the sale</h2>
            <p className="text-sm text-muted-foreground">
              Purchase intent becomes a pending order with a staff briefing. You confirm before COD.
            </p>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Sales command center</h2>
            <p className="text-sm text-muted-foreground">
              One inbox for Instagram, Messenger, WhatsApp, and your website widget.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 border-t border-border/60 px-6 py-6 text-xs text-muted-foreground">
        <span>INPDP-ready · Law 2004-63 · Merchant controller / Platform processor</span>
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
          Privacy
        </Link>
        <Link href={"/terms" as Route} className="underline-offset-4 hover:underline">
          Terms
        </Link>
      </footer>
    </div>
  );
}
