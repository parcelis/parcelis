"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Button, Card, CardContent, CardHeader, Input, Label } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { hasPermission } from "../../../../components/property-access";
import { SettingsRail } from "../../../../components/settings-rail";

export default function InvoicingSettingsPage() {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({ queryKey: queryKeys.auth.me, queryFn: () => apiClient.auth.me.query() });
  const canView = hasPermission(currentUserQuery.data?.permissions, "invoices", "view");
  const canCreate = hasPermission(currentUserQuery.data?.permissions, "invoices", "create");
  const canEdit = hasPermission(currentUserQuery.data?.permissions, "invoices", "edit");
  const canDelete = hasPermission(currentUserQuery.data?.permissions, "invoices", "delete");
  const chargesQuery = useQuery({
    queryKey: queryKeys.invoices.charges,
    queryFn: () => apiClient.invoices.charges.query(),
    enabled: canView,
  });
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [editing, setEditing] = React.useState<number | null>(null);
  const save = useMutation({
    mutationFn: () =>
      editing
        ? apiClient.invoices.updateCharge.mutate({ id: editing, name, description: description || null })
        : apiClient.invoices.createCharge.mutate({ name, description: description || null }),
    onSuccess: async () => {
      setName("");
      setDescription("");
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.charges });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiClient.invoices.deleteCharge.mutate({ id }),
    onSuccess: async (_result, id) => {
      if (editing === id) {
        setEditing(null);
        setName("");
        setDescription("");
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.charges });
    },
  });

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <Button asChild className="min-w-40" variant="secondary">
            <Link href="/">Portfolio</Link>
          </Button>
        </header>
        <div className="parcelis-page-shell">
          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsRail
              active="invoicing"
              canManageInvoicing={canView}
              canManageRoles={currentUserQuery.data?.user.role === "administrator"}
              canManageUsers={hasPermission(currentUserQuery.data?.permissions, "users", "view")}
            />
            <div className="min-w-0 flex-1">
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Settings</p>
                <h1 className="mt-5 text-3xl font-bold md:text-5xl">Invoicing</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                  Configure reusable invoice charges for leases and manual invoices.
                </p>
              </section>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">Charges</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">
                        Set an item name and an optional default description. Use {"{month}"} and {"{year}"} to include
                        the invoice month.
                      </p>
                    </div>
                    <ReceiptText className="h-5 w-5 text-parcelis-green" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {currentUserQuery.isLoading ? (
                    <LoadingState label="Loading account…" />
                  ) : currentUserQuery.error ? (
                    <p className="text-sm text-red-700">{currentUserQuery.error.message}</p>
                  ) : !canView ? (
                    <p className="text-sm text-parcelis-gray">You don’t have permission to view invoice settings.</p>
                  ) : (
                    <>
                      {(canCreate || canEdit) && (
                        <form
                          className="flex max-w-3xl flex-col gap-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            save.mutate();
                          }}
                        >
                          <div className="flex flex-col gap-4 md:flex-row">
                            <Label className="flex-1 gap-2">
                              Item name *
                              <Input
                                maxLength={200}
                                onChange={(event) => setName(event.target.value)}
                                required
                                value={name}
                              />
                            </Label>
                            <Label className="flex-1 gap-2">
                              Default description
                              <Input
                                maxLength={2000}
                                onChange={(event) => setDescription(event.target.value)}
                                value={description}
                              />
                            </Label>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button disabled={save.isPending || (editing ? !canEdit : !canCreate)} type="submit">
                              {editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                              {editing ? "Save charge" : "Add charge"}
                            </Button>
                            {editing && (
                              <Button
                                onClick={() => {
                                  setEditing(null);
                                  setName("");
                                  setDescription("");
                                }}
                                type="button"
                                variant="secondary"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                          {save.error && <p className="text-sm text-red-700">{save.error.message}</p>}
                        </form>
                      )}
                      {chargesQuery.isLoading ? (
                        <LoadingState label="Loading charges…" />
                      ) : chargesQuery.error ? (
                        <p className="text-sm text-red-700">{chargesQuery.error.message}</p>
                      ) : (
                        <div className="divide-y divide-parcelis-border rounded-md border border-parcelis-border">
                          {(chargesQuery.data ?? []).map((charge) => (
                            <div className="flex items-center justify-between gap-4 p-4" key={charge.id}>
                              <div className="min-w-0">
                                <p className="font-semibold text-parcelis-charcoal">
                                  {charge.name}
                                  {charge.isDefault && <span className="ml-2 text-xs text-parcelis-gray">Default</span>}
                                </p>
                                <p className="text-sm text-parcelis-gray">
                                  {charge.description || "No default description"}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                {canEdit && (
                                  <Button
                                    aria-label={`Edit ${charge.name}`}
                                    onClick={() => {
                                      setEditing(charge.id);
                                      setName(charge.name);
                                      setDescription(charge.description ?? "");
                                    }}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {canDelete && !charge.isDefault && (
                                  <Button
                                    aria-label={`Delete ${charge.name}`}
                                    disabled={remove.isPending}
                                    onClick={() => remove.mutate(charge.id)}
                                    size="sm"
                                    variant="destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {remove.error && <p className="text-sm text-red-700">{remove.error.message}</p>}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
