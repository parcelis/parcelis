const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const safeMethods = new Set(["GET", "HEAD"]);

export function getJobDashboardAccessStatus(role: string | null, method: string, origin: string | undefined) {
  if (!role) return 401;
  if (role !== "administrator") return 403;
  if (!allowedMethods.has(method)) return 405;
  if (!safeMethods.has(method)) {
    const webOrigin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`;
    if (origin !== new URL(webOrigin).origin) return 403;
  }
  return null;
}
