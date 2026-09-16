import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "../lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  captionLayout = "dropdown",
  className,
  classNames,
  components,
  navLayout = "around",
  showOutsideDays = true,
  ...dayPickerProps
}: CalendarProps) {
  return (
    <DayPicker
      captionLayout={captionLayout}
      className={cn("w-80 max-w-[calc(100vw-2rem)] bg-white p-3 dark:bg-parcelis-charcoal", className)}
      navLayout={navLayout}
      classNames={{
        root: "w-full",
        months: "flex flex-col gap-4",
        month: "relative flex flex-col gap-4",
        month_caption: "flex h-8 items-center justify-center px-9",
        caption_label: "sr-only",
        dropdowns: "flex min-w-0 items-center gap-1",
        dropdown_root: "relative",
        dropdown:
          "h-8 max-w-full appearance-none rounded-md border border-parcelis-border bg-white py-1 pl-2 pr-6 text-xs font-medium text-parcelis-charcoal outline-none transition focus:border-parcelis-green dark:bg-parcelis-slate dark:text-parcelis-porcelain",
        months_dropdown: "w-24",
        years_dropdown: "w-18",
        nav: "flex items-center gap-1",
        button_previous:
          "absolute left-0 top-0 flex size-8 items-center justify-center rounded-md border border-parcelis-border text-parcelis-charcoal transition hover:bg-parcelis-porcelain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green dark:text-parcelis-porcelain dark:hover:bg-parcelis-slate",
        button_next:
          "absolute right-0 top-0 flex size-8 items-center justify-center rounded-md border border-parcelis-border text-parcelis-charcoal transition hover:bg-parcelis-porcelain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green dark:text-parcelis-porcelain dark:hover:bg-parcelis-slate",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "flex size-9 items-center justify-center text-xs font-medium text-parcelis-gray dark:text-parcelis-porcelain/70",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button:
          "flex size-9 items-center justify-center rounded-md font-medium text-parcelis-charcoal transition hover:bg-parcelis-porcelain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green dark:text-parcelis-porcelain dark:hover:bg-parcelis-slate",
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
        ...components,
      }}
      showOutsideDays={showOutsideDays}
      {...dayPickerProps}
    />
  );
}
