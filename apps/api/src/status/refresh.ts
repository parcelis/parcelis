export const statusRefreshScript = String.raw`
(() => {
  async function refresh() {
    try {
      const response = await fetch(window.location.href, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return;
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const current = document.querySelector(".status-column");
      const replacement = page.querySelector(".status-column");
      if (!current || !replacement) return;
      const open = new Set(
        [...current.querySelectorAll("details[open]")].map((details) => details.dataset.componentId),
      );
      const focused = document.activeElement?.closest("details")?.dataset.componentId;
      for (const details of replacement.querySelectorAll("details")) {
        details.open = open.has(details.dataset.componentId);
      }
      current.replaceWith(replacement);
      if (focused) {
        [...replacement.querySelectorAll("details")]
          .find((details) => details.dataset.componentId === focused)
          ?.querySelector("summary")?.focus({ preventScroll: true });
      }
    } catch {
      // Keep the last results visible while the monitor is unreachable.
    } finally {
      setTimeout(refresh, 15000);
    }
  }
  setTimeout(refresh, 15000);
})();
`;
