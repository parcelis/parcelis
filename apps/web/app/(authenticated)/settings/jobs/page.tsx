"use client";

import * as React from "react";
import { sessionUserActivityEventName } from "../../../../components/session-events";

const activityEvents = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll", "wheel"];

export default function JobsPage() {
  const frame = React.useRef<HTMLIFrameElement>(null);

  function onLoad() {
    const document = frame.current?.contentDocument;
    if (!document) return;
    const onActivity = () => window.dispatchEvent(new Event(sessionUserActivityEventName));
    for (const event of activityEvents) document.addEventListener(event, onActivity, { passive: true });
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
      <iframe
        className="min-h-[calc(100svh-4rem)] w-full flex-1 border-0"
        onLoad={onLoad}
        ref={frame}
        src="/admin/jobs/?embedded=1"
        title="Job dashboard"
      />
    </main>
  );
}
