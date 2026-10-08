import type { RequestHandler } from "express";
import { addJobDashboardLogo } from "./job-dashboard-branding";

export { jobDashboardFavIcon, jobDashboardLightLogoUrl } from "./job-dashboard-branding";

export const jobDashboardLogoMiddleware: RequestHandler = (_request, response, next) => {
  const send = response.send.bind(response);
  response.send = ((body?: string | Buffer) =>
    send(typeof body === "string" ? addJobDashboardLogo(body) : body)) as typeof response.send;
  next();
};
