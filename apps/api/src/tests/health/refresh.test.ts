import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderStatusPage } from "../../status/page";
import { statusRefreshScript } from "../../status/refresh";
import { deferred } from "./deferred";

function createDetails(componentId: string, open = false) {
  let focused = false;
  return {
    dataset: { componentId },
    open,
    querySelector: () => ({
      focus: () => {
        focused = true;
      },
    }),
    get focused() {
      return focused;
    },
  };
}

function setup(
  fetchPage: () => Promise<{ ok: boolean; text: () => Promise<string> }>,
  focus: "details" | "feed" | "outside" = "details",
) {
  const currentDetails = [createDetails("workers", true), createDetails("storage")];
  const replacementDetails = [createDetails("storage"), createDetails("workers")];
  let replaced = false;
  let feedFocused = false;
  const currentFeed = { closest: () => null };
  const replacementFeed = {
    focus: (options: { preventScroll: boolean }) => {
      assert.equal(options.preventScroll, true);
      feedFocused = true;
    },
  };
  const replacement = {
    querySelectorAll: () => replacementDetails,
    querySelector: () => replacementFeed,
  };
  const current = {
    querySelectorAll: () => currentDetails.filter((details) => details.open),
    querySelector: () => currentFeed,
    replaceWith: (value: unknown) => {
      assert.equal(value, replacement);
      replaced = true;
    },
  };
  const timers: { callback: () => Promise<void>; delay: number }[] = [];
  runInNewContext(statusRefreshScript, {
    fetch: fetchPage,
    window: { location: { href: "http://localhost/status?theme=dark" } },
    document: {
      querySelector: () => current,
      activeElement:
        focus === "feed" ? currentFeed : { closest: () => (focus === "details" ? currentDetails[0] : null) },
    },
    DOMParser: class {
      parseFromString() {
        return { querySelector: () => replacement };
      }
    },
    AbortSignal,
    setTimeout: (callback: () => Promise<void>, delay: number) => timers.push({ callback, delay }),
  });
  return {
    currentDetails,
    replacementDetails,
    timers,
    get feedFocused() {
      return feedFocused;
    },
    get replaced() {
      return replaced;
    },
  };
}

test("service refresh preserves detail state by component identity and restores focus", async () => {
  const response = deferred<{ ok: boolean; text: () => Promise<string> }>();
  const page = setup(() => response.promise);
  assert.equal(page.timers[0]!.delay, 15000);
  const refresh = page.timers.shift()!.callback();
  assert.equal(page.timers.length, 0);
  page.currentDetails[1]!.open = true;
  response.resolve({ ok: true, text: async () => "updated services" });
  await refresh;
  assert.equal(page.replaced, true);
  assert.ok(page.replacementDetails.every((details) => details.open));
  assert.equal(page.replacementDetails[1]!.focused, true);
  assert.equal(page.timers.length, 1);
  assert.equal(page.timers[0]!.delay, 15000);
});

test("service refresh restores feed link focus without taking focus from outside the column", async () => {
  for (const focus of ["feed", "outside"] as const) {
    const page = setup(async () => ({ ok: true, text: async () => "updated services" }), focus);
    await page.timers.shift()!.callback();
    assert.equal(page.replaced, true);
    assert.equal(page.feedFocused, focus === "feed");
    assert.ok(page.replacementDetails.every((details) => !details.focused));
  }
});

test("failed refresh leaves existing results and schedules a retry", async () => {
  for (const fetchPage of [
    async () => {
      throw new Error("Monitor offline");
    },
    async () => ({ ok: false, text: async () => "unavailable" }),
  ]) {
    const page = setup(fetchPage);
    await page.timers.shift()!.callback();
    assert.equal(page.replaced, false);
    assert.equal(page.currentDetails[0]!.open, true);
    assert.equal(page.timers.length, 1);
  }
});

test("status page loads an external refresher instead of navigating on a timer", () => {
  const page = renderStatusPage("operational", [
    {
      id: 'workers"&',
      name: "Workers",
      status: "operational",
      latencyMs: 1,
      checkedAt: new Date().toISOString(),
      failures: 0,
      history: [],
      checks: [
        {
          id: "processing",
          name: "Processing",
          status: "operational",
          latencyMs: 1,
          checkedAt: new Date().toISOString(),
        },
      ],
    },
  ]);
  assert.ok(page.includes('<script src="/status/refresh.js" defer></script>'));
  assert.ok(!page.includes('http-equiv="refresh"'));
  assert.ok(page.includes('data-component-id="workers&quot;&amp;"'));
});
