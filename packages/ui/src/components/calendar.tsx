import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "../lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      className={cn("bg-white p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-4",
        month_caption: "relative flex h-9 items-center justify-center",
        caption_label: "text-sm font-semibold text-parcelis-charcoal",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous:
          "flex size-9 items-center justify-center rounded-md border border-parcelis-border text-parcelis-charcoal transition hover:bg-parcelis-porcelain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green",
        button_next:
          "flex size-9 items-center justify-center rounded-md border border-parcelis-border text-parcelis-charcoal transition hover:bg-parcelis-porcelain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "flex size-9 items-center justify-center text-xs font-medium text-parcelis-gray",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button:
          "flex size-9 items-center justify-center rounded-md font-medium text-parcelis-charcoal transition hover:bg-parcelis-porcelain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green",
        selected: "bg-parcelis-green text-parcelis-charcoal hover:bg-parcelis-green-hover",
        today: "font-bold text-parcelis-green",
        outside: "text-parcelis-gray/50",
        disabled: "cursor-not-allowed text-parcelis-gray/50 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", iconClassName)} {...iconProps} />
          ) : (
            <ChevronRight className={cn("size-4", iconClassName)} {...iconProps} />
          ),
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}
