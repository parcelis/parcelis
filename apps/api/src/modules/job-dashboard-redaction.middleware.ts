import type { RequestHandler } from "express";
import { sanitizeJobResponse } from "./job-dashboard-redaction";

export { sanitizeJobData } from "./job-dashboard-redaction";

export const jobDashboardRedactionMiddleware: RequestHandler = (_request, response, next) => {
  const sendJson = response.json.bind(response);

  response.json = ((body: unknown) => sendJson(sanitizeJobResponse(body))) as typeof response.json;
  next();
};
