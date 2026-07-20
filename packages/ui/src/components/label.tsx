import * as React from "react";
import { cn } from "../lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("grid gap-1 text-sm font-medium text-parcelis-charcoal", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-xs font-semibold uppercase text-parcelis-gray", className)} {...props} />;
}
