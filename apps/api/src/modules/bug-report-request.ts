const maxRequestBytes = 16 * 1024 * 1024;

// Bound multipart parsing even when the API is accessed without the bundled proxy.
export async function limitBugReportRequest(request: Request): Promise<Request | Response> {
  const multipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data");
  if ((!multipart && new URL(request.url).pathname !== "/trpc/bugReports.submit") || !request.body) return request;
  const origin = request.headers.get("origin");
  const webOrigin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`;
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
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxRequestBytes) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks),
    signal: request.signal,
  });
}
