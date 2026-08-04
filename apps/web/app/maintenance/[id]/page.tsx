"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CircleX,
  Check,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Image,
  Pencil,
  StickyNote,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ParcelisLogo,
  Textarea,
} from "@parcelis/ui";
import { isActiveMaintenanceTicketStatus, isTerminalMaintenanceTicketStatus } from "@parcelis/schemas";
import { apiClient } from "../../../components/api-client";
import { Sidebar } from "../../../components/sidebar";
import { NotesDrawer } from "../../../components/notes-drawer";
import { MaintenanceDrawer } from "../../../components/maintenance-drawer";
import { uploadMaintenanceImage } from "../../../components/maintenance-image-upload";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;
const label = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

export default function MaintenanceTicketPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editingNoteId, setEditingNoteId] = React.useState<number | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [resolutionNote, setResolutionNote] = React.useState("");
  const [isResolutionNoteOpen, setIsResolutionNoteOpen] = React.useState(false);
  const [cancellationNote, setCancellationNote] = React.useState("");
  const [isCancellationNoteOpen, setIsCancellationNoteOpen] = React.useState(false);
  const [galleryIndex, setGalleryIndex] = React.useState<number | null>(null);
  const queryClient = useQueryClient();
  const ticketQuery = useQuery({
    queryKey: ["maintenance", "byId", id],
    queryFn: () => apiClient.maintenance.byId.query({ id }),
    enabled: id > 0,
  });
  const notesQuery = useQuery({
    queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }],
    queryFn: () => apiClient.notes.list.query({ maintenanceTicketId: id, limit: 5 }),
    enabled: id > 0,
  });
  const acknowledgeTicket = useMutation({
    mutationFn: () => apiClient.maintenance.updateStatus.mutate({ id, status: "in_progress" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
  });
  const resolveTicket = useMutation({
    mutationFn: async (note?: string) => {
      if (note) await apiClient.notes.create.mutate({ maintenanceTicketId: id, body: note });
      return apiClient.maintenance.updateStatus.mutate({ id, status: "resolved" });
    },
    onSuccess: async () => {
      setResolutionNote("");
      setIsResolutionNoteOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
        queryClient.invalidateQueries({ queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }] }),
      ]);
    },
  });
  const reopenTicket = useMutation({
    mutationFn: () => apiClient.maintenance.updateStatus.mutate({ id, status: "in_progress" }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
        queryClient.invalidateQueries({ queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }] }),
      ]),
  });
  const cancelTicket = useMutation({
    mutationFn: (noteBody: string) => apiClient.maintenance.updateStatus.mutate({ id, status: "canceled", noteBody }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
        queryClient.invalidateQueries({ queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }] }),
      ]).then(() => {
        setCancellationNote("");
        setIsCancellationNoteOpen(false);
      }),
  });
  const saveTicket = useMutation({
    mutationFn: async ({
      input,
      attachments,
    }: {
      input: Parameters<typeof apiClient.maintenance.update.mutate>[0];
      attachments: File[];
    }) => {
      const updatedTicket = await apiClient.maintenance.update.mutate(input);
      await Promise.all(attachments.map((file) => uploadMaintenanceImage(updatedTicket.id, file)));
      return updatedTicket;
    },
    onSuccess: () => {
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] });
    },
  });
  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: number) => apiClient.maintenance.deleteImage.mutate({ id: attachmentId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
  });
  const deleteNote = useMutation({
    mutationFn: (noteId: number) => apiClient.notes.delete.mutate({ id: noteId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }] }),
  });
  const saveNote = useMutation({
    mutationFn: ({ noteId, body }: { noteId: number; body: string }) =>
      apiClient.notes.update.mutate({ id: noteId, body }),
    onSuccess: () => {
      setEditingNoteId(null);
      setNoteDraft("");
      queryClient.invalidateQueries({ queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }] });
    },
  });
  const ticket = ticketQuery.data;
  const requester = ticket?.requestedByTenant ?? ticket?.requestedByLandlord;
  const attachments = ticket?.attachments ?? [];
  const activeAttachment = galleryIndex === null ? null : attachments[galleryIndex];
  const latestNote = notesQuery.data?.[0];
  const hasRecentNote = latestNote
    ? Date.now() - new Date(latestNote.createdAt).getTime() <= 24 * 60 * 60 * 1000
    : false;
  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <Sidebar active="maintenance" />
      <NotesDrawer
        maintenanceSummary={
          ticket
            ? {
                propertyName: ticket.property.name,
                status: label(ticket.status),
                units: ticket.units.length
                  ? ticket.units.map((item) => `Unit ${item.unit.name}`).join(" | ")
                  : "Property-wide",
              }
            : undefined
        }
        onOpenChange={setNotesOpen}
        open={notesOpen}
        subject={{ maintenanceTicketId: id }}
        subjectLabel={ticket?.title ?? "Maintenance Ticket"}
      />
      <MaintenanceDrawer
        drawerTitle="Edit Maintenance Item"
        error={saveTicket.error}
        existingAttachments={attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          imageUrl: attachment.imageUrl,
        }))}
        isDeletingAttachment={deleteAttachment.isPending}
        initialValues={
          ticket
            ? {
                ticketTitle: ticket.title,
                propertyId: String(ticket.propertyId),
                unitIds: ticket.units.map((item) => item.unit.id),
                categoryId: String(ticket.category?.id ?? ""),
                description: ticket.description ?? "",
                requestedById: String(ticket.requestedByTenantId ?? ticket.requestedByLandlordId ?? ""),
                requestedByType: ticket.requestedByType ?? "tenant",
                priority: ticket.priority,
                isUrgent: ticket.isUrgent,
                consentToEnter: ticket.consentToEnter,
              }
            : undefined
        }
        isPending={saveTicket.isPending}
        onOpenChange={setEditOpen}
        onDeleteExistingAttachment={(attachmentId) => deleteAttachment.mutate(attachmentId)}
        onSubmit={(input, attachmentFiles) =>
          saveTicket.mutate({ input: { ...input, id }, attachments: attachmentFiles })
        }
        open={editOpen}
        statusLabel={ticket ? label(ticket.status) : "New"}
        submitLabel="Save Changes"
      />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/maintenance">
                <ArrowLeft className="h-4 w-4" />
                Maintenance
              </Link>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              className="min-w-40 border-red-200 text-red-700 hover:bg-red-50"
              disabled={!ticket || isTerminalMaintenanceTicketStatus(ticket.status) || cancelTicket.isPending}
              onClick={() => setIsCancellationNoteOpen(true)}
              variant="secondary"
            >
              <CircleX className="h-4 w-4" />
              Cancel Ticket
            </Button>
            {ticket && isActiveMaintenanceTicketStatus(ticket.status) ? (
              <Button
                className="min-w-40"
                disabled={resolveTicket.isPending}
                onClick={() => (hasRecentNote ? resolveTicket.mutate(undefined) : setIsResolutionNoteOpen(true))}
                variant="secondary"
              >
                <Check className="h-4 w-4" />
                Resolve
              </Button>
            ) : null}
            <Button
              className="min-w-40"
              disabled={ticket?.status !== "resolved" || reopenTicket.isPending}
              onClick={() => reopenTicket.mutate()}
              variant="secondary"
            >
              <Wrench className="h-4 w-4" />
              Reopen Ticket
            </Button>
            <Button className="min-w-40" onClick={() => setNotesOpen(true)} variant="secondary">
              <StickyNote className="h-4 w-4" />
              Notes
            </Button>
            <Button className="min-w-40" onClick={() => setEditOpen(true)} variant="primary">
              <Pencil className="h-4 w-4" />
              Edit Maintenance
            </Button>
            {ticket?.status === "new" ? (
              <Button
                className="min-w-40"
                disabled={acknowledgeTicket.isPending}
                onClick={() => acknowledgeTicket.mutate()}
              >
                <Check className="h-4 w-4" />
                Acknowledge
              </Button>
            ) : null}
          </div>
        </header>
        <div className="parcelis-page-shell">
          {ticketQuery.isLoading ? (
            <p className="text-sm text-parcelis-gray">Loading maintenance ticket…</p>
          ) : !ticket ? (
            <p className="text-sm text-parcelis-gray">Maintenance ticket not found.</p>
          ) : (
            <>
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <span className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                      <Wrench className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">
                        Maintenance Ticket
                      </p>
                      <h1 className="mt-3 text-3xl font-bold">{ticket.title}</h1>
                      <p className="mt-2 text-sm text-white/75">
                        {ticket.property.name} ·{" "}
                        {ticket.units.length
                          ? ticket.units.map((item) => `Unit ${item.unit.name}`).join(" | ")
                          : "Property-wide"}
                      </p>
                    </div>
                  </div>
                  <div className="w-full lg:w-[36rem]">
                    <div className="grid w-full gap-3 sm:grid-cols-3">
                      <MaintenanceHeroStatus
                        icon={BadgeCheck}
                        label="Ticket Status"
                        tone={getStatusTone(ticket.status)}
                        value={label(ticket.status)}
                      />
                      <MaintenanceHeroStatus
                        icon={UserRound}
                        label="Requested By"
                        value={requester ? `${requester.firstName} ${requester.lastName}` : "Not set"}
                      />
                      <MaintenanceHeroStatus
                        icon={CalendarDays}
                        label="Issue Date"
                        value={formatDate(ticket.openedOn)}
                      />
                    </div>
                  </div>
                </div>
              </section>
              {isResolutionNoteOpen ? (
                <Card className="mb-6 border-amber-500/30">
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Add a resolution note</h2>
                    <p className="mt-1 text-sm text-parcelis-gray">
                      A note from the last 24 hours is required before resolving this ticket.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      onChange={(event) => setResolutionNote(event.target.value)}
                      placeholder="Describe the work completed or the resolution."
                      rows={4}
                      value={resolutionNote}
                    />
                    {resolveTicket.error ? (
                      <p className="mt-3 text-sm font-medium text-red-700">{resolveTicket.error.message}</p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Button
                        onClick={() => {
                          setIsResolutionNoteOpen(false);
                          setResolutionNote("");
                        }}
                        type="button"
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={!resolutionNote.trim() || resolveTicket.isPending}
                        onClick={() => resolveTicket.mutate(resolutionNote.trim())}
                        type="button"
                      >
                        <Check className="h-4 w-4" />
                        Save Note & Resolve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {isCancellationNoteOpen ? (
                <Card className="mb-6 border-red-200">
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Add a cancellation note</h2>
                    <p className="mt-1 text-sm text-parcelis-gray">
                      A note is required before canceling this maintenance ticket.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      onChange={(event) => setCancellationNote(event.target.value)}
                      placeholder="Explain why this ticket is being canceled."
                      rows={4}
                      value={cancellationNote}
                    />
                    {cancelTicket.error ? (
                      <p className="mt-3 text-sm font-medium text-red-700">{cancelTicket.error.message}</p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Button
                        onClick={() => {
                          setIsCancellationNoteOpen(false);
                          setCancellationNote("");
                        }}
                        type="button"
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                      <Button
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        disabled={!cancellationNote.trim() || cancelTicket.isPending}
                        onClick={() => cancelTicket.mutate(cancellationNote.trim())}
                        type="button"
                        variant="secondary"
                      >
                        <CircleX className="h-4 w-4" />
                        Save Note & Cancel Ticket
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Ticket details</h2>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-parcelis-gray">Category</p>
                        <p className="mt-1 font-semibold text-parcelis-charcoal">
                          {ticket.category?.label ?? "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-parcelis-gray">Priority</p>
                        <p className="mt-1 font-semibold text-parcelis-charcoal">
                          {ticket.isUrgent ? "Urgent" : label(ticket.priority)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-parcelis-gray">Requested by</p>
                        <p className="mt-1 font-semibold text-parcelis-charcoal">
                          {requester ? `${requester.firstName} ${requester.lastName}` : "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-parcelis-gray">Entry consent</p>
                        <p className="mt-1 font-semibold text-parcelis-charcoal">
                          {ticket.consentToEnter ? "Granted" : "Not granted"}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-parcelis-border pt-5">
                      <p className="text-xs font-semibold uppercase text-parcelis-gray">Description</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-parcelis-charcoal">
                        {ticket.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <div className="grid items-stretch gap-5 lg:grid-cols-2">
                  <Card className="h-full">
                    <CardHeader>
                      <h2 className="font-semibold text-parcelis-charcoal">Photos</h2>
                    </CardHeader>
                    <CardContent>
                      {attachments.length ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {attachments.map((attachment, index) => (
                            <button
                              className="group relative aspect-square overflow-hidden rounded-md border border-parcelis-border bg-parcelis-porcelain"
                              key={attachment.id}
                              onClick={() => setGalleryIndex(index)}
                              type="button"
                            >
                              <img
                                alt={attachment.fileName}
                                className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                                src={attachment.imageUrl ?? undefined}
                              />
                              <span className="absolute inset-x-0 bottom-0 truncate bg-parcelis-charcoal/75 px-2 py-1 text-left text-xs font-medium text-white">
                                {attachment.fileName}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-parcelis-border bg-parcelis-porcelain/50 px-4 py-10 text-center dark:bg-parcelis-charcoal/55">
                          <Image className="h-6 w-6 text-parcelis-green" />
                          <span className="mt-3 text-sm font-semibold text-parcelis-charcoal dark:text-white">
                            No photos attached
                          </span>
                          <span className="mt-1 text-xs text-parcelis-gray">
                            Attached photos will be available in the gallery.
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="h-full">
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                      <h2 className="font-semibold text-parcelis-charcoal">Recent notes</h2>
                      <Button onClick={() => setNotesOpen(true)} size="sm" variant="secondary">
                        View all
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {notesQuery.isLoading ? (
                        <p className="text-sm text-parcelis-gray">Loading notes…</p>
                      ) : notesQuery.data?.length ? (
                        notesQuery.data.map((note) => (
                          <div className="rounded-md border border-parcelis-border p-3" key={note.id}>
                            <div className="flex gap-3">
                              {editingNoteId === note.id ? (
                                <div className="min-w-0 flex-1 rounded-md border border-parcelis-green/40 bg-parcelis-green/5 p-3">
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-parcelis-green">
                                    Editing note
                                  </p>
                                  <Textarea onChange={(event) => setNoteDraft(event.target.value)} value={noteDraft} />
                                  <div className="mt-3 flex justify-end gap-2">
                                    <Button
                                      onClick={() => setEditingNoteId(null)}
                                      size="sm"
                                      type="button"
                                      variant="secondary"
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      disabled={!noteDraft.trim() || saveNote.isPending}
                                      onClick={() => saveNote.mutate({ noteId: note.id, body: noteDraft })}
                                      size="sm"
                                      type="button"
                                    >
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-parcelis-charcoal">
                                  {note.body}
                                </p>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    aria-label="Note actions"
                                    className="grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray"
                                    type="button"
                                  >
                                    <EllipsisVertical className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setEditingNoteId(note.id);
                                      setNoteDraft(note.body);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4 text-parcelis-green" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-700"
                                    onSelect={() => deleteNote.mutate(note.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <p className="mt-2 text-xs text-parcelis-gray">
                              {new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }).format(new Date(note.createdAt))}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-parcelis-gray">No notes yet.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
      <Dialog onOpenChange={(open) => !open && setGalleryIndex(null)} open={galleryIndex !== null}>
        <DialogContent className="max-w-4xl p-4">
          {activeAttachment ? (
            <div className="space-y-3">
              <img
                alt={activeAttachment.fileName}
                className="max-h-[75vh] w-full rounded-md object-contain"
                src={activeAttachment.imageUrl ?? undefined}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-parcelis-charcoal dark:text-white">
                  {activeAttachment.fileName}
                </p>
                {attachments.length > 1 ? (
                  <div className="flex gap-2 pr-8">
                    <Button
                      aria-label="Previous photo"
                      onClick={() =>
                        setGalleryIndex((index) =>
                          index === null ? 0 : (index - 1 + attachments.length) % attachments.length,
                        )
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label="Next photo"
                      onClick={() =>
                        setGalleryIndex((index) => (index === null ? 0 : (index + 1) % attachments.length))
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function getStatusTone(status: string) {
  if (status === "resolved" || status === "closed") return "text-parcelis-green";
  if (status === "canceled") return "text-red-700";
  return "text-amber-500";
}

function MaintenanceHeroStatus({
  icon: Icon,
  label,
  tone = "text-parcelis-green",
  value,
}: {
  icon: typeof BadgeCheck;
  label: string;
  tone?: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-white/70">
        <Icon className={`h-4 w-4 ${tone}`} />
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
