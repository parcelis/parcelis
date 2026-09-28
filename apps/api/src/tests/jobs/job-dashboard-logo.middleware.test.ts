import assert from "node:assert/strict";
import test from "node:test";
import { jobDashboardLogoMiddleware } from "../../modules/job-dashboard-logo.middleware";

test("dashboard HTML switches between Parcelis lettermarks with its theme", () => {
  let body = "";
  const response = {
    send(value: string) {
      body = value;
      return response;
    },
  };

  jobDashboardLogoMiddleware({} as never, response as never, () => {});
  response.send('<html><body><script id="__UI_CONFIG__"></script></body></html>');

  assert.match(body, /parcelis-lettermark-light\.svg/);
  assert.match(body, /parcelis-lettermark-dark\.svg/);
  assert.match(body, /dark-mode/);
});
