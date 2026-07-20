import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <span className="relative block">
    <select
      className={cn(
        "h-10 w-full appearance-none rounded-md border border-parcelis-border bg-white px-3 pr-9 text-sm text-parcelis-charcoal outline-none transition focus:border-parcelis-green disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-parcelis-gray" />
  </span>
));

Select.displayName = "Select";
