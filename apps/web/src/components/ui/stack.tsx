import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { cn } from "@/lib/utils";

const stackVariants = cva("flex", {
  variants: {
    size: {
      none: "gap-0",
      xs: "gap-1",
      sm: "gap-x-2 gap-y-1",
      md: "gap-x-3 gap-y-2",
      lg: "gap-x-4 gap-y-3",
      xl: "gap-x-6 gap-y-4",
    },
    direction: {
      row: "flex-row",
      column: "flex-col",
    },
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      baseline: "items-baseline",
      stretch: "items-stretch",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
    },
    wrap: {
      true: "flex-wrap",
      false: "flex-nowrap",
    },
  },
  defaultVariants: {
    size: "md",
    direction: "row",
    wrap: true,
  },
});

export interface StackProps
  extends React.ComponentProps<"div">, VariantProps<typeof stackVariants> {
  asChild?: boolean;
}

export function Stack({
  className,
  asChild = false,
  size,
  direction = "row",
  align,
  justify,
  wrap,
  children,
  ...props
}: StackProps): React.ReactElement {
  const resolvedAlign = align ?? (direction === "column" ? "start" : "center");
  const classes = cn(
    stackVariants({
      size,
      direction,
      align: resolvedAlign,
      justify,
      wrap,
      className,
    }),
  );

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      ...props,
      className: cn(classes, child.props.className),
    });
  }

  return (
    <div data-slot="stack" className={classes} {...props}>
      {children}
    </div>
  );
}

export { stackVariants };
