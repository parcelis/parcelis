const runtimeGlobal = globalThis as typeof globalThis & {
  parcelisApiCleanup?: Set<() => Promise<void>>;
};

export function registerApiCleanup(cleanup: () => Promise<void>) {
  runtimeGlobal.parcelisApiCleanup ??= new Set();
  runtimeGlobal.parcelisApiCleanup.add(cleanup);
}
