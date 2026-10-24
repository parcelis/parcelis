export function createProbeDeadline(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Probe deadline exceeded.")), timeoutMs);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

export async function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return operation();
      }),
      aborted,
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort!);
  }
}

export async function withProbeDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>) {
  const deadline = createProbeDeadline(timeoutMs);
  try {
    return await abortable(() => operation(deadline.signal), deadline.signal);
  } finally {
    deadline.dispose();
  }
}
