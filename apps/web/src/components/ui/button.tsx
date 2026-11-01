"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium whitespace-nowrap transition-all duration-100 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-[1.1em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-foreground text-background shadow-xs hover:opacity-90 focus-visible:ring-ring",
        default: "bg-foreground text-background shadow-xs hover:opacity-90 focus-visible:ring-ring",
        fancy:
          "bg-primary text-primary-foreground shadow-xs hover:opacity-90 focus-visible:ring-ring",
        secondary:
          "border border-border bg-background text-foreground shadow-xs hover:border-ring hover:bg-muted focus-visible:ring-ring",
        soft: "bg-muted text-foreground shadow-xs hover:bg-muted/80 focus-visible:ring-ring",
        outline:
          "border border-border bg-background text-foreground shadow-xs hover:bg-muted focus-visible:ring-ring",
        ghost: "text-foreground hover:bg-muted focus-visible:ring-ring",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive",
      },
      size: {
        xs: "h-7 gap-[0.66ch] px-2 py-1 text-xs",
        sm: "h-8 gap-[0.66ch] px-3 text-xs",
        default: "h-9 gap-[0.75ch] px-4 py-2 text-sm",
        md: "h-9 gap-[0.75ch] px-4 py-2 text-sm",
        lg: "h-11 gap-[1ch] px-5 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  children,
  loading = false,
  disabled,
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={Boolean(disabled || loading)}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="size-4 animate-spin" />}
      {children}
    </ButtonPrimitive>
  );
}

export { buttonVariants };
