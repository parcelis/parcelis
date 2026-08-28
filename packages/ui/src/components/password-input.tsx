"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "./input";

export interface PasswordInputProps extends Omit<InputProps, "type"> {}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(({ className, ...props }, ref) => {
  const [isVisible, setIsVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input className={`pr-10 ${className ?? ""}`} ref={ref} type={isVisible ? "text" : "password"} {...props} />
      <button
        aria-label={isVisible ? "Hide password" : "Show password"}
        className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-parcelis-gray transition hover:text-parcelis-charcoal focus:outline-none focus:ring-2 focus:ring-parcelis-green"
        onClick={() => setIsVisible((visible) => !visible)}
        type="button"
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";
