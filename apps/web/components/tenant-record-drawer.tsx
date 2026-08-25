"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Mail, PenLine, Phone, UserRound } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "./api-client";
import { LoadingState } from "./loading-state";
import { TenantDrawer, initialTenantFormState, type TenantFormState } from "./tenant-drawer";
import { uploadTenantImage } from "./tenant-image-upload";
import { entityUpdatedMessage } from "./toast-messages";
import { getInvoiceLink, getTenantLink } from "../lib/entity-links";

type RelatedTenant = {
  id: number;
  firstName: string;
  lastName: string;
};

type TenantRecordDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number | null;
  relatedTenants: RelatedTenant[];
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function formatDate(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "Month-to-month";
}

export function TenantRecordDrawer({ onOpenChange, open, relatedTenants, tenantId }: TenantRecordDrawerProps) {
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [tenantForm, setTenantForm] = useState<TenantFormState>(initialTenantFormState);
  const [tenantImageFile, setTenantImageFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const tenantQuery = useQuery({
    queryKey: queryKeys.tenants.byId(tenantId ?? 0),
    queryFn: () => apiClient.tenants.byId.query({ id: tenantId! }),
    enabled: open && tenantId !== null,
  });
  const updateTenantMutation = useMutation({
    mutationFn: async ({ imageFile, input }: { imageFile: File | null; input: TenantFormState & { id: number } }) => {
      const updatedTenant = await apiClient.tenants.update.mutate(input);
      if (imageFile) await uploadTenantImage(input.id, imageFile);
      return updatedTenant;
    },
    onSuccess: async (_tenant, variables) => {
      setIsEditDrawerOpen(false);
      setTenantImageFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(variables.input.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
      ]);
      toast.success(entityUpdatedMessage("Tenant", `${variables.input.firstName} ${variables.input.lastName}`));
    },
  });
  const tenant = tenantQuery.data;
  const currentLease = tenant?.leases.find((lease) => lease.status === "active" || lease.status === "notice");
  const invoices = currentLease?.invoices ?? [];
  const latePayments =
    tenant?.leases.flatMap((lease) => lease.invoices).filter((invoice) => invoice.status === "overdue") ?? [];
  const totalAmountPaid =
    tenant?.leases
      .flatMap((lease) => lease.invoices)
      .reduce((sum, invoice) => sum + invoice.amountCents - invoice.balanceCents, 0) ?? 0;
  const roommates = relatedTenants.filter((relatedTenant) => relatedTenant.id !== tenantId);

  function openEditDrawer() {
    if (!tenant) return;

    const emergencyContact = tenant.emergencyContacts[0];
    setTenantForm({
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email,
      phone: tenant.phone ?? "",
      emergencyContactFirstName: emergencyContact?.firstName ?? "",
      emergencyContactLastName: emergencyContact?.lastName ?? "",
      emergencyContactPhone: emergencyContact?.phone ?? "",
      accountStatus: tenant.accountStatus,
      insuranceStatus: tenant.insuranceStatus,
    });
    setTenantImageFile(null);
    setIsEditDrawerOpen(true);
  }

  return (
    <>
      <Drawer onOpenChange={onOpenChange} open={open}>
        <DrawerContent size="lg">
          <DrawerHeader className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <DrawerClose />
              <DrawerTitle>Tenant Record</DrawerTitle>
            </div>
            {tenantId ? (
              <Button className="min-w-40" onClick={openEditDrawer} variant="primary">
                <PenLine className="h-4 w-4" />
                Edit Tenant
              </Button>
            ) : null}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            {tenantQuery.isLoading ? (
              <LoadingState className="min-h-64" label="Loading tenant record…" />
            ) : tenantQuery.error ? (
              <p className="text-sm font-medium text-red-700">{tenantQuery.error.message}</p>
            ) : !tenant ? (
              <p className="text-sm text-parcelis-gray">Tenant record not found.</p>
            ) : (
              <div className="space-y-7">
                <section className="flex flex-col gap-5 border-b border-parcelis-border pb-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    {tenant.imageUrl ? (
                      <Image
                        alt={`${tenant.firstName} ${tenant.lastName}`}
                        className="h-20 w-20 shrink-0 rounded-full object-cover"
                        height={80}
                        src={tenant.imageUrl}
                        unoptimized
                        width={80}
                      />
                    ) : (
                      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-parcelis-porcelain text-parcelis-green">
                        <UserRound className="h-8 w-8" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-parcelis-charcoal">
                        {tenant.firstName} {tenant.lastName}
                      </h3>
                      <div className="mt-2 space-y-1 text-sm font-medium text-parcelis-gray">
                        {tenant.phone ? (
                          <a className="flex items-center gap-2 hover:text-parcelis-green" href={`tel:${tenant.phone}`}>
                            <Phone className="h-4 w-4" />
                            {tenant.phone}
                          </a>
                        ) : null}
                        <a
                          className="flex items-center gap-2 truncate hover:text-parcelis-green"
                          href={`mailto:${tenant.email}`}
                        >
                          <Mail className="h-4 w-4 shrink-0" />
                          {tenant.email}
                        </a>
                      </div>
                    </div>
                  </div>
                  <Card className="w-full shrink-0 sm:w-52">
                    <CardContent className="py-3 sm:text-right">
                      <p className="text-sm font-medium text-parcelis-gray">Insurance Status</p>
                      <p className="mt-1 font-semibold capitalize text-parcelis-charcoal">
                        {tenant.insuranceStatus.replaceAll("_", " ")}
                      </p>
                    </CardContent>
                  </Card>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <RecordMetric label="Auto Pay" value="Not enrolled" />
                  <RecordMetric label="Late Payments" value={String(latePayments.length)} />
                  <RecordMetric label="Total Amount Paid" value={formatCurrency(totalAmountPaid)} />
                  <RecordMetric label="Tenant Since" value={formatDate(tenant.createdAt)} />
                </section>

                <section className="border-t border-parcelis-border pt-6">
                  <h3 className="text-xl font-bold text-parcelis-charcoal">Current Lease</h3>
                  {currentLease ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <RecordMetric
                        icon={Building2}
                        label="Property"
                        value={currentLease.property.name}
                        detail={`Unit ${currentLease.unitLabel}`}
                      />
                      <RecordMetric label="Monthly Rent" value={formatCurrency(currentLease.monthlyRentCents)} />
                      <RecordMetric label="Starts" value={formatDate(currentLease.startsOn)} />
                      <RecordMetric label="Ends" value={formatDate(currentLease.endsOn)} />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-parcelis-gray">No active lease.</p>
                  )}
                </section>

                <section className="border-t border-parcelis-border pt-6">
                  <h3 className="text-xl font-bold text-parcelis-charcoal">Roommates</h3>
                  {roommates.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {roommates.map((roommate) => (
                        <Link
                          className="rounded-md border border-parcelis-border px-3 py-2 text-sm font-semibold text-parcelis-charcoal hover:border-parcelis-green hover:text-parcelis-green"
                          href={getTenantLink(roommate.id)}
                          key={roommate.id}
                        >
                          {roommate.firstName} {roommate.lastName}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-parcelis-gray">No roommates on this lease.</p>
                  )}
                </section>

                <section className="border-t border-parcelis-border pt-6">
                  <h3 className="text-xl font-bold text-parcelis-charcoal">Invoices</h3>
                  {invoices.length ? (
                    <div className="mt-4 overflow-x-auto rounded-md border border-parcelis-border">
                      <Table className="min-w-[560px]">
                        <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                          <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell className="font-semibold">
                                INV-{String(invoice.invoiceNumber).padStart(7, "0")}
                              </TableCell>
                              <TableCell>{formatDate(invoice.dueOn)}</TableCell>
                              <TableCell>{formatCurrency(invoice.amountCents)}</TableCell>
                              <TableCell className="text-right">
                                <Link
                                  className="font-semibold text-parcelis-green hover:underline"
                                  href={getInvoiceLink(invoice.id)}
                                >
                                  View
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-parcelis-gray">No invoices for the current lease.</p>
                  )}
                </section>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      <TenantDrawer
        drawerTitle="Edit Tenant"
        error={updateTenantMutation.error}
        form={tenantForm}
        imageFile={tenantImageFile}
        imageUrl={tenant?.imageUrl}
        isPending={updateTenantMutation.isPending}
        onFormChange={setTenantForm}
        onImageChange={setTenantImageFile}
        onOpenChange={(nextOpen) => {
          setIsEditDrawerOpen(nextOpen);
          if (!nextOpen) setTenantImageFile(null);
        }}
        onSubmit={(form, imageFile) => {
          if (tenantId) updateTenantMutation.mutate({ input: { id: tenantId, ...form }, imageFile });
        }}
        open={isEditDrawerOpen}
        submitLabel="Save Changes"
      />
    </>
  );
}

function RecordMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail?: string;
  icon?: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-parcelis-gray">{label}</p>
      <div className="mt-2 flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-parcelis-green" /> : null}
        <div className="min-w-0">
          <p className="font-semibold text-parcelis-charcoal">{value}</p>
          {detail ? <p className="mt-1 text-sm text-parcelis-gray">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}
