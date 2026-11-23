"use client";

import { Input, Label, Select } from "@parcelis/ui";
import { type OrganizationCurrencySettings } from "@parcelis/schemas";
import type { CurrencySettings } from "./organization-currency";

export function OrganizationCurrencyField({
  settings,
  value,
  onChange,
  isPending = false,
}: {
  settings: CurrencySettings;
  value: string;
  onChange?: (code: OrganizationCurrencySettings["currencyCode"]) => void;
  isPending?: boolean;
}) {
  const editable = settings.canChangeCurrency && !!onChange && settings.supportedCurrencies.length > 1;
  const selected = settings.supportedCurrencies.find(
    (currency) => currency.code === (editable ? value : settings.currencyCode),
  );
  const description =
    settings.restrictionReason === "monetary_data_saved"
      ? "Currency cannot be changed because monetary records already use it."
      : settings.restrictionReason === "insufficient_permissions"
        ? "Only organization owners and administrators can change currency before monetary data is saved."
        : settings.supportedCurrencies.length === 1
          ? "This is the only supported currency. Amounts are entered directly in this currency; no conversion is applied."
          : "Choose before saving monetary data. Currency locks permanently after the first monetary record. No conversion is applied.";

  return (
    <div>
      <Label htmlFor="organization-currency">Currency</Label>
      {editable ? (
        <Select
          aria-describedby="organization-currency-help"
          className="mt-1"
          disabled={isPending}
          id="organization-currency"
          value={value}
          onChange={(event) => {
            const option = settings.supportedCurrencies.find((currency) => currency.code === event.target.value);
            if (option) onChange?.(option.code);
          }}
        >
          {settings.supportedCurrencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          aria-describedby="organization-currency-help"
          className="mt-1"
          id="organization-currency"
          readOnly
          value={selected ? `${selected.code} — ${selected.name}` : settings.currencyCode}
        />
      )}
      <p className="mt-1 text-xs text-parcelis-gray" id="organization-currency-help">
        {description}
      </p>
    </div>
  );
}
