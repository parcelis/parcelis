"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@parcelis/ui";

export type IncomeUnitOption = {
  id: string;
  label: string;
  propertyName?: string;
};

type IncomeUnitFilterProps = {
  units: IncomeUnitOption[];
  unitId?: string;
  isLoading?: boolean;
};

export function IncomeUnitFilter({
  units,
  unitId,
  isLoading = false,
}: IncomeUnitFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setUnitId = useCallback(
    (nextUnitId?: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (nextUnitId) {
        params.set("unitId", nextUnitId);
      } else {
        params.delete("unitId");
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex items-center gap-2">
      <Select
        value={unitId ?? ""}
        onValueChange={setUnitId}
        disabled={isLoading || units.length === 0}
      >
        <SelectTrigger className="w-60" aria-label="Filter invoices by unit">
          <SelectValue placeholder="All units" />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {unit.propertyName
                ? `${unit.propertyName} — ${unit.label}`
                : unit.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {unitId ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setUnitId()}
          aria-label="Show all units"
        >
          <X className="size-4" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
