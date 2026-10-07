"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
} from "@parcelis/ui";
import { formatDate, getLocalDateInput } from "../lib/date";
import { formatInvoiceChargeDescription } from "@parcelis/schemas";

type InvoiceLine = {
  chargeId: string;
  customItem: string;
  description: string;
  quantity: string;
  rate: string;
};

type IncomeProperty = {
  id: number;
  name: string;
  units: Array<{ id: number; name: string }>;
  leases: Array<{
    id: number;
    unitLabel: string;
    startsOn: Date | string | null;
    endsOn: Date | string | null;
    status: string;
    tenant: { id: number; firstName: string; lastName: string };
  }>;
};

type InvoiceDrawerProps = {
  error?: Error | null;
  isPending: boolean;
  charges: Array<{ id: number; name: string; description: string | null; isDefault: boolean }>;
  onCreate: (input: {
    propertyId: number;
    leaseId: number;
    tenantId: number;
    dueOn: Date;
    paidCents: number;
    items: Array<{ item: string; description?: string; quantity: number; rateCents: number }>;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  properties: IncomeProperty[];
};

function toCents(value: string) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.max(Math.round(amount * 100), 0) : 0;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function InvoiceDrawer({
  charges,
  error,
  isPending,
  onCreate,
  onOpenChange,
  open,
  properties,
}: InvoiceDrawerProps) {
  const [propertyId, setPropertyId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [leaseId, setLeaseId] = React.useState("");
  const [dueOn, setDueOn] = React.useState(getLocalDateInput());
  const lastValidDueOnRef = React.useRef(dueOn);
  const [paid, setPaid] = React.useState("0");
  const [lines, setLines] = React.useState<InvoiceLine[]>([]);

  const property = properties.find((item) => item.id === Number(propertyId));
  const unit = property?.units.find((item) => item.id === Number(unitId));
  const leases = property?.leases.filter((item) => item.unitLabel === unit?.name && item.status !== "draft") ?? [];
  const lease = leases.find((item) => item.id === Number(leaseId));
  const subtotalCents = lines.reduce((total, line) => total + Number(line.quantity || 0) * toCents(line.rate), 0);
  const paidCents = toCents(paid);
  const hasInvalidLine = lines.some((line) =>
    line.chargeId === "custom"
      ? !line.customItem.trim()
      : !charges.some((charge) => charge.id === Number(line.chargeId)),
  );

  React.useEffect(() => {
    if (!open) {
      setPropertyId("");
      setUnitId("");
      setLeaseId("");
      const today = getLocalDateInput();
      setDueOn(today);
      lastValidDueOnRef.current = today;
      setPaid("0");
      setLines([]);
    }
  }, [open]);

  function updateLine(index: number, update: Partial<InvoiceLine>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...update } : line)));
  }

  function addLine(charge?: InvoiceDrawerProps["charges"][number]) {
    setLines((current) => [
      ...current,
      {
        chargeId: charge ? String(charge.id) : "custom",
        customItem: "",
        description: formatInvoiceChargeDescription(charge?.description ?? null, dueOn) ?? "",
        quantity: "1",
        rate: "",
      },
    ]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!property || !lease || lines.length === 0 || hasInvalidLine) return;
    onCreate({
      propertyId: property.id,
      leaseId: lease.id,
      tenantId: lease.tenant.id,
      dueOn: new Date(`${dueOn}T00:00:00.000Z`),
      paidCents,
      items: lines.map((line) => ({
        item:
          line.chargeId === "custom"
            ? line.customItem.trim()
            : charges.find((charge) => charge.id === Number(line.chargeId))!.name,
        description: line.description.trim() || undefined,
        quantity: Number(line.quantity),
        rateCents: toCents(line.rate),
      })),
    });
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent size="lg">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={isPending} />
          <div>
            <DrawerTitle>New invoice</DrawerTitle>
            <p className="mt-1 text-sm text-parcelis-gray dark:text-white/65">
              Create a manual charge for an existing lease.
            </p>
          </div>
        </DrawerHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <section>
              <h3 className="font-semibold text-parcelis-charcoal dark:text-white">Property details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Label className="gap-2">
                  Property *
                  <Select
                    required
                    value={propertyId}
                    onChange={(event) => {
                      setPropertyId(event.target.value);
                      setUnitId("");
                      setLeaseId("");
                    }}
                  >
                    <option value="">Select property</option>
                    {properties.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="gap-2">
                  Unit *
                  <Select
                    disabled={!property}
                    required
                    value={unitId}
                    onChange={(event) => {
                      setUnitId(event.target.value);
                      setLeaseId("");
                    }}
                  >
                    <option value="">Select unit</option>
                    {property?.units.map((item) => (
                      <option key={item.id} value={item.id}>
                        Unit {item.name}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="gap-2">
                  Term / lease *
                  <Select
                    disabled={!unit}
                    required
                    value={leaseId}
                    onChange={(event) => setLeaseId(event.target.value)}
                  >
                    <option value="">Select lease</option>
                    {leases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.startsOn ? formatDate(item.startsOn) : "Not set"} –{" "}
                        {item.endsOn ? formatDate(item.endsOn) : "No end date"}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="gap-2">
                  Tenant *
                  <Select disabled required value={lease?.tenant.id ?? ""}>
                    <option value="">Select lease first</option>
                    {lease ? (
                      <option value={lease.tenant.id}>
                        {lease.tenant.firstName} {lease.tenant.lastName}
                      </option>
                    ) : null}
                  </Select>
                </Label>
                <Label className="gap-2 md:max-w-xs">
                  Due on *
                  <Input
                    required
                    type="date"
                    value={dueOn}
                    onChange={(event) => {
                      const nextDueOn = event.target.value;
                      if (nextDueOn && !Number.isNaN(new Date(nextDueOn).getTime())) {
                        setLines((current) =>
                          current.map((line) => {
                            const charge = charges.find((item) => item.id === Number(line.chargeId));
                            if (!charge || !charge.description) return line;
                            const previousDescription = formatInvoiceChargeDescription(
                              charge.description,
                              lastValidDueOnRef.current,
                            );
                            if (line.description !== previousDescription) return line;
                            return {
                              ...line,
                              description: formatInvoiceChargeDescription(charge.description, nextDueOn) ?? "",
                            };
                          }),
                        );
                        lastValidDueOnRef.current = nextDueOn;
                      }
                      setDueOn(nextDueOn);
                    }}
                  />
                </Label>
              </div>
            </section>

            <section className="mt-8 border-t border-parcelis-border pt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-parcelis-charcoal dark:text-white">Invoice item details</h3>
                  <p className="mt-1 text-sm text-parcelis-gray dark:text-white/65">
                    Add one or more charges to this invoice.
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={isPending || lines.length >= 50} size="sm" type="button" variant="secondary">
                      <Plus className="h-4 w-4" /> Add item <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    {charges.map((charge) => (
                      <DropdownMenuItem key={charge.id} onSelect={() => addLine(charge)}>
                        {charge.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={() => addLine()}>Custom item…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-4 overflow-x-auto rounded-md border border-parcelis-border">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[1.15fr_1.7fr_90px_110px_110px_40px] gap-3 border-b border-parcelis-border bg-parcelis-porcelain px-3 py-2 text-xs font-semibold uppercase text-parcelis-gray dark:bg-parcelis-slate">
                    <span>Item</span>
                    <span>Description</span>
                    <span>Quantity</span>
                    <span>Rate</span>
                    <span className="text-right">Amount</span>
                    <span />
                  </div>
                  {lines.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-parcelis-gray">
                      Choose a charge from Add item to begin.
                    </p>
                  ) : (
                    lines.map((line, index) => {
                      const amountCents = Number(line.quantity || 0) * toCents(line.rate);
                      return (
                        <div
                          className="grid grid-cols-[1.15fr_1.7fr_90px_110px_110px_40px] items-center gap-3 border-b border-parcelis-border px-3 py-3 last:border-0"
                          key={index}
                        >
                          {line.chargeId === "custom" ? (
                            <Input
                              aria-label={`Custom invoice item ${index + 1}`}
                              maxLength={200}
                              onChange={(event) => updateLine(index, { customItem: event.target.value })}
                              placeholder="Item name"
                              required
                              value={line.customItem}
                            />
                          ) : (
                            <span className="text-sm font-semibold text-parcelis-charcoal dark:text-white">
                              {charges.find((charge) => charge.id === Number(line.chargeId))?.name ??
                                "Charge unavailable"}
                            </span>
                          )}
                          <Input
                            value={line.description}
                            onChange={(event) => updateLine(index, { description: event.target.value })}
                          />
                          <Input
                            min="1"
                            required
                            type="number"
                            value={line.quantity}
                            onChange={(event) => updateLine(index, { quantity: event.target.value })}
                          />
                          <Input
                            min="0"
                            required
                            step="0.01"
                            type="number"
                            value={line.rate}
                            onChange={(event) => updateLine(index, { rate: event.target.value })}
                          />
                          <span className="text-right text-sm font-semibold text-parcelis-charcoal dark:text-white">
                            {formatCurrency(amountCents)}
                          </span>
                          <Button
                            aria-label="Remove invoice item"
                            className="h-10 w-10 px-0"
                            disabled={isPending}
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="ml-auto mt-5 grid w-full max-w-xs gap-2 text-sm sm:w-80">
                <div className="flex justify-between text-parcelis-gray dark:text-white/65">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotalCents)}</span>
                </div>
                <Label className="flex items-center justify-between gap-3 text-parcelis-gray dark:text-white/65">
                  Already paid
                  <Input
                    className="w-28 text-right"
                    min="0"
                    step="0.01"
                    type="number"
                    value={paid}
                    onChange={(event) => setPaid(event.target.value)}
                  />
                </Label>
                <div className="flex justify-between border-t border-parcelis-border pt-2 font-semibold text-parcelis-charcoal dark:text-white">
                  <span>Balance due</span>
                  <span>{formatCurrency(Math.max(subtotalCents - paidCents, 0))}</span>
                </div>
              </div>
            </section>
            {error ? <p className="mt-5 text-sm font-medium text-red-700">{error.message}</p> : null}
          </div>
          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button disabled={isPending} type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="min-w-40"
              disabled={isPending || !lease || lines.length === 0 || hasInvalidLine || subtotalCents <= 0 || paidCents > subtotalCents}
              type="submit"
            >
              Create invoice <ChevronRight className="h-4 w-4" />
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
