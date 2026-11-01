import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { cn } from "@/lib/utils";

const wrapperVariants = cva("@container flex w-full flex-col", {
  variants: {
    alignment: {
      start: "me-auto",
      center: "mx-auto",
      end: "ms-auto",
    },
    size: {
      sm: "max-w-screen-sm",
      md: "max-w-screen-md",
      lg: "max-w-screen-lg",
      full: "max-w-full",
    },
    gap: {
      xs: "gap-y-fluid-xs",
      sm: "gap-y-fluid-sm",
      md: "gap-y-fluid-md",
      lg: "gap-y-fluid-lg",
      xl: "gap-y-fluid-xl",
    },
  },
  defaultVariants: {
    alignment: "start",
    gap: "md",
  },
});

export interface WrapperProps
  extends React.ComponentProps<"div">, VariantProps<typeof wrapperVariants> {
  asChild?: boolean;
}

export function Wrapper({
  className,
  asChild = false,
  alignment,
  size,
  gap,
  children,
  ...props
}: WrapperProps): React.ReactElement {
  const classes = cn(wrapperVariants({ alignment, size, gap, className }));

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      ...props,
      className: cn(classes, child.props.className),
    });
  }

  return (
    <div data-slot="wrapper" className={classes} {...props}>
      {children}
    </div>
  );
}

export { wrapperVariants };
