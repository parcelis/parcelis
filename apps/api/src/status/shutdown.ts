import type { Server } from "node:http";

export async function drainStatusServer(server: Server, inFlight: Promise<void>, cleanup: () => Promise<void>) {
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  const cleaned = (async () => {
    try {
      await inFlight;
    } finally {
      await cleanup();
    }
  })();
  const results = await Promise.allSettled([closed, cleaned]);
  const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, "Status monitor shutdown failed.");
}
