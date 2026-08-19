import * as React from "react";
import { cn } from "../lib/utils";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-parcelis-border bg-parcelis-porcelain px-1.5 font-mono text-xs font-medium text-parcelis-charcoal dark:bg-parcelis-charcoal/70 dark:text-white",
        className,
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center gap-1.5", className)} {...props} />;
}
