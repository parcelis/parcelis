"use client";

import { Search } from "lucide-react";
import { Button, Input } from "@parcelis/ui";

type SearchGroupToolbarProps = {
  groupBy: boolean;
  groupedLabel: string;
  onSearchChange: (value: string) => void;
  onToggleGroupBy: () => void;
  search: string;
  searchPlaceholder: string;
  ungroupedLabel: string;
};

export function SearchGroupToolbar({
  groupBy,
  groupedLabel,
  onSearchChange,
  onToggleGroupBy,
  search,
  searchPlaceholder,
  ungroupedLabel,
}: SearchGroupToolbarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray sm:min-w-72">
        <Search aria-hidden="true" className="h-4 w-4" />
        <Input
          aria-label={searchPlaceholder}
          className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          value={search}
        />
      </label>
      <Button onClick={onToggleGroupBy} type="button" variant="secondary">
        {groupBy ? groupedLabel : ungroupedLabel}
      </Button>
    </div>
  );
}
