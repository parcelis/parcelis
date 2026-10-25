import type { CheckStatus, ServiceCheck } from "../modules/service-checks";

export type Component = ServiceCheck & {
  failures: number;
  history: { at: string; status: CheckStatus }[];
};

export function updateComponent(previous: Component | undefined, check: ServiceCheck): Component {
  const previousFailures = previous?.failures ?? 0;
  const failures = check.status === "operational" ? 0 : previousFailures + (check.status === "down" ? 1 : 0);
  const status = check.status === "down" && failures < 3 ? "degraded" : check.status;
  return {
    ...check,
    status,
    failures,
    history: [...(previous?.history ?? []), { at: check.checkedAt, status }]
      .filter((sample) => Date.parse(sample.at) >= Date.parse(check.checkedAt) - 86_400_000)
      .slice(-2880),
  };
}

export function visibleComponent(component: Component, now = Date.now()) {
  const stale = now - Date.parse(component.checkedAt) > 90_000;
  return {
    ...component,
    status: stale ? ("unknown" as const) : component.status,
    ...(component.checks
      ? {
          checks: component.checks.map((check) => ({
            ...check,
            status: stale ? ("unknown" as const) : check.status,
          })),
        }
      : {}),
  };
}

export function overallStatus(components: { status: CheckStatus }[]): CheckStatus {
  if (components.some((component) => component.status === "down")) return "down";
  if (components.some((component) => component.status === "degraded")) return "degraded";
  if (!components.length || components.some((component) => component.status === "unknown")) return "unknown";
  return "operational";
}

export type StatusTransition = {
  component: string;
  check?: string;
  status: CheckStatus;
  previous: CheckStatus;
  at: string;
};

export function applyCheckResults(components: Map<string, Component>, checks: ServiceCheck[]): StatusTransition[] {
  const alerts: StatusTransition[] = [];
  for (const check of checks) {
    const previous = components.get(check.id);
    const next = updateComponent(previous, check);
    components.set(check.id, next);
    const previousChecks = new Map(
      [previous, ...(previous?.checks ?? [])].filter((item) => item !== undefined).map((item) => [item.id, item]),
    );
    for (const current of [next, ...(next.checks ?? [])]) {
      const before = previousChecks.get(current.id);
      if (!before || before.status === current.status) continue;
      alerts.push({
        component: next.name,
        ...(current === next ? {} : { check: current.name }),
        status: current.status,
        previous: before.status,
        at: current.checkedAt,
      });
    }
  }
  return alerts;
}
