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
import { sessionChannelName, sessionExpiredEventName, sessionUserActivityEventName } from "./session-events";

type SessionMessage = { type: "status"; status: SessionStatus } | { type: "logout" };
type SessionCheckResult = "valid" | "unauthorized" | "failed";

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
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(sessionChannelName);
    let warningTimer: number | undefined;
    let expirationTimer: number | undefined;

    function clearTimers() {
      window.clearTimeout(warningTimer);
      window.clearTimeout(expirationTimer);
    }

    function leave(reason: "timeout" | "logout") {
      if (ended.current) return;
      ended.current = true;
      void queryClient.cancelQueries();
      queryClient.clear();
      channel?.postMessage({ type: "logout" } satisfies SessionMessage);
      router.replace(reason === "timeout" ? "/login?reason=timeout" : "/login");
    }

    function accept(next: SessionStatus, broadcast = false) {
      if (ended.current || (status.current && next.serverTime < status.current.serverTime)) return;
      status.current = next;
      deadline.current = Date.now() + next.expiresAt - next.serverTime;
      clearTimers();
      const remaining = deadline.current - Date.now();
      setWarning(next.idleTimeoutEnabled && remaining <= next.warningMs);
      if (next.idleTimeoutEnabled && remaining > next.warningMs) {
        warningTimer = window.setTimeout(() => setWarning(true), remaining - next.warningMs);
      }
      expirationTimer = window.setTimeout(() => void checkExpiration(), Math.max(0, remaining));
      if (broadcast) channel?.postMessage({ type: "status", status: next } satisfies SessionMessage);
    }

    async function checkSession(): Promise<SessionCheckResult> {
      if (ended.current) return "failed";
      try {
        accept(await apiClient.auth.session.query());
        return "valid";
      } catch (error) {
        if (
          error instanceof Error &&
          "data" in error &&
          typeof error.data === "object" &&
          error.data !== null &&
          "code" in error.data &&
          error.data.code === "UNAUTHORIZED"
        ) {
          return "unauthorized";
        }
        return "failed";
      }
    }

    async function checkExpiration() {
      if (ended.current || expirationCheck.current) return;
      expirationCheck.current = checkSession()
        .then((result) => {
          if (ended.current) return;
          if (result === "failed") {
            if (deadline.current <= Date.now()) {
              expirationTimer = window.setTimeout(() => void checkExpiration(), 10_000);
            }
            return;
          }
          if (result === "unauthorized" || deadline.current <= Date.now()) leave("timeout");
        })
        .finally(() => {
          expirationCheck.current = null;
        });
      await expirationCheck.current;
    }

    async function renew(force = false) {
      const current = status.current;
      if (ended.current || !current?.idleTimeoutEnabled) return;
      if (!force && deadline.current - Date.now() <= current.warningMs) return;
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

    if (channel) {
      channel.onmessage = (event: MessageEvent<SessionMessage>) => {
        if (event.data?.type === "logout") leave("logout");
        if (event.data?.type === "status") accept(event.data.status);
      };
    }

    void checkSession();
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll", "wheel"];
    for (const event of events) document.addEventListener(event, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener(sessionExpiredEventName, onSessionExpired);
    window.addEventListener(sessionUserActivityEventName, onActivity);

    const sessionRefresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkSession();
    }, 60_000);

    return () => {
      renewRef.current = () => {};
      channel?.close();
      clearTimers();
      window.clearInterval(sessionRefresh);
      for (const event of events) document.removeEventListener(event, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener(sessionExpiredEventName, onSessionExpired);
      window.removeEventListener(sessionUserActivityEventName, onActivity);
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
      <AlertDialogContent aria-label="Your session is about to expire">
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
