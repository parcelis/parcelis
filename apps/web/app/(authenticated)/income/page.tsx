import { Suspense } from "react";
import { IncomeInvoices } from "@/components/income/income-invoices";

type IncomePageProps = {
  searchParams: Promise<{ unitId?: string }>;
};

export default async function IncomePage({ searchParams }: IncomePageProps) {
  const { unitId } = await searchParams;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Existing income summary cards stay here. */}
      <Suspense fallback={null}>
        <IncomeInvoices initialUnitId={unitId} />
      </Suspense>
    </div>
  );
}
