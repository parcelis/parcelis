"use client";

import * as React from "react";
import {
  Building2,
  CircleArrowUp,
  DoorOpen,
  FileText,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Phone,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  Textarea,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "./api-client";

type NoteSubject = { propertyId: number } | { unitId: number } | { tenantId: number };
type NotesTab = "notes" | "files";

const tabs: { value: NotesTab; label: string }[] = [
  { value: "notes", label: "Notes" },
  { value: "files", label: "Files" },
];

type NotesDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertySummary?: {
    name: string;
    addressLines: string[];
    unitCount: number;
  };
  tenantSummary?: {
    email: string;
    name: string;
    phone: string | null;
  };
  unitSummary?: {
    addressLines: string[];
    name: string;
    propertyName: string;
  };
  subject: NoteSubject;
  subjectLabel: string;
};

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function NotesDrawer({
  onOpenChange,
  open,
  propertySummary,
  subject,
  subjectLabel,
  tenantSummary,
  unitSummary,
}: NotesDrawerProps) {
  const [activeTab, setActiveTab] = React.useState<NotesTab>("notes");
  const [draft, setDraft] = React.useState("");
  const [editingNoteId, setEditingNoteId] = React.useState<number | null>(null);
  const [editDraft, setEditDraft] = React.useState("");
  const [notePendingDeletion, setNotePendingDeletion] = React.useState<number | null>(null);
  const tabRefs = React.useRef<Record<NotesTab, HTMLButtonElement | null>>({ notes: null, files: null });
  const drawerSession = React.useRef(0);
  const wasOpen = React.useRef(open);
  const needsReset = React.useRef(false);
  const queryClient = useQueryClient();
  const notesQuery = useQuery({
    queryKey: queryKeys.notes.list(subject),
    queryFn: () => apiClient.notes.list.query(subject),
    enabled: open,
  });
  const createNote = useMutation({
    mutationFn: ({ body }: { body: string; session: number }) => apiClient.notes.create.mutate({ ...subject, body }),
    onSuccess: async (_note, variables) => {
      if (variables.session === drawerSession.current) {
        setDraft((currentDraft) => (currentDraft === variables.body ? "" : currentDraft));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes.list(subject) });
    },
  });
  const updateNote = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string; session: number }) =>
      apiClient.notes.update.mutate({ id, body }),
    onSuccess: async (_note, variables) => {
      if (variables.session === drawerSession.current) {
        setEditingNoteId((currentNoteId) => (currentNoteId === variables.id ? null : currentNoteId));
        setEditDraft((currentDraft) => (currentDraft === variables.body ? "" : currentDraft));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes.list(subject) });
    },
  });
  const deleteNote = useMutation({
    mutationFn: ({ id }: { id: number; session: number }) => apiClient.notes.delete.mutate({ id }),
    onSuccess: async (_note, variables) => {
      if (variables.session === drawerSession.current) {
        setNotePendingDeletion((currentNoteId) => (currentNoteId === variables.id ? null : currentNoteId));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes.list(subject) });
    },
  });
  const isMutationPending = createNote.isPending || updateNote.isPending || deleteNote.isPending;

  const resetTransientState = React.useCallback(() => {
    setActiveTab("notes");
    setDraft("");
    setEditingNoteId(null);
    setEditDraft("");
    setNotePendingDeletion(null);
    createNote.reset();
    updateNote.reset();
    deleteNote.reset();
  }, [createNote.reset, deleteNote.reset, updateNote.reset]);

  React.useEffect(() => {
    if (!open && wasOpen.current) {
      drawerSession.current += 1;
      needsReset.current = true;
    }
    if (!open && needsReset.current && !isMutationPending) {
      resetTransientState();
      needsReset.current = false;
    }
    wasOpen.current = open;
  }, [isMutationPending, open, resetTransientState]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (isMutationPending) {
        return;
      }
      if (notePendingDeletion !== null) {
        setNotePendingDeletion(null);
        return;
      }
      resetTransientState();
    }
    onOpenChange(nextOpen);
  }

  function selectTab(tab: NotesTab) {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  }

  function startEdit(note: { id: number; body: string }) {
    updateNote.reset();
    setEditingNoteId(note.id);
    setEditDraft(note.body);
  }

  function cancelEdit() {
    updateNote.reset();
    setEditingNoteId(null);
    setEditDraft("");
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.value === activeTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      if (nextTab) {
        selectTab(nextTab.value);
      }
    }
  }

  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      <DrawerContent size="lg">
        <AlertDialog
          onOpenChange={(nextOpen) => !nextOpen && !deleteNote.isPending && setNotePendingDeletion(null)}
          open={notePendingDeletion !== null}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete note?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            {deleteNote.error ? <p className="mt-3 text-sm text-red-700">{deleteNote.error.message}</p> : null}
            <AlertDialogFooter>
              <Button
                disabled={deleteNote.isPending}
                onClick={() => setNotePendingDeletion(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={isMutationPending}
                onClick={() =>
                  notePendingDeletion !== null &&
                  deleteNote.mutate({ id: notePendingDeletion, session: drawerSession.current })
                }
                type="button"
                className="bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700"
              >
                {deleteNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose />
          <DrawerTitle>Notes</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 py-5 md:px-6">
          {propertySummary ? (
            <div className="grid gap-4 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white md:grid-cols-[3rem_minmax(0,1fr)_8rem] md:items-center dark:bg-parcelis-slate">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">{propertySummary.name}</p>
                <div className="mt-1 space-y-0.5 text-sm font-medium text-white/70">
                  {propertySummary.addressLines.map((line, index) => (
                    <p className="truncate" key={`${line}-${index}`}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
              <div className="border-white/15 md:border-l md:pl-8">
                <p className="text-xs font-semibold uppercase text-white/55">Units</p>
                <p className="mt-1 text-base font-semibold text-white">{propertySummary.unitCount}</p>
              </div>
            </div>
          ) : unitSummary ? (
            <div className="grid gap-4 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white md:grid-cols-[3rem_minmax(0,1fr)] md:items-center dark:bg-parcelis-slate">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                <DoorOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">{unitSummary.name}</p>
                <p className="mt-1 truncate text-sm font-semibold text-white/80">{unitSummary.propertyName}</p>
                <div className="mt-1 space-y-0.5 text-sm font-medium text-white/70">
                  {unitSummary.addressLines.map((line, index) => (
                    <p className="truncate" key={`${line}-${index}`}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : tenantSummary ? (
            <div className="grid gap-4 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white md:grid-cols-[3rem_minmax(0,1fr)] md:items-center dark:bg-parcelis-slate">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">{tenantSummary.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-2 text-sm font-semibold hover:bg-white/15"
                    href={`mailto:${tenantSummary.email}`}
                  >
                    <Mail className="h-4 w-4 text-parcelis-green" />
                    {tenantSummary.email}
                  </a>
                  {tenantSummary.phone ? (
                    <a
                      className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-2 text-sm font-semibold hover:bg-white/15"
                      href={`tel:${tenantSummary.phone}`}
                    >
                      <Phone className="h-4 w-4 text-parcelis-green" />
                      {tenantSummary.phone}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-parcelis-gray">{subjectLabel}</p>
          )}
        </div>
        <div className="border-b border-parcelis-border px-4 md:px-6">
          <div aria-label="Notes drawer sections" className="flex gap-5" role="tablist">
            {tabs.map(({ label, value }) => (
              <button
                aria-controls={`${value}-panel`}
                aria-selected={activeTab === value}
                className={`border-b-2 px-1 py-3 text-sm font-semibold transition ${
                  activeTab === value
                    ? "border-parcelis-green text-parcelis-charcoal"
                    : "border-transparent text-parcelis-gray hover:text-parcelis-charcoal"
                }`}
                key={value}
                id={`${value}-tab`}
                onClick={() => selectTab(value)}
                onKeyDown={handleTabKeyDown}
                ref={(element) => {
                  tabRefs.current[value] = element;
                }}
                role="tab"
                tabIndex={activeTab === value ? 0 : -1}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div
          aria-labelledby={`${activeTab}-tab`}
          className="flex-1 overflow-y-auto px-4 py-5 md:px-6"
          id={`${activeTab}-panel`}
          role="tabpanel"
          tabIndex={0}
        >
          {activeTab === "notes" ? (
            <div className="space-y-5">
              <div className="relative">
                <label className="text-sm font-semibold text-parcelis-charcoal" htmlFor="note-body">
                  New note
                </label>
                <Textarea
                  className="mt-2 pr-12"
                  disabled={isMutationPending}
                  id="note-body"
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Add internal context, reminders, or instructions..."
                  value={draft}
                />
                <button
                  aria-label="Add note"
                  className="absolute bottom-2 right-2 inline-grid h-8 w-8 place-items-center rounded-full text-parcelis-green transition hover:bg-parcelis-green/10 disabled:cursor-not-allowed disabled:text-parcelis-gray disabled:hover:bg-transparent"
                  disabled={!draft.trim() || isMutationPending}
                  onClick={() => createNote.mutate({ body: draft, session: drawerSession.current })}
                  type="button"
                >
                  {createNote.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CircleArrowUp className="h-5 w-5" />
                  )}
                </button>
              </div>
              {createNote.error ? <p className="text-sm text-red-700">{createNote.error.message}</p> : null}
              {notesQuery.isLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-parcelis-gray">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading notes
                </div>
              ) : notesQuery.error ? (
                <p className="text-sm text-red-700">{notesQuery.error.message}</p>
              ) : notesQuery.data?.length ? (
                <div className="space-y-3">
                  {notesQuery.data.map((note) => (
                    <article
                      className="border-l-4 border-parcelis-green bg-parcelis-green/5 py-3 pl-4 pr-3"
                      key={note.id}
                    >
                      {editingNoteId === note.id ? (
                        <div>
                          <Textarea
                            aria-label="Edit note"
                            disabled={isMutationPending}
                            onChange={(event) => setEditDraft(event.target.value)}
                            value={editDraft}
                          />
                          <div className="mt-3 flex justify-end gap-2">
                            {updateNote.error ? (
                              <p className="mr-auto self-center text-sm text-red-700">{updateNote.error.message}</p>
                            ) : null}
                            <Button
                              disabled={isMutationPending}
                              onClick={cancelEdit}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Cancel
                            </Button>
                            <Button
                              disabled={!editDraft.trim() || isMutationPending}
                              onClick={() =>
                                updateNote.mutate({ id: note.id, body: editDraft, session: drawerSession.current })
                              }
                              size="sm"
                              type="button"
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <p className="whitespace-pre-wrap text-sm leading-6 text-parcelis-charcoal">{note.body}</p>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  aria-label="Note actions"
                                  disabled={isMutationPending}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => startEdit(note)}>
                                  <Pencil className="h-4 w-4 text-parcelis-green" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-700 focus:bg-red-50 focus:text-red-700"
                                  onSelect={() => setNotePendingDeletion(note.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <p className="mt-3 text-xs text-parcelis-gray">{formatDate(note.createdAt)}</p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-parcelis-border px-4 py-8 text-center text-sm text-parcelis-gray">
                  No notes yet.
                </p>
              )}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center rounded-md border border-dashed border-parcelis-border p-6 text-center">
              <div>
                <FileText className="mx-auto h-7 w-7 text-parcelis-gray" />
                <h3 className="mt-3 font-semibold text-parcelis-charcoal">Files are coming soon</h3>
                <p className="mt-1 text-sm text-parcelis-gray">Attachments will be managed here.</p>
              </div>
            </div>
          )}
        </div>
        {activeTab === "notes" ? (
          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button
              className="min-w-40"
              disabled={isMutationPending}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              className="min-w-40"
              disabled={!draft.trim() || isMutationPending}
              onClick={() => createNote.mutate({ body: draft, session: drawerSession.current })}
              type="button"
            >
              Add note
            </Button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
