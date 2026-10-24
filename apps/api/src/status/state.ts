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
  if (!components.length || components.some((component) => component.status === "unknown")) return "unknown";
  if (components.some((component) => component.status === "degraded")) return "degraded";
  return "operational";
}
