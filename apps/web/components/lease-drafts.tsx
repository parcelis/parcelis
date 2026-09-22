"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "./api-client";
import { hasPermission } from "./property-access";
import { getLeaseDraftLink } from "../lib/entity-links";

export function LeaseDrafts() {
  const queryClient = useQueryClient();
  const draftsQuery = useQuery({ queryKey: queryKeys.leases.drafts, queryFn: () => apiClient.leases.drafts.query() });
  const userQuery = useQuery({ queryKey: queryKeys.auth.me, queryFn: () => apiClient.auth.me.query() });
  const [discarding, setDiscarding] = useState<NonNullable<typeof draftsQuery.data>[number] | null>(null);
  const discard = useMutation({
    mutationFn: (id: number) => apiClient.leases.delete.mutate({ id }),
    onSuccess: async () => {
      setDiscarding(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.leases.drafts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
        queryClient.invalidateQueries({ queryKey: ["lease-draft"] }),
      ]);
    },
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold">Unfinished leases</h2>
      </CardHeader>
      <CardContent className="max-h-96 overflow-auto p-0">
        {draftsQuery.error ? (
          <p role="alert" className="p-5 text-sm text-red-700">
            {draftsQuery.error.message}
          </p>
        ) : draftsQuery.isPending ? (
          <p className="p-5 text-sm">Loading drafts…</p>
        ) : !draftsQuery.data.length ? (
          <p className="p-5 text-sm text-parcelis-gray">No unfinished leases.</p>
        ) : (
          <Table>
            <TableHeader className="bg-parcelis-porcelain text-parcelis-gray">
              <TableRow>
                <TableHead>Property / unit</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftsQuery.data.map((draft) => (
                <TableRow className="border-parcelis-border" key={draft.id}>
                  <TableCell>
                    {draft.property?.name ?? "Not set"} · Unit {draft.unit?.name ?? "Not set"}
                  </TableCell>
                  <TableCell>{new Date(draft.updatedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button asChild size="sm">
                        <Link href={getLeaseDraftLink(draft.leaseDraftKey)}>Resume draft</Link>
                      </Button>
                      {hasPermission(userQuery.data?.permissions, "leases", "delete") ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            discard.reset();
                            setDiscarding(draft);
                          }}
                        >
                          Discard
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <AlertDialog
        open={Boolean(discarding)}
        onOpenChange={(open) => {
          if (!open && !discard.isPending) setDiscarding(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard lease draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the unfinished lease for {discarding?.property?.name ?? "Not set"} · Unit{" "}
              {discarding?.unit?.name ?? "Not set"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {discard.error ? (
            <p role="alert" className="text-sm text-red-700">
              {discard.error.message}
            </p>
          ) : null}
          <AlertDialogFooter>
            <Button variant="secondary" disabled={discard.isPending} onClick={() => setDiscarding(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={discard.isPending}
              onClick={() => {
                if (discarding) discard.mutate(discarding.id);
              }}
            >
              Discard draft
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
