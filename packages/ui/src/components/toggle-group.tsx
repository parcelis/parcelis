"use client";

import * as React from "react";
import { cn } from "../lib/utils";

type ToggleGroupContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null);

export function ToggleGroup({
  className,
  value,
  onValueChange,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & ToggleGroupContextValue) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div
        className={cn(
          "inline-flex items-center rounded-md border border-parcelis-border bg-parcelis-porcelain p-1",
          className,
        )}
        role="radiogroup"
        {...props}
      />
    </ToggleGroupContext.Provider>
  );
}

type ToggleGroupItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> & { value: string };

export function ToggleGroupItem({ className, value, children, ...props }: ToggleGroupItemProps) {
  const context = React.useContext(ToggleGroupContext);
  if (!context) throw new Error("ToggleGroupItem must be used within ToggleGroup.");
  const isSelected = context.value === value;

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? [],
    );
    const currentIndex = items.indexOf(event.currentTarget);
    const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextItem = items[(currentIndex + offset + items.length) % items.length];
    nextItem?.focus();
    nextItem?.click();
  }

  return (
    <button
      {...props}
      aria-checked={isSelected}
      className={cn(
        "h-8 rounded px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green",
        isSelected ? "bg-white text-parcelis-charcoal shadow-sm" : "text-parcelis-gray hover:text-parcelis-charcoal",
        className,
      )}
      onClick={(event) => {
        context.onValueChange(value ?? "");
        props.onClick?.(event);
      }}
      onKeyDown={(event) => {
        handleKeyDown(event);
        props.onKeyDown?.(event);
      }}
      role="radio"
      tabIndex={isSelected ? 0 : -1}
      type="button"
    >
      {children}
    </button>
  );
}
