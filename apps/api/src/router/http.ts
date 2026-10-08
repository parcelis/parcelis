export function applyApiHeaders(request: Request, response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  const webOrigin = new URL(process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`).origin;
  response.headers.append("Vary", "Origin");
  if (request.headers.get("origin") === webOrigin) {
    response.headers.set("Access-Control-Allow-Origin", webOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}

export function handlePreflight(request: Request) {
  const response = applyApiHeaders(request, new Response(null, { status: 204 }));
  response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE");
  const requestedHeaders = request.headers.get("access-control-request-headers");
  if (requestedHeaders) response.headers.set("Access-Control-Allow-Headers", requestedHeaders);
  response.headers.append("Vary", "Access-Control-Request-Headers");
  return response;
}
