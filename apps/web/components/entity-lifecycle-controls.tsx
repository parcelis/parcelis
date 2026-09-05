"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ChevronDown, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@parcelis/ui";

type EntityLifecycleControlsProps = {
  presentation?: "buttons" | "dropdown";
  children?: React.ReactNode;
  headerActions?: React.ReactNode;
  promoteReactivate?: boolean;
  archiveDescription: React.ReactNode;
  canArchive: boolean;
  canDelete: boolean;
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
  presentation = "buttons",
  children,
  headerActions,
  promoteReactivate = false,
  archiveDescription,
  canArchive,
  canDelete,
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
  const [isMounted, setIsMounted] = React.useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);
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

  if (presentation === "dropdown") {
    const displayLabel = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);
    return (
      <>
        {isMounted ? createPortal(dialogs, document.body) : null}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center">
            {promoteReactivate && canArchive && isArchived ? (
              <Button
                className="hidden min-w-40 rounded-r-none md:inline-flex"
                disabled={!isAvailable || reactivateMutation.isPending}
                onClick={() => reactivateMutation.mutate()}
              >
                {reactivateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArchiveRestore className="h-4 w-4" />
                )}
                Unarchive {displayLabel}
              </Button>
            ) : null}
            {headerActions}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="min-w-10 md:min-w-40 md:rounded-l-none md:border-l-0"
                  disabled={!isAvailable}
                  variant="secondary"
                >
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {promoteReactivate && canArchive && isArchived ? (
                  <DropdownMenuItem
                    className="md:hidden"
                    disabled={!isAvailable || reactivateMutation.isPending}
                    onSelect={() => reactivateMutation.mutate()}
                  >
                    <ArchiveRestore className="h-4 w-4" />
                    Unarchive {displayLabel}
                  </DropdownMenuItem>
                ) : null}
                {children}
                {children && ((canArchive && !(promoteReactivate && isArchived)) || canDelete) ? (
                  <DropdownMenuSeparator />
                ) : null}
                {canArchive && !(promoteReactivate && isArchived) ? (
                  <DropdownMenuItem
                    disabled={!isAvailable || reactivateMutation.isPending}
                    onSelect={() => {
                      if (isArchived) reactivateMutation.mutate();
                      else setIsArchiveDialogOpen(true);
                    }}
                  >
                    {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    {isArchived ? "Unarchive" : "Archive"} {displayLabel}
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    className="text-red-700 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40 dark:focus:text-red-300"
                    disabled={!isAvailable}
                    onSelect={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete {displayLabel}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {reactivateMutation.error ? (
            <p className="text-sm font-medium text-red-700" role="alert">
              Unable to unarchive this {entityLabel}. {reactivateMutation.error.message}
            </p>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {isMounted ? createPortal(dialogs, document.body) : null}
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {canArchive && isArchived ? (
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
          ) : canArchive ? (
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
          ) : null}
          {canDelete ? (
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
          ) : null}
        </div>
        {reactivateMutation.error ? (
          <p className="text-sm font-medium text-red-700" role="alert">
            Unable to unarchive this {entityLabel}. {reactivateMutation.error.message}
          </p>
        ) : null}
      </div>
    </>
  );
}
