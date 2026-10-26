import { checkHttp, groupChecks, runCheck, type ServiceCheck } from "./service-checks";

export async function checkApplicationServices(webUrl: string, apiUrl: string, docsUrl: string) {
  const webOrigin = new URL(webUrl).origin;
  const apiOrigin = new URL(apiUrl).origin;
  const email = process.env.STATUS_AUTH_EMAIL;
  const password = process.env.STATUS_AUTH_PASSWORD;
  let cookie: string | undefined;
  const signIn = await runCheck("signin", "Sign-in flow", async () => {
    const signal = AbortSignal.timeout(4_500);
    const csrf = await fetch(`${webOrigin}/api/auth/csrf`, { signal, redirect: "error" });
    const body = await csrf.json();
    if (!csrf.ok || typeof body.csrfToken !== "string" || !body.csrfToken) throw new Error("CSRF unavailable");
    if (!email || !password) return "unknown";
    const login = await fetch(`${webOrigin}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: csrf.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      },
      body: new URLSearchParams({ csrfToken: body.csrfToken, email, password, json: "true", callbackUrl: webOrigin }),
    });
    cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .filter((value) => /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?=.+$/.test(value))
      .join("; ");
    await login.body?.cancel();
    if (!cookie) throw new Error("Sign-in failed");
    const session = await fetch(`${webOrigin}/api/auth/session`, { headers: { cookie }, signal, redirect: "error" });
    const account = await session.json();
    if (!session.ok || account.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Invalid session");
  });
  if (signIn.status === "unknown") signIn.note = "A dedicated monitoring account has not been configured.";

  const checks = await Promise.all([
    checkHttp("web-http", "Page response", webUrl, process.env.STATUS_WEB_EXPECTED ?? "Parcelis"),
    checkHttp("api-http", "HTTP response", apiUrl, '"service":"parcelis-api"'),
    runCheck("auth-boundary", "Authentication enforcement", async () => {
      const response = await fetch(`${apiOrigin}/trpc/auth.me`, {
        signal: AbortSignal.timeout(4_500),
        redirect: "error",
      });
      const body = await response.json();
      if (response.status !== 401 || body.error?.data?.code !== "UNAUTHORIZED")
        throw new Error("Invalid auth boundary");
    }),
    runCheck("api-session", "Authenticated request", async () => {
      if (signIn.status === "unknown") return "unknown";
      if (signIn.status !== "operational" || !cookie || !email) throw new Error("No valid monitoring session");
      const response = await fetch(`${apiOrigin}/trpc/auth.me`, {
        headers: { cookie },
        signal: AbortSignal.timeout(4_500),
        redirect: "error",
      });
      const body = await response.json();
      if (!response.ok || body.result?.data?.user?.email?.toLowerCase() !== email.toLowerCase()) {
        throw new Error("Authenticated request failed");
      }
    }),
    checkHttp("docs", "Documentation", docsUrl, process.env.STATUS_DOCS_EXPECTED ?? "Parcelis"),
  ]);
  const [web, api, boundary, session, docs] = checks as [
    ServiceCheck,
    ServiceCheck,
    ServiceCheck,
    ServiceCheck,
    ServiceCheck,
  ];
  if (session.status === "unknown") session.note = "A dedicated monitoring account has not been configured.";
  return [
    groupChecks("web", "Web application", [web, signIn], "web-http"),
    groupChecks("api", "API", [api, boundary, session], "api-http"),
    docs,
  ];
}
