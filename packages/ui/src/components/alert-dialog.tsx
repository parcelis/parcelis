"use client";

import * as React from "react";
import { cn } from "../lib/utils";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const AlertDialogContext = React.createContext<React.MutableRefObject<HTMLDivElement | null> | null>(null);

export function AlertDialog({
  children,
  onOpenChange,
  open,
}: {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const content = contentRef.current;
      if (!content) {
        return;
      }

      const focusableElements = Array.from(content.querySelectorAll<HTMLElement>(focusableSelector));
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        content.focus();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    const frame = window.requestAnimationFrame(() => {
      const content = contentRef.current;
      const firstElement = content?.querySelector<HTMLElement>(focusableSelector);
      (firstElement ?? content)?.focus();
    });

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocusedElement?.focus();
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return <AlertDialogContext.Provider value={contentRef}>{children}</AlertDialogContext.Provider>;
}

export const AlertDialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const contentRef = React.useContext(AlertDialogContext);

    function setRef(element: HTMLDivElement | null) {
      if (contentRef) {
        contentRef.current = element;
      }
      if (typeof ref === "function") {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    }

    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 px-4">
        <div
          aria-modal="true"
          className={cn(
            "w-full max-w-md rounded-lg border border-parcelis-border bg-white p-5 shadow-xl dark:bg-parcelis-slate",
            className,
          )}
          ref={setRef}
          role="alertdialog"
          tabIndex={-1}
          {...props}
        />
      </div>
    );
  },
);
AlertDialogContent.displayName = "AlertDialogContent";

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-2", className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-bold text-parcelis-charcoal", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-6 text-parcelis-gray", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
