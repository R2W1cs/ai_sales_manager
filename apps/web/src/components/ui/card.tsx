import type * as React from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }): React.ReactElement {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card relative flex flex-col gap-4 overflow-hidden rounded-lg border border-border bg-card py-4 text-card-foreground shadow-xs ring-1 ring-foreground/5 transition-colors has-data-[slot=card-footer]:pb-0",
        className,
      )}
      {...props}
    />
  );
}

export function CardBg({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="card-bg"
      className={cn(
        "pointer-events-none absolute -inset-x-px -top-px h-24 overflow-hidden rounded-lg",
        className,
      )}
      {...props}
    >
      <div className="-mt-12 size-full rounded-full bg-primary/10 blur-xl" />
    </div>
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header relative z-10 grid auto-rows-min items-start gap-1 px-6 group-data-[size=sm]/card:px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-none font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardAction({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="card-content"
      className={cn("relative z-10 px-6 group-data-[size=sm]/card:px-4", className)}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "relative z-10 flex items-center px-6 pt-0 group-data-[size=sm]/card:px-4",
        className,
      )}
      {...props}
    />
  );
}
