"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";

type DrawerContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

function useDrawer() {
  const context = React.useContext(DrawerContext);
  if (!context) {
    throw new Error("Drawer components must be used within Drawer");
  }
  return context;
}

export function Drawer({
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

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  return <DrawerContext.Provider value={{ open, onOpenChange }}>{children}</DrawerContext.Provider>;
}

export function DrawerTrigger({
  asChild = false,
  children,
}: {
  asChild?: boolean;
  children: React.ReactElement;
}) {
  const { onOpenChange } = useDrawer();

  if (asChild) {
    return React.cloneElement(children, {
      onClick: (event: React.MouseEvent) => {
        children.props.onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(true);
        }
      },
    });
  }

  return (
    <Button type="button" onClick={() => onOpenChange(true)}>
      {children}
    </Button>
  );
}

export function DrawerContent({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { onOpenChange, open } = useDrawer();
  const [isPresent, setIsPresent] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setIsPresent(true);
      return;
    }

    const timeout = window.setTimeout(() => setIsPresent(false), 300);
    return () => window.clearTimeout(timeout);
  }, [open]);

  if (!isPresent) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close drawer"
        className={cn(
          "absolute inset-0 h-full w-full cursor-default bg-black/20",
          open ? "parcelis-drawer-overlay-opening" : "pointer-events-none parcelis-drawer-overlay-closing",
        )}
        onClick={() => onOpenChange(false)}
        type="button"
      />
      <div
        aria-modal="true"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 flex w-full max-w-6xl flex-col border-l border-parcelis-border bg-parcelis-porcelain shadow-xl dark:bg-parcelis-charcoal",
          open ? "parcelis-drawer-opening" : "pointer-events-none parcelis-drawer-closing",
          className,
        )}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-parcelis-border bg-white px-4 py-4 dark:bg-parcelis-slate md:px-6", className)} {...props} />;
}

export function DrawerTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-2xl font-bold text-parcelis-charcoal", className)} {...props} />;
}

export function DrawerClose({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onOpenChange } = useDrawer();

  return (
    <button
      aria-label="Close drawer"
      className={cn(
        "inline-grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal",
        className,
      )}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(false);
        }
      }}
      type="button"
      {...props}
    >
      <X className="h-5 w-5" />
    </button>
  );
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-parcelis-border bg-white px-4 py-4 dark:bg-parcelis-slate md:px-6", className)} {...props} />;
}
