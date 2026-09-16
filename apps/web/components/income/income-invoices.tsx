"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/components/api-client";
import { IncomeUnitFilter } from "./income-unit-filter";
import { IncomeInvoiceTable } from "./income-invoice-table";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/i;

type IncomeInvoicesProps = {
  initialUnitId?: string;
};

export function IncomeInvoices({ initialUnitId }: IncomeInvoicesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawUnitId = searchParams.get("unitId") ?? initialUnitId ?? undefined;
  const unitId =
    rawUnitId && CUID_PATTERN.test(rawUnitId) ? rawUnitId : undefined;

  const unitsQuery = useQuery({
    queryKey: ["units", "list"],
    queryFn: () => api.listUnits.query({}),
  });

  const invoicesQuery = useQuery({
    queryKey: ["invoices", "list", { unitId }],
    queryFn: () => api.listInvoices.query({ unitId }),
  });

  const units = useMemo(
    () =>
      (unitsQuery.data ?? []).map((unit) => ({
        id: unit.id,
        label: unit.name ?? unit.unitNumber,
        propertyName: unit.property?.name,
      })),
    [unitsQuery.data],
  );

  const selectedUnit = units.find((unit) => unit.id === unitId);

  // A unit ID that does not belong to this organization is dropped from the
  // URL so the dashboard falls back to the full portfolio view.
  useEffect(() => {
    if (!unitId || unitsQuery.isLoading || selectedUnit) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("unitId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [
    pathname,
    router,
    searchParams,
    selectedUnit,
    unitId,
    unitsQuery.isLoading,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Invoices</h2>
        <IncomeUnitFilter
          units={units}
          unitId={selectedUnit?.id}
          isLoading={unitsQuery.isLoading}
        />
      </div>

      <IncomeInvoiceTable
        invoices={invoicesQuery.data ?? []}
        isLoading={invoicesQuery.isLoading}
        emptyTitle={
          selectedUnit
            ? `No invoices for ${selectedUnit.label}`
            : "No invoices yet"
        }
        emptyDescription={
          selectedUnit
            ? "Clear the unit filter to see the rest of the portfolio."
            : "Invoices appear here once a lease starts billing."
        }
      />
    </div>
  );
}
