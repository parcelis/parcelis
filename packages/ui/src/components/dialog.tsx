"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

type DialogContextValue = {
  onOpenChange: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialog() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within Dialog");
  }

  return context;
}

export function Dialog({
  children,
  onOpenChange,
  open,
}: {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  React.useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { onOpenChange } = useDialog();

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/80"
        onClick={() => onOpenChange(false)}
        type="button"
      />
      <div
        aria-modal="true"
        className={cn(
          "relative z-10 max-h-full max-w-full rounded-lg bg-white p-4 shadow-xl dark:bg-parcelis-slate",
          className,
        )}
        role="dialog"
        {...props}
      >
        <button
          aria-label="Close dialog"
          className="absolute right-3 top-3 inline-grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
          onClick={() => onOpenChange(false)}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}
