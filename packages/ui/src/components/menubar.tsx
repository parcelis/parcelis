"use client";

import * as React from "react";
import * as MenubarPrimitive from "@radix-ui/react-menubar";
import { cn } from "../lib/utils";

const Menubar = MenubarPrimitive.Root;
function MenubarMenu({ children }: React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu>{children}</MenubarPrimitive.Menu>;
}
const MenubarTrigger = MenubarPrimitive.Trigger;

const MenubarContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(({ align = "start", className, sideOffset = 8, ...props }, ref) => (
  <MenubarPrimitive.Portal>
    <MenubarPrimitive.Content
      align={align}
      className={cn(
        "z-50 min-w-52 rounded-md border border-parcelis-border bg-white p-1 text-parcelis-charcoal shadow-lg outline-none dark:bg-parcelis-slate",
        className,
      )}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </MenubarPrimitive.Portal>
));

MenubarContent.displayName = MenubarPrimitive.Content.displayName;

const MenubarItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Item
    className={cn(
      "flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium outline-none hover:bg-parcelis-porcelain focus:bg-parcelis-porcelain data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));

MenubarItem.displayName = MenubarPrimitive.Item.displayName;

const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Label className={cn("px-3 py-2", className)} ref={ref} {...props} />
));

MenubarLabel.displayName = MenubarPrimitive.Label.displayName;

const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-parcelis-border", className)} ref={ref} {...props} />
));

MenubarSeparator.displayName = MenubarPrimitive.Separator.displayName;

export { Menubar, MenubarContent, MenubarItem, MenubarLabel, MenubarMenu, MenubarSeparator, MenubarTrigger };
