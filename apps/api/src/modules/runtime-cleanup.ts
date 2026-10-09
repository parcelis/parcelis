const runtimeGlobal = globalThis as typeof globalThis & {
  parcelisApiCleanup?: Set<() => Promise<void>>;
};

export function registerApiCleanup(cleanup: () => Promise<void>) {
  runtimeGlobal.parcelisApiCleanup ??= new Set();
  runtimeGlobal.parcelisApiCleanup.add(cleanup);
}

export async function runApiCleanup() {
  const callbacks = runtimeGlobal.parcelisApiCleanup;
  delete runtimeGlobal.parcelisApiCleanup;
  const results = await Promise.allSettled(Array.from(callbacks ?? [], (cleanup) => Promise.resolve().then(cleanup)));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "API cleanup failed.",
    );
}
