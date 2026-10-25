import type { CheckStatus } from "../modules/service-checks";
import type { Component } from "./state";
import { statusThemes, type StatusTheme } from "./theme";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

const statusLabels: Record<CheckStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Unavailable",
  unknown: "Unknown",
};
const statusHeadings: Record<CheckStatus, string> = {
  operational: "All systems operational",
  degraded: "Some systems are experiencing issues",
  down: "Some systems are unavailable",
  unknown: "Some service checks have an unknown status",
};
const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(new Date(value));

const darkTheme = `
  color-scheme: dark;
  --page: #071b2f; --text: #edf3f0; --muted: #b0bfcb; --soft: #91a4b5;
  --surface: rgb(17 37 53 / .98); --surface-alt: #142c3f; --border: #294253; --line: #213c4e;
  --overlay-start: rgb(4 18 32 / .8); --overlay-middle: rgb(4 18 32 / .55); --overlay-end: rgb(4 18 32 / .3);
  --background-image: url('/status/brand/parcelis-dark-background.svg'); --light-logo: none; --dark-logo: block;
  --green-bg: #173f31; --green-text: #a9e0bf; --green-border: #2c654c;
  --amber-bg: #493b1d; --amber-text: #f4d17a; --amber-border: #705b28;
  --red-bg: #49272f; --red-text: #ffb6bf; --red-border: #71404a;
  --unknown-bg: #22394a; --unknown-text: #b4c6d5;
  --tick-green: #51b98c; --tick-unknown: #91a0ad; --tick-empty: #263d4e;
  --link: #afd4ef; --live-bg: rgb(17 37 53 / .7); --live-text: #b9db9b; --selected: #294457;
  --shadow: 0 24px 64px -24px rgb(0 0 0 / .65), 0 2px 10px rgb(0 0 0 / .12);
`;

const themeIcons: Record<StatusTheme, string> = {
  light:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  dark: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  system: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8m-4-4v4"/>',
};

export function renderStatusPage(status: CheckStatus, components: Component[], theme: StatusTheme = "system") {
  const themeSelector = `<nav class="theme-selector" aria-label="Color theme">${statusThemes
    .map(
      (mode) =>
        `<a class="theme-choice" href="?theme=${mode}"${mode === theme ? ' aria-current="true"' : ""} aria-label="${mode[0]!.toUpperCase() + mode.slice(1)} theme" title="${mode[0]!.toUpperCase() + mode.slice(1)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${themeIcons[mode]}</svg></a>`,
    )
    .join("")}</nav>`;
  const latestCheck = components
    .map((component) => component.checkedAt)
    .sort()
    .at(-1);
  const rows = components
    .map((component) => {
      const samples = component.history;
      const recent = samples.slice(-90);
      const measured = samples.filter((sample) => sample.status !== "unknown");
      const uptime = measured.length
        ? `${((100 * measured.filter((sample) => sample.status === "operational").length) / measured.length).toFixed(2)}%`
        : "—";
      const placeholders = '<span class="tick unrecorded" title="No recorded check"></span>'.repeat(90 - recent.length);
      const ticks = recent
        .map(
          (sample) =>
            `<span class="tick ${sample.status}" title="${escapeHtml(formatTime(sample.at))} · ${statusLabels[sample.status]}"></span>`,
        )
        .join("");
      const details = component.checks?.length
        ? `<details class="check-details" data-component-id="${escapeHtml(component.id)}"><summary>Check details</summary><div class="check-list">${component.checks
            .map(
              (check) =>
                `<div class="check-item"><div class="row"><span>${escapeHtml(check.name)}</span><span class="badge ${check.status}">${statusLabels[check.status]}</span></div>${check.note ? `<p>${escapeHtml(check.note)}</p>` : ""}</div>`,
            )
            .join("")}</div></details>`
        : "";
      return `<article class="service">
        <div class="row service-heading"><div class="service-name"><h2>${escapeHtml(component.name)}</h2><span class="badge ${component.status}">${statusLabels[component.status]}</span></div><span class="uptime" title="Operational samples among checks with a known status">${uptime}</span></div>
        <div class="history" role="img" aria-label="${escapeHtml(component.name)}: ${recent.length} recent recorded checks, oldest to newest">${placeholders}${ticks}</div>
        <div class="row scale"><span>Earlier checks</span><span title="Last checked ${escapeHtml(component.checkedAt)}">${component.latencyMs} ms · Latest check</span></div>
        ${details}
      </article>`;
    })
    .join("");
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/status/refresh.js" defer></script><title>Parcelis status</title><style>
    :root {
      color-scheme: light;
      --page: #f3f1ec; --text: #14202b; --muted: #53617a; --soft: #65738a;
      --surface: rgb(255 255 255 / .98); --surface-alt: #fafbf9; --border: #e4e4e7; --line: #ededf0;
      --overlay-start: rgb(255 255 255 / .96); --overlay-middle: rgb(255 255 255 / .92); --overlay-end: rgb(255 255 255 / .86);
      --background-image: url('/status/brand/parcelis-light-background.svg'); --light-logo: block; --dark-logo: none;
      --green-bg: #dbf4e7; --green-text: #12643d; --green-border: #c4e8d5;
      --amber-bg: #fff0c7; --amber-text: #7a5200; --amber-border: #f1dda2;
      --red-bg: #ffe1e1; --red-text: #9c2424; --red-border: #f4c3c3;
      --unknown-bg: #e7ebf0; --unknown-text: #53617a;
      --tick-green: #269467; --tick-unknown: #a1a1aa; --tick-empty: #e7ebf0;
      --link: #305f9c; --live-bg: rgb(255 255 255 / .7); --live-text: #426b2b; --selected: #fff;
      --shadow: 0 24px 64px -24px rgb(20 32 43 / .24), 0 2px 10px rgb(20 32 43 / .04);
    }
    :root[data-theme="dark"] { ${darkTheme} }
    @media (prefers-color-scheme: dark) { :root[data-theme="system"] { ${darkTheme} } }
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: var(--text); background: var(--page); font-synthesis: none; -webkit-font-smoothing: antialiased; }
    * { box-sizing: border-box; }
    body { margin: 0; display: flex; flex-direction: column; gap: 16px; }
    .theme-toolbar { position: relative; display: flex; justify-content: flex-end; padding: 20px 32px 8px; }
    .backdrop { position: fixed; inset: 0; pointer-events: none; background: linear-gradient(90deg, var(--overlay-start), var(--overlay-middle) 50%, var(--overlay-end)), var(--background-image) center / cover no-repeat; }
    main { position: relative; display: flex; align-items: flex-start; gap: clamp(48px, 7vw, 112px); width: 100%; max-width: 1440px; margin: 0 auto 48px; padding: 0 40px; }
    .brand-column { position: sticky; top: 64px; display: flex; flex-direction: column; align-items: center; gap: 64px; flex: .9 1 0; min-width: 0; }
    .status-column { display: flex; flex-direction: column; flex: 1.6 1 0; min-width: 0; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .page-header { display: flex; flex-direction: column; align-items: flex-end; width: 100%; max-width: 600px; }
    .full-logo { width: 100%; height: auto; }
    .logo-light { display: var(--light-logo); }
    .logo-dark { display: var(--dark-logo); }
    .theme-selector { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 9px; background: var(--live-bg); }
    .theme-choice { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 5px; color: var(--muted); text-decoration: none; }
    .theme-choice[aria-current="true"] { color: var(--text); background: var(--selected); box-shadow: 0 1px 3px rgb(0 0 0 / .1); }
    .theme-choice:hover { color: var(--text); background: var(--selected); }
    .page-intro { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 32px; }
    .page-title { display: flex; justify-content: flex-end; flex-wrap: wrap; column-gap: .22em; font-size: clamp(1.5rem, 2.8vw, 2.5rem); line-height: 1.1; font-weight: 600; letter-spacing: -.045em; margin: 0; }
    .page-title span { color: #6fa640; }
    .page-description { min-width: 0; font-size: clamp(14px, 1.6vw, 22px); color: var(--muted); line-height: 1.5; text-align: center; margin: 0; }
    .live { align-self: center; flex-shrink: 0; display: flex; align-items: center; gap: 8px; border: 1px solid rgb(111 166 64 / .25); border-radius: 24px; padding: 8px 16px; color: var(--live-text); background: var(--live-bg); font-size: 16px; }
    .live .dot { width: 8px; height: 8px; background: #6fa640; }
    .status-card { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; box-shadow: var(--shadow); }
    .summary { display: flex; align-items: flex-start; gap: 12px; border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; background: var(--surface); margin: 20px; }
    .dot { flex-shrink: 0; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--tick-unknown); }
    .summary > .dot { margin-top: 6px; }
    .summary.operational { background: var(--green-bg); border-color: var(--green-border); color: var(--green-text); }
    .summary.degraded { background: var(--amber-bg); border-color: var(--amber-border); color: var(--amber-text); }
    .summary.down { background: var(--red-bg); border-color: var(--red-border); color: var(--red-text); }
    .summary.unknown { background: var(--unknown-bg); color: var(--unknown-text); }
    .summary.operational > .dot { background: var(--tick-green); box-shadow: 0 0 0 3px #26946712; }
    .summary.degraded > .dot { background: #d69a21; }
    .summary.down > .dot { background: #dc5050; }
    .summary h2 { margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; letter-spacing: -.015em; }
    .summary p { color: inherit; opacity: .75; margin: 4px 0 0; font-size: 13px; line-height: 20px; }
    .services { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
    .table-heading { padding: 12px 24px; background: var(--surface-alt); border-bottom: 1px solid var(--line); color: var(--soft); font-size: 12px; }
    .service { padding: 18px 24px 16px; }
    .service + .service { border-top: 1px solid var(--line); }
    .service-name { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; min-width: 0; }
    h2 { font-size: 13px; font-weight: 500; line-height: 20px; margin: 0; }
    .badge { display: inline-flex; align-items: center; font-size: 11px; line-height: 17px; font-weight: 500; padding: 0 7px; border-radius: 6px; border: 1px solid transparent; white-space: nowrap; background: var(--green-bg); color: var(--green-text); }
    .badge.degraded { background: var(--amber-bg); border-color: var(--amber-border); color: var(--amber-text); }
    .badge.down { background: var(--red-bg); border-color: var(--red-border); color: var(--red-text); }
    .badge.unknown { background: var(--surface); border-color: var(--border); color: var(--soft); }
    .uptime { flex-shrink: 0; color: var(--soft); font-size: 12px; font-variant-numeric: tabular-nums; }
    .history { display: flex; gap: 2px; height: 19px; margin: 12px 0 6px; }
    .tick { flex: 1 1 0; min-width: 0; border-radius: 3px; background: var(--tick-green); }
    .tick.degraded { background: #dfaa27; }
    .tick.down { background: #d65d5d; }
    .tick.unknown { background: var(--tick-unknown); }
    .tick.unrecorded { background: var(--tick-empty); }
    .scale { color: var(--soft); font-size: 11px; line-height: 16px; }
    .check-details { margin-top: 10px; font-size: 12px; color: var(--soft); }
    .check-details summary { cursor: pointer; width: fit-content; }
    .check-details summary:focus-visible { outline: 2px solid var(--link); outline-offset: 4px; }
    .check-list { margin-top: 10px; padding: 0 12px; border-left: 2px solid var(--border); }
    .check-item { padding: 6px 0; }
    .check-item p { font-size: 11px; line-height: 17px; margin: 4px 0 0; color: var(--soft); }
    .updates { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 0 2px; margin-top: 22px; }
    .updates h2 { font-weight: 500; }
    .updates p { font-size: 12px; line-height: 19px; color: var(--soft); margin: 2px 0 0; }
    a { color: var(--link); text-decoration-color: #d4d4d8; text-underline-offset: 4px; }
    a:hover { color: var(--text); text-decoration-color: var(--text); }
    a:focus-visible { outline: 2px solid var(--link); outline-offset: 5px; border-radius: 2px; }
    .feed-link { flex-shrink: 0; font-size: 12px; font-weight: 500; }
    footer { padding: 18px 2px 0; color: var(--soft); font-size: 11px; line-height: 18px; }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 10px; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .legend .tick { flex: none; width: 6px; height: 10px; border-radius: 2px; }
    footer p { margin: 0; }
    @media (max-width: 960px) {
      main { flex-direction: column; gap: 28px; max-width: 860px; padding: 0 24px; margin: 0 auto 32px; }
      .brand-column { position: static; flex: none; width: 100%; padding-top: 0; }
      .status-column { flex: none; width: 100%; }
      .brand-column { gap: 40px; }
      .page-header { max-width: 480px; }
      .page-intro { gap: 24px; }
      .page-title { font-size: 32px; }
      .page-title span { display: inline; }
      .page-description { font-size: 16px; }
    }
    @media (max-width: 520px) {
      main { margin: 0 auto 24px; padding: 0 16px; }
      .brand-column { gap: 24px; }
      .page-intro { gap: 20px; }
      .page-description { font-size: 14px; }
      .live { font-size: 14px; }
      .page-title { font-size: clamp(24px, 6vw, 32px); line-height: 1.1; }
      .summary { padding: 16px; margin: 12px; }
      .table-heading { padding: 12px 16px; }
      .service { padding: 16px; }
      .history { gap: 1px; }
      .service-heading { align-items: flex-start; }
      .updates { align-items: flex-start; flex-direction: column; gap: 10px; }
    }
    </style></head><body><div class="backdrop" aria-hidden="true"></div><header class="theme-toolbar">${themeSelector}</header><main>
      <section class="brand-column" aria-label="Parcelis system status"><header class="page-header"><img class="full-logo logo-light" src="/status/brand/parcelis-fullmark-light.svg" alt="Parcelis"><img class="full-logo logo-dark" src="/status/brand/parcelis-fullmark-dark.svg" alt="Parcelis"><h1 class="page-title">System <span>status</span></h1></header>
      <div class="page-intro"><p class="page-description">Availability across the Parcelis platform.</p><span class="live"><span class="dot" aria-hidden="true"></span>Live monitoring</span></div></section>
      <div class="status-column"><div class="status-card"><section class="summary ${status}" aria-label="Overall service health"><span class="dot" aria-hidden="true"></span><div><h2>${statusHeadings[status]}</h2><p>${latestCheck ? `Last checked ${escapeHtml(formatTime(latestCheck))}` : "Initial service checks are running…"}</p></div></section>
      <section class="services" aria-label="Service status"><div class="row table-heading"><span>Service</span><span>Session uptime</span></div>${rows || '<p class="service">Waiting for the first check results.</p>'}</section></div>
      <aside class="updates"><div><h2>Stay up to date</h2><p>Live service health, refreshed every 15 seconds.</p></div><a class="feed-link" href="/status/api/status">View status feed ↗</a></aside>
      <footer><div class="legend"><span><i class="tick operational"></i>Operational</span><span><i class="tick degraded"></i>Degraded</span><span><i class="tick down"></i>Unavailable</span><span><i class="tick unrecorded"></i>No history</span></div><p>Each tick represents a recorded check. Showing up to 90 recent checks.<br>Session uptime excludes unknown samples and covers up to 24 hours. History resets when the monitor restarts.</p></footer></div>
    </main></body></html>`;
}
