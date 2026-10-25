import { checkDependencies, type ServiceCheck } from "./service-checks";

export const readinessTtlMs = 2_000;

export function createReadinessCheck(probe: () => Promise<Pick<ServiceCheck, "status">[]> = checkDependencies) {
  let cached: { ready: boolean; expiresAt: number } | undefined;
  let pending: Promise<boolean> | undefined;
  return function checkReadiness(): Promise<boolean> {
    if (pending) return pending;
    if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.ready);
    pending = Promise.resolve()
      .then(probe)
      .then((checks) => checks.every((check) => check.status === "operational"))
      .catch(() => false)
      .then((ready) => {
        cached = { ready, expiresAt: Date.now() + readinessTtlMs };
        return ready;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
