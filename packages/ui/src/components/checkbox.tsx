import * as React from "react";
import { cn } from "../lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, type: _type, ...props }, ref) => (
  <input
    className={cn(
      "h-5 w-5 rounded border border-parcelis-border accent-parcelis-green disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    type="checkbox"
    {...props}
  />
));

Checkbox.displayName = "Checkbox";
