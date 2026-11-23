"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCurrencyMetadata, type OrganizationCurrencySettings } from "@parcelis/schemas";
import { Button } from "@parcelis/ui";
import { createApiClient, queryKeys } from "./api-client";
import { LoadingState } from "./loading-state";
import { createMoneyTools } from "../lib/money";

export type CurrencySettings = Omit<OrganizationCurrencySettings, "currencyLockedAt"> & {
  currencyLockedAt: string | Date | null;
};
const CurrencyContext = React.createContext<CurrencySettings | null>(null);

export function OrganizationCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = React.useState(false);
  const pathname = usePathname();
  const slug = pathname.match(/^\/o\/([^/]+)/)?.[1];
  const client = React.useMemo(() => createApiClient(slug), [slug]);
  const query = useQuery({
    queryKey: queryKeys.organizations.currency,
    retry: false,
    queryFn: ({ signal }) => client.organizations.currency.query(undefined, { signal }),
  });
  React.useEffect(() => {
    if (query.isFetchedAfterMount && query.isSuccess) setConfirmed(true);
  }, [query.isFetchedAfterMount, query.isSuccess]);
  const errorState = query.error ? (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4" role="alert">
      {query.data ? <p>Currency could not be refreshed. Retry before continuing.</p> : null}
      <p>{query.error.message}</p>
      <Button onClick={() => void query.refetch()} variant="secondary">
        Retry loading currency
      </Button>
    </div>
  ) : null;
  if (!query.data || !confirmed) {
    return errorState ?? <LoadingState className="min-h-screen" label="Loading organization currency…" />;
  }
  return (
    <CurrencyContext.Provider value={query.data}>
      {errorState}
      <div className={query.error ? "hidden" : "contents"} inert={Boolean(query.error)}>
        {children}
      </div>
    </CurrencyContext.Provider>
  );
}

export function useOrganizationCurrency() {
  const settings = React.useContext(CurrencyContext);
  if (!settings) throw new Error("Organization currency is unavailable.");
  return settings;
}

export function useMoney(currencyCode?: string | null) {
  const settings = useOrganizationCurrency();
  const code = currencyCode ?? settings.currencyCode;
  const currency = settings.supportedCurrencies.find((entry) => entry.code === code) ?? getCurrencyMetadata(code);
  const { code: currencyCodeValue, minorUnitDigits } = currency;
  return React.useMemo(
    () => createMoneyTools({ code: currencyCodeValue, minorUnitDigits }),
    [currencyCodeValue, minorUnitDigits],
  );
}
