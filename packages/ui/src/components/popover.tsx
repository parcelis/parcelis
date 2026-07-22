"use client";

import * as React from "react";
import { cn } from "../lib/utils";

type PopoverContextValue = {
  anchorRef: React.RefObject<HTMLDivElement>;
  contentId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopover() {
  const context = React.useContext(PopoverContext);
  if (!context) {
    throw new Error("Popover components must be used within Popover");
  }
  return context;
}

export function Popover({
  children,
  onOpenChange,
  open,
}: {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const contentId = React.useId();
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onOpenChange, open]);

  return (
    <PopoverContext.Provider value={{ anchorRef: popoverRef, contentId, onOpenChange, open }}>
      <div className="relative" ref={popoverRef}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  asChild = false,
  children,
}: {
  asChild?: boolean;
  children: React.ReactElement;
}) {
  const { contentId, onOpenChange, open } = usePopover();

  if (asChild) {
    return React.cloneElement(children, {
      "aria-controls": contentId,
      "aria-expanded": open,
      onClick: (event: React.MouseEvent) => {
        children.props.onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(true);
        }
      },
      onFocus: (event: React.FocusEvent) => {
        children.props.onFocus?.(event);
        onOpenChange(true);
      },
    });
  }

  return (
    <button aria-controls={contentId} aria-expanded={open} onClick={() => onOpenChange(true)} type="button">
      {children}
    </button>
  );
}

export function PopoverContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { anchorRef, contentId, open } = usePopover();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [side, setSide] = React.useState<"bottom" | "top">("bottom");

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const anchorRect = anchorRef.current?.getBoundingClientRect();
    const contentRect = contentRef.current?.getBoundingClientRect();
    if (!anchorRect || !contentRect) {
      return;
    }

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    setSide(spaceBelow < contentRect.height + 16 && spaceAbove > spaceBelow ? "top" : "bottom");
  }, [anchorRef, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-0 z-30 w-full rounded-md border border-parcelis-border bg-white p-4 shadow-lg dark:bg-parcelis-slate",
        side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        className,
      )}
      id={contentId}
      ref={contentRef}
      role="dialog"
      {...props}
    />
  );
}
