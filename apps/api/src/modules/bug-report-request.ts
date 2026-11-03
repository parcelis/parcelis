import { TRPCError } from "@trpc/server";
import { getWebOrigin } from "../router/http";

const maxRequestBytes = 16 * 1024 * 1024;

// Bound multipart parsing even when the API is accessed without the bundled proxy.
export async function limitBugReportRequest(request: Request): Promise<Request | Response> {
  if (new URL(request.url).pathname !== "/trpc/bugReports.submit" || !request.body) return request;
  const origin = request.headers.get("origin");
  const webOrigin = getWebOrigin();
  if (origin && origin !== webOrigin && origin !== new URL(request.url).origin) {
    return Response.json({ error: { message: "Submit reports from the Parcelis app." } }, { status: 403 });
  }
  const tooLarge = () =>
    Response.json(
      { error: { message: "The report is too large. Use up to three images, no larger than 5 MB each." } },
      { status: 413 },
    );
  if (Number(request.headers.get("content-length")) > maxRequestBytes) return tooLarge();
  const reader = request.body.getReader();
  let size = 0;
  // tRPC checks authentication and rate limits before its input parser reads this stream.
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        size += value.byteLength;
        if (size > maxRequestBytes) {
          controller.error(new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "The report is too large." }));
          await reader.cancel();
          return;
        }
        controller.enqueue(value);
      },
      cancel: (reason) => reader.cancel(reason),
    },
    { highWaterMark: 0 },
  );
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
