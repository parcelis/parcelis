"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTimezoneSelect } from "react-timezone-select";
import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TimezoneSelect({ value, onChange, disabled = false }: TimezoneSelectProps) {
  const { options } = useTimezoneSelect({});
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) =>
    `${option.label} ${option.value} ${option.searchTerms ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-label="Timezone"
          className="w-full justify-between font-normal"
          disabled={disabled}
          role="combobox"
          type="button"
          variant="secondary"
        >
          <span className="truncate">{selected?.label ?? value}</span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-2">
        <Input
          aria-label="Search timezones"
          autoFocus
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search timezones…"
          value={search}
        />
        <div className="mt-2 max-h-64 overflow-y-auto" role="listbox">
          {filtered.length ? (
            filtered.map((option) => (
              <button
                aria-selected={option.value === value}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm text-parcelis-charcoal hover:bg-parcelis-porcelain focus:bg-parcelis-porcelain focus:outline-none dark:text-white"
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
                {option.value === value ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-sm text-parcelis-gray">No timezones found.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
