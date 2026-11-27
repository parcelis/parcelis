const storageKeyPrefix = "parcelis-demo-ready-account:";

function getDemoReadyState(accountId: number) {
  try {
    return window.localStorage.getItem(`${storageKeyPrefix}${accountId}`);
  } catch {
    return null;
  }
}

function setDemoReadyState(accountId: number, state: "pending" | "shown" | "dismissed") {
  try {
    window.localStorage.setItem(`${storageKeyPrefix}${accountId}`, state);
  } catch {
    return;
  }
}

export function markDemoReadyPending(accountId: number) {
  setDemoReadyState(accountId, "pending");
}

export function hasPendingDemoReady() {
  try {
    const storage = window.localStorage;
    return Object.keys(storage).some((key) => key.startsWith(storageKeyPrefix) && storage.getItem(key) === "pending");
  } catch {
    return false;
  }
}

export function showPendingDemoReady(accountId: number) {
  if (getDemoReadyState(accountId) !== "pending") return false;
  setDemoReadyState(accountId, "shown");
  return true;
}

export function canViewDemoReady(accountId: number) {
  return getDemoReadyState(accountId) === "shown";
}

export function dismissDemoReady(accountId: number) {
  setDemoReadyState(accountId, "dismissed");
}
