"use client";

import * as React from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CircleX,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Image,
  Pencil,
  StickyNote,
  StickyNotes,
  Trash2,
  UserRound,
  Wrench,
  WrenchOff,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Textarea,
} from "@parcelis/ui";
import { isActiveMaintenanceTicketStatus, isTerminalMaintenanceTicketStatus } from "@parcelis/schemas";
import { hasPermission } from "../../../../components/property-access";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { NotesDrawer } from "../../../../components/notes-drawer";
import { MaintenanceDrawer } from "../../../../components/maintenance-drawer";
import { uploadMaintenanceImage } from "../../../../components/maintenance-image-upload";
import { entityUpdatedMessage } from "../../../../components/toast-messages";

const label = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
const formatDateTime = (value: Date | string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const formatTicketNumber = (ticketNumber: number) => `MNT-${ticketNumber.toString().padStart(7, "0")}`;
type ActivityEventSummary = {
  id: number;
  subjectLabel: string;
  subjectReference: string | null;
  action: string;
  previousStatus: string | null;
  nextStatus: string | null;
  createdAt: Date | string;
};

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
  const [isLoggingOpen, setIsLoggingOpen] = React.useState(false);
  const [galleryIndex, setGalleryIndex] = React.useState<number | null>(null);
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });
  const canEditTicket = hasPermission(currentUserQuery.data?.permissions, "maintenance", "edit");
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
  const activityEventsQuery = useQuery({
    queryKey: ["activityEvents", "list", { subjectType: "maintenance_ticket", subjectId: id, limit: 50 }],
    queryFn: () => apiClient.activityEvents.list.query({ subjectType: "maintenance_ticket", subjectId: id, limit: 50 }),
    enabled: isLoggingOpen && id > 0,
  });
  const acknowledgeTicket = useMutation({
    mutationFn: () => apiClient.maintenance.updateStatus.mutate({ id, status: "in_progress" }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
        queryClient.invalidateQueries({
          queryKey: ["activityEvents", "list", { subjectType: "maintenance_ticket", subjectId: id }],
        }),
      ]),
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
        queryClient.invalidateQueries({
          queryKey: ["activityEvents", "list", { subjectType: "maintenance_ticket", subjectId: id }],
        }),
      ]);
    },
  });
  const reopenTicket = useMutation({
    mutationFn: () => apiClient.maintenance.updateStatus.mutate({ id, status: "in_progress" }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
        queryClient.invalidateQueries({ queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }] }),
        queryClient.invalidateQueries({
          queryKey: ["activityEvents", "list", { subjectType: "maintenance_ticket", subjectId: id }],
        }),
      ]),
  });
  const cancelTicket = useMutation({
    mutationFn: (noteBody: string) => apiClient.maintenance.updateStatus.mutate({ id, status: "canceled", noteBody }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] }),
        queryClient.invalidateQueries({ queryKey: ["notes", "list", { maintenanceTicketId: id, limit: 5 }] }),
        queryClient.invalidateQueries({
          queryKey: ["activityEvents", "list", { subjectType: "maintenance_ticket", subjectId: id }],
        }),
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
    onSuccess: (ticket) => {
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["maintenance", "byId", id] });
      toast.success(entityUpdatedMessage("Maintenance", ticket.title));
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
  const activityEvents = (activityEventsQuery.data ?? []) as ActivityEventSummary[];
  const requester = ticket?.requestedByTenant ?? ticket?.requestedByLandlord;
  const attachments = (ticket?.attachments ?? []).filter(
    (attachment): attachment is typeof attachment & { imageUrl: string } => typeof attachment.imageUrl === "string",
  );
  const activeAttachment = galleryIndex === null ? null : attachments[galleryIndex];
  const latestNote = notesQuery.data?.[0];
  const hasRecentNote = latestNote
    ? Date.now() - new Date(latestNote.createdAt).getTime() <= 24 * 60 * 60 * 1000
    : false;
  return (
    <main className="min-h-screen bg-parcelis-porcelain">
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
        ticketNumber={ticket?.ticketNumber}
      />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button asChild className="min-w-10 md:min-w-40" variant="secondary">
              <Link href="/maintenance">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only md:not-sr-only">Maintenance</span>
              </Link>
            </Button>
          </div>
          <div aria-label="Maintenance actions" className="flex items-center rounded-md shadow-sm" role="group">
            <Button
              className="hidden min-w-40 rounded-r-none md:inline-flex"
              disabled={!ticket || !canEditTicket}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              Edit Maintenance
            </Button>
            {ticket?.status === "new" ? (
              <Button
                className="hidden min-w-40 rounded-none border-l-0 md:inline-flex"
                disabled={!canEditTicket || acknowledgeTicket.isPending}
                onClick={() => acknowledgeTicket.mutate()}
                variant="secondary"
              >
                <Check className="h-4 w-4" />
                Acknowledge
              </Button>
            ) : ticket && isActiveMaintenanceTicketStatus(ticket.status) ? (
              <Button
                className="hidden min-w-40 rounded-none border-l-0 md:inline-flex"
                disabled={!canEditTicket || resolveTicket.isPending}
                onClick={() => (hasRecentNote ? resolveTicket.mutate(undefined) : setIsResolutionNoteOpen(true))}
                variant="secondary"
              >
                <Check className="h-4 w-4" />
                Resolve
              </Button>
            ) : ticket?.status === "resolved" ? (
              <Button
                className="hidden min-w-40 rounded-none border-l-0 md:inline-flex"
                disabled={!canEditTicket || reopenTicket.isPending}
                onClick={() => reopenTicket.mutate()}
                variant="secondary"
              >
                <Wrench className="h-4 w-4" />
                Reopen Ticket
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="md:min-w-40 md:rounded-l-none md:border-l-0" disabled={!ticket} variant="secondary">
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="md:hidden" disabled={!canEditTicket} onSelect={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit Maintenance
                </DropdownMenuItem>
                {ticket?.status === "new" ? (
                  <DropdownMenuItem
                    className="md:hidden"
                    disabled={!canEditTicket || acknowledgeTicket.isPending}
                    onSelect={() => acknowledgeTicket.mutate()}
                  >
                    <Check className="h-4 w-4" />
                    Acknowledge
                  </DropdownMenuItem>
                ) : null}
                {ticket && isActiveMaintenanceTicketStatus(ticket.status) ? (
                  <DropdownMenuItem
                    className={ticket.status === "new" ? undefined : "md:hidden"}
                    disabled={!canEditTicket || resolveTicket.isPending}
                    onSelect={() => (hasRecentNote ? resolveTicket.mutate(undefined) : setIsResolutionNoteOpen(true))}
                  >
                    <Check className="h-4 w-4" />
                    Resolve
                  </DropdownMenuItem>
                ) : null}
                {ticket?.status === "resolved" ? (
                  <DropdownMenuItem
                    className="md:hidden"
                    disabled={!canEditTicket || reopenTicket.isPending}
                    onSelect={() => reopenTicket.mutate()}
                  >
                    <Wrench className="h-4 w-4" />
                    Reopen Ticket
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setNotesOpen(true)}>
                  <StickyNote className="h-4 w-4" />
                  Add Notes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-700 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40 dark:focus:text-red-300"
                  disabled={
                    !ticket ||
                    !canEditTicket ||
                    isTerminalMaintenanceTicketStatus(ticket.status) ||
                    cancelTicket.isPending
                  }
                  onSelect={() => setIsCancellationNoteOpen(true)}
                >
                  <CircleX className="h-4 w-4" />
                  Cancel Ticket
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="parcelis-page-shell">
          {ticketQuery.isLoading ? (
            <LoadingState label="Loading maintenance ticket…" />
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
                        {formatTicketNumber(ticket.ticketNumber)}
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
                        <p className="text-xs font-semibold uppercase text-parcelis-gray">Ticket number</p>
                        <p className="mt-1 font-semibold text-parcelis-charcoal">
                          {formatTicketNumber(ticket.ticketNumber)}
                        </p>
                      </div>
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
                        <p className="text-xs font-semibold uppercase text-parcelis-gray">Consent to enter</p>
                        <p className="mt-1 font-semibold text-parcelis-charcoal">
                          {ticket.consentToEnter ? "Granted" : "Not granted"}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-parcelis-border pt-5">
                      <p className="font-semibold text-parcelis-charcoal">Description</p>
                      <p className="mt-4 whitespace-pre-wrap text-md leading-6 text-parcelis-charcoal">
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
                              <NextImage
                                alt={attachment.fileName}
                                className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                                src={attachment.imageUrl}
                                height={160}
                                unoptimized
                                width={160}
                              />
                              <span className="absolute inset-x-0 bottom-0 truncate bg-parcelis-charcoal/75 px-2 py-1 text-left text-xs font-medium text-white">
                                {attachment.fileName}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-parcelis-border bg-parcelis-porcelain/50 px-4 py-10 text-center dark:bg-parcelis-charcoal/55">
                          <Image className="h-10 w-10 text-parcelis-green" />
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
                        <LoadingState
                          className="min-h-0 justify-start py-2"
                          iconClassName="h-6 w-6"
                          label="Loading notes…"
                        />
                      ) : notesQuery.data?.length ? (
                        notesQuery.data.map((note) => (
                          <article
                            className="border-l-4 border-parcelis-green bg-parcelis-green/5 py-3 pl-4 pr-3"
                            key={note.id}
                          >
                            <div className="flex items-start justify-between gap-3">
                              {editingNoteId === note.id ? (
                                <div className="min-w-0 flex-1">
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
                                  <Button aria-label="Note actions" size="sm" type="button" variant="ghost">
                                    <EllipsisVertical className="h-4 w-4" />
                                  </Button>
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
                            <p className="mt-3 text-xs text-parcelis-gray">
                              {new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(note.createdAt))}
                            </p>
                          </article>
                        ))
                      ) : (
                        <div className="flex flex-col items-center rounded-md border border-dashed border-parcelis-border px-4 py-8 text-center">
                          <StickyNotes className="h-10 w-10 text-parcelis-green" />
                          <p className="mt-3 text-sm font-semibold text-parcelis-charcoal">No notes yet.</p>
                          <p className="mt-1 text-sm text-parcelis-gray">Add private notes that tenants cannot see.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <Card className="mt-5">
                  <CardHeader className="border-b-0 p-0">
                    <button
                      aria-controls="ticket-logging"
                      aria-expanded={isLoggingOpen}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                      onClick={() => setIsLoggingOpen((open) => !open)}
                      type="button"
                    >
                      <div>
                        <h2 className="font-semibold text-parcelis-charcoal">Logging</h2>
                        <p className="mt-1 text-sm text-parcelis-gray">Activity for this maintenance ticket.</p>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 text-parcelis-gray transition-transform ${isLoggingOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </CardHeader>
                  {isLoggingOpen ? (
                    <CardContent className="border-t border-parcelis-border p-0" id="ticket-logging">
                      {activityEventsQuery.isLoading ? (
                        <LoadingState className="min-h-32" label="Loading activity…" />
                      ) : activityEventsQuery.error ? (
                        <p className="p-5 text-sm font-medium text-red-700">
                          Unable to load activity. Please try again.
                        </p>
                      ) : activityEvents.length ? (
                        <ul className="divide-y divide-parcelis-border">
                          {activityEvents.map((event) => (
                            <li
                              className="flex flex-col gap-1 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between"
                              key={event.id}
                            >
                              <div>
                                <p className="font-semibold text-parcelis-charcoal">
                                  {label(event.action.replace("maintenance.", ""))}
                                </p>
                                {event.previousStatus && event.nextStatus ? (
                                  <p className="mt-1 text-parcelis-gray">
                                    {event.subjectLabel} · {label(event.previousStatus)} → {label(event.nextStatus)}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-parcelis-gray">{event.subjectLabel}</p>
                                )}
                                <p className="mt-1 text-xs font-semibold text-parcelis-green">
                                  {event.subjectReference ?? formatTicketNumber(ticket.ticketNumber)}
                                </p>
                              </div>
                              <time className="shrink-0 text-parcelis-gray">{formatDateTime(event.createdAt)}</time>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="m-5 flex flex-col items-center rounded-md border border-dashed border-parcelis-border px-4 py-8 text-center">
                          <WrenchOff className="h-10 w-10 text-parcelis-green" />
                          <p className="mt-3 text-sm font-semibold text-parcelis-charcoal">
                            No maintenance activity has been recorded yet.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  ) : null}
                </Card>
              </div>
            </>
          )}
        </div>
      </section>
      <Dialog onOpenChange={(open) => !open && setGalleryIndex(null)} open={galleryIndex !== null}>
        <DialogContent className="max-w-4xl p-4">
          {activeAttachment ? (
            <div className="space-y-3">
              <div className="relative h-[75vh] w-full">
                <NextImage
                  alt={activeAttachment.fileName}
                  className="rounded-md object-contain"
                  fill
                  sizes="(min-width: 1024px) 896px, 90vw"
                  src={activeAttachment.imageUrl}
                  unoptimized
                />
              </div>
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
