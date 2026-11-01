import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { cn } from "@/lib/utils";

const containerVariants = cva("relative mx-auto w-full max-w-272 px-4 sm:px-6 lg:px-8");

export interface ContainerProps
  extends React.ComponentProps<"div">, VariantProps<typeof containerVariants> {
  asChild?: boolean;
}

export function Container({
  className,
  asChild = false,
  children,
  ...props
}: ContainerProps): React.ReactElement {
  const classes = cn(containerVariants({ className }));

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      ...props,
      className: cn(classes, child.props.className),
    });
  }

  return (
    <div data-slot="container" className={classes} {...props}>
      {children}
    </div>
  );
}

export { containerVariants };
