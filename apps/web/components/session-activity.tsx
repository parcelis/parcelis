"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { SessionStatus } from "@parcelis/schemas";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@parcelis/ui";
import { apiClient } from "./api-client";
import { sessionChannelName, sessionExpiredEventName } from "./session-events";

type SessionMessage = { type: "status"; status: SessionStatus } | { type: "logout" };

export function SessionActivity() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [warning, setWarning] = React.useState(false);
  const [renewing, setRenewing] = React.useState(false);
  const status = React.useRef<SessionStatus | null>(null);
  const deadline = React.useRef(0);
  const nextActivityAt = React.useRef(0);
  const activityRequest = React.useRef<Promise<void> | null>(null);
  const expirationCheck = React.useRef<Promise<void> | null>(null);
  const renewRef = React.useRef<(_force: boolean) => Promise<void> | void>(() => {});
  const ended = React.useRef(false);
  const [renewalError, setRenewalError] = React.useState(false);

  React.useEffect(() => {
    const channel = new BroadcastChannel(sessionChannelName);

    function leave(reason: "timeout" | "logout") {
      if (ended.current) return;
      ended.current = true;
      void queryClient.cancelQueries();
      queryClient.clear();
      channel.postMessage({ type: "logout" } satisfies SessionMessage);
      router.replace(reason === "timeout" ? "/login?reason=timeout" : "/login");
    }

    function accept(next: SessionStatus, broadcast = false) {
      if (ended.current) return;
      status.current = next;
      deadline.current = Date.now() + next.expiresAt - next.serverTime;
      setWarning(next.idleTimeoutEnabled && deadline.current - Date.now() <= next.warningMs);
      if (broadcast) channel.postMessage({ type: "status", status: next } satisfies SessionMessage);
    }

    async function checkSession() {
      if (ended.current) return;
      try {
        accept(await apiClient.auth.session.query());
      } catch {
        // A network failure does not prove that the session expired.
      }
    }

    async function renew(force = false) {
      const current = status.current;
      if (ended.current || !current?.idleTimeoutEnabled) return;
      if (activityRequest.current) return activityRequest.current;
      if (!force && Date.now() < nextActivityAt.current) return;
      nextActivityAt.current = Date.now() + current.activityIntervalMs;
      const request = apiClient.auth.activity
        .mutate()
        .then((next) => {
          setRenewalError(false);
          accept(next, true);
        })
        .catch(() => {
          nextActivityAt.current = 0;
          if (force) setRenewalError(true);
        })
        .finally(() => {
          activityRequest.current = null;
        });
      activityRequest.current = request;
      return request;
    }
    renewRef.current = renew;

    function onActivity(event: Event) {
      if (event instanceof KeyboardEvent && (event.repeat || event.key === "Escape")) return;
      void renew();
    }

    function onSessionExpired() {
      leave("timeout");
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void checkSession();
    }

    channel.onmessage = (event: MessageEvent<SessionMessage>) => {
      if (event.data?.type === "logout") leave("logout");
      if (event.data?.type === "status") accept(event.data.status);
    };

    void checkSession();
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll", "wheel"];
    for (const event of events) document.addEventListener(event, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener(sessionExpiredEventName, onSessionExpired);

    const timer = window.setInterval(() => {
      const current = status.current;
      if (!current || ended.current) return;
      const remaining = deadline.current - Date.now();
      if (remaining <= 0 && !expirationCheck.current) {
        expirationCheck.current = checkSession()
          .then(() => {
            if (deadline.current <= Date.now()) leave("timeout");
          })
          .finally(() => {
            expirationCheck.current = null;
          });
      } else {
        setWarning(current.idleTimeoutEnabled && remaining <= current.warningMs);
      }
    }, 1000);

    return () => {
      renewRef.current = () => {};
      channel.close();
      window.clearInterval(timer);
      for (const event of events) document.removeEventListener(event, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener(sessionExpiredEventName, onSessionExpired);
    };
  }, [queryClient, router]);

  async function staySignedIn() {
    if (renewing) return;
    setRenewing(true);
    try {
      await renewRef.current(true);
    } finally {
      setRenewing(false);
    }
  }

  return (
    <AlertDialog open={warning} onOpenChange={() => {}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Your session is about to expire</AlertDialogTitle>
          <AlertDialogDescription>
            You will be signed out after 15 minutes without activity. Continue working to stay signed in.
          </AlertDialogDescription>
          {renewalError ? (
            <p className="text-sm text-red-700" role="alert">
              Unable to confirm your session. Try again.
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button className="min-w-40" disabled={renewing} onClick={() => void staySignedIn()}>
            {renewing ? "Checking…" : "Stay signed in"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
