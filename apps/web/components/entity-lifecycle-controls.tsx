"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@parcelis/ui";

type EntityLifecycleControlsProps = {
  archiveDescription: React.ReactNode;
  cancelDeleteLabel: string;
  deleteDescription: React.ReactNode;
  entityLabel: string;
  isArchived: boolean;
  isAvailable: boolean;
  onArchive: () => Promise<unknown>;
  onArchiveSuccess: () => Promise<void>;
  onDelete: () => Promise<unknown>;
  onDeleteSuccess: () => Promise<void>;
  onReactivate: () => Promise<unknown>;
  onReactivateSuccess: () => Promise<void>;
};

export function EntityLifecycleControls({
  archiveDescription,
  cancelDeleteLabel,
  deleteDescription,
  entityLabel,
  isArchived,
  isAvailable,
  onArchive,
  onArchiveSuccess,
  onDelete,
  onDeleteSuccess,
  onReactivate,
  onReactivateSuccess,
}: EntityLifecycleControlsProps) {
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const archiveMutation = useMutation({
    mutationFn: onArchive,
    onSuccess: async () => {
      setIsArchiveDialogOpen(false);
      await onArchiveSuccess();
    },
  });
  const reactivateMutation = useMutation({ mutationFn: onReactivate, onSuccess: onReactivateSuccess });
  const deleteMutation = useMutation({
    mutationFn: onDelete,
    onSuccess: async () => {
      setIsDeleteDialogOpen(false);
      await onDeleteSuccess();
    },
  });
  const handleArchiveDialogOpenChange = (open: boolean) => {
    setIsArchiveDialogOpen(open);
    if (!open) archiveMutation.reset();
  };
  const handleDeleteDialogOpenChange = (open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) deleteMutation.reset();
  };
  const dialogs = (
    <>
      <AlertDialog onOpenChange={handleArchiveDialogOpenChange} open={isArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {entityLabel}?</AlertDialogTitle>
            <AlertDialogDescription>{archiveDescription}</AlertDialogDescription>
            {archiveMutation.error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                Unable to archive this {entityLabel}. {archiveMutation.error.message}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => handleArchiveDialogOpenChange(false)} type="button" variant="secondary">
              Keep Active
            </Button>
            <Button disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate()} type="button">
              {archiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Archive
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={handleDeleteDialogOpenChange} open={isDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entityLabel}?</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
            {deleteMutation.error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                Unable to delete this {entityLabel}. {deleteMutation.error.message}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => handleDeleteDialogOpenChange(false)} type="button" variant="secondary">
              {cancelDeleteLabel}
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              type="button"
              variant="destructive"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return (
    <>
      {typeof document === "undefined" ? dialogs : createPortal(dialogs, document.body)}
      {isArchived ? (
        <Button
          aria-label={`Unarchive ${entityLabel}`}
          className="min-w-10 sm:min-w-40"
          disabled={reactivateMutation.isPending}
          onClick={() => reactivateMutation.mutate()}
          variant="secondary"
        >
          {reactivateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArchiveRestore className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Unarchive</span>
        </Button>
      ) : (
        <Button
          aria-label={`Archive ${entityLabel}`}
          className="min-w-10 sm:min-w-40"
          disabled={!isAvailable}
          onClick={() => setIsArchiveDialogOpen(true)}
          variant="secondary"
        >
          <Archive className="h-4 w-4" />
          <span className="hidden sm:inline">Archive</span>
        </Button>
      )}
      <Button
        aria-label={`Delete ${entityLabel}`}
        className="min-w-10 sm:min-w-40"
        disabled={!isAvailable}
        onClick={() => setIsDeleteDialogOpen(true)}
        variant="destructive"
      >
        <Trash2 className="h-4 w-4" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    </>
  );
}
