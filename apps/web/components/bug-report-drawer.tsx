"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Label,
  Textarea,
} from "@parcelis/ui";
import {
  bugReportDestination,
  bugReportInputSchema,
  bugReportImageMessage,
  bugReportImageTypes,
  bugReportMaxImages,
  sanitizeBugReportUrl,
  type BugReportInput,
} from "@parcelis/schemas";
import { version } from "../package.json";
import { apiClient } from "./api-client";
import { ImageUploadPanel } from "./image-upload-panel";

export function BugReportDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [description, setDescription] = React.useState("");
  const [pageUrl, setPageUrl] = React.useState<string>();
  const [browserVersion, setBrowserVersion] = React.useState<string>();
  const [screenshots, setScreenshots] = React.useState<File[]>([]);
  const [review, setReview] = React.useState<BugReportInput>();
  const [error, setError] = React.useState<string>();
  const [sent, setSent] = React.useState(false);
  const send = useMutation({
    mutationFn: async (input: BugReportInput) => {
      const form = new FormData();
      form.set("description", input.description);
      if (input.pageUrl) form.set("pageUrl", input.pageUrl);
      if (input.browserVersion) form.set("browserVersion", input.browserVersion);
      if (input.appVersion) form.set("appVersion", input.appVersion);
      input.screenshots.forEach((file, index) => {
        const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
        form.append("screenshots", file, `screenshot-${index + 1}.${extension}`);
      });
      return apiClient.bugReports.submit.mutate(form);
    },
    onSuccess: () => {
      setSent(true);
      setDescription("");
      setPageUrl(undefined);
      setBrowserVersion(undefined);
      setScreenshots([]);
      setReview(undefined);
    },
  });
  const previews = React.useMemo(() => screenshots.map((file) => URL.createObjectURL(file)), [screenshots]);
  React.useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (open && (review || sent)) headingRef.current?.focus();
  }, [open, review, sent]);

  function changeOpen(next: boolean) {
    if (send.isPending) return;
    onOpenChange(next);
    if (!next) {
      setReview(undefined);
      setSent(false);
      send.reset();
    }
  }

  function reviewReport() {
    const result = bugReportInputSchema.safeParse({
      description,
      pageUrl,
      browserVersion,
      appVersion: browserVersion === undefined ? undefined : version,
      screenshots,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the report details.");
      return;
    }
    setError(undefined);
    send.reset();
    setReview(result.data);
  }

  return (
    <Drawer open={open} onOpenChange={changeOpen}>
      <DrawerContent aria-labelledby="bug-report-title" size="md">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={send.isPending} />
          <DrawerTitle id="bug-report-title">
            {sent ? "Report sent" : review ? "Review your report" : "Report a problem"}
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
          <h3 className="sr-only" ref={headingRef} tabIndex={-1}>
            {sent ? "Report sent" : review ? "Review your report" : "Report details"}
          </h3>
          {sent ? (
            <div role="status" className="space-y-3">
              <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-parcelis-green" />
              <p>Your report was sent to {bugReportDestination}.</p>
              <p className="text-sm text-parcelis-gray">
                Parcelis maintainers will review it privately. Thank you for reporting the problem.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm">
                This report will be emailed privately to <strong>{bugReportDestination}</strong>, including from
                self-hosted installations.
              </p>
              <p className="text-sm text-parcelis-gray">
                Remove private information from your description and screenshots. Maintainers review reports outside the
                app and remove sensitive information before manually creating any public GitHub issue.
              </p>
              {review ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Description</h3>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{review.description}</p>
                  </div>
                  {review.pageUrl ? (
                    <div>
                      <h3 className="text-sm font-semibold">Page</h3>
                      <p className="break-all text-sm">{review.pageUrl}</p>
                    </div>
                  ) : null}
                  {review.browserVersion ? (
                    <div>
                      <h3 className="text-sm font-semibold">Browser / app version</h3>
                      <p className="break-words text-sm">{review.browserVersion}</p>
                      <p className="text-sm">Parcelis {review.appVersion}</p>
                    </div>
                  ) : null}
                  <p className="text-sm text-parcelis-gray">
                    Only the details shown here and the selected screenshots will be included. No logs, cookies, tokens,
                    form contents, or tenant/property records are collected automatically.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="bug-description">Description (required)</Label>
                    <Textarea
                      id="bug-description"
                      maxLength={10000}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="What happened, and what did you expect?"
                      rows={6}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor="bug-page">
                      <Checkbox
                        id="bug-page"
                        checked={pageUrl !== undefined}
                        onCheckedChange={(checked) =>
                          setPageUrl(checked === true ? sanitizeBugReportUrl(window.location.href) : undefined)
                        }
                      />
                      Include page URL
                    </label>
                    {pageUrl !== undefined ? <p className="break-all text-sm text-parcelis-gray">{pageUrl}</p> : null}
                    <p className="text-xs text-parcelis-gray">
                      Query parameters and fragments are removed. Review the remaining path for private information.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor="bug-browser">
                      <Checkbox
                        id="bug-browser"
                        checked={browserVersion !== undefined}
                        onCheckedChange={(checked) =>
                          setBrowserVersion(checked === true ? navigator.userAgent : undefined)
                        }
                      />
                      Include browser / app version
                    </label>
                    {browserVersion !== undefined ? (
                      <>
                        <p className="break-words text-sm text-parcelis-gray">{browserVersion}</p>
                        <p className="text-sm text-parcelis-gray">Parcelis {version}</p>
                      </>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bug-screenshots">Screenshots (optional)</Label>
                    <ImageUploadPanel
                      multiple
                      inputId="bug-screenshots"
                      acceptedImageTypes={bugReportImageTypes}
                      acceptedImageDescription={bugReportImageMessage}
                      buttonLabel={
                        screenshots.length >= bugReportMaxImages
                          ? "Screenshot limit reached"
                          : screenshots.length
                            ? "Add more screenshots"
                            : "Add screenshots"
                      }
                      disabled={screenshots.length >= bugReportMaxImages}
                      onImagesChange={(selected) => {
                        const result = bugReportInputSchema.shape.screenshots.safeParse([...screenshots, ...selected]);
                        if (!result.success) {
                          setError(result.error.issues[0]?.message ?? bugReportImageMessage);
                          return;
                        }
                        setError(undefined);
                        setScreenshots(result.data);
                      }}
                    />
                  </div>
                </>
              )}
              {screenshots.length ? (
                <ul className="space-y-3" aria-label="Selected screenshots">
                  {screenshots.map((file, index) => (
                    <li
                      className="space-y-2 rounded-md border border-parcelis-border p-3"
                      key={`${file.name}-${index}`}
                    >
                      {/* Object URLs stay local until the user sends the report. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previews[index]}
                        alt={`Screenshot ${index + 1} preview`}
                        className="max-h-48 max-w-full rounded object-contain"
                      />
                      <p className="break-all text-xs">
                        Screenshot {index + 1} · {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      {!review ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setScreenshots((current) => current.filter((_, i) => i !== index))}
                        >
                          Remove screenshot {index + 1}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {error || send.error ? (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                  {error ?? send.error?.message}
                </p>
              ) : null}
            </>
          )}
        </div>
        <DrawerFooter className="flex flex-wrap items-center justify-between gap-3">
          {sent ? (
            <Button className="ml-auto min-w-40" onClick={() => changeOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                className="min-w-40"
                variant="secondary"
                disabled={send.isPending}
                onClick={() => (review ? (setReview(undefined), send.reset()) : changeOpen(false))}
              >
                {review ? "Back" : "Cancel"}
              </Button>
              <Button
                className="ml-auto min-w-40"
                disabled={send.isPending || !description.trim()}
                onClick={() => (review ? send.mutate(review) : reviewReport())}
              >
                {send.isPending ? "Sending…" : review ? "Send report" : "Next"}
                {!review ? <ChevronRight aria-hidden="true" className="h-4 w-4" /> : null}
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
