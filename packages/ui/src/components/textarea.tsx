import * as React from "react";
import { cn } from "../lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-md border border-parcelis-border bg-white px-3 py-2 text-sm text-parcelis-charcoal outline-none transition placeholder:text-parcelis-gray focus:border-parcelis-green focus:ring-2 focus:ring-parcelis-green/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-parcelis-slate",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
