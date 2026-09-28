import assert from "node:assert/strict";
import test from "node:test";
import {
  jobDashboardFavIcon,
  jobDashboardLogoMiddleware,
} from "../../modules/job-dashboard-logo.middleware";

test("dashboard HTML keeps the existing Parcelis logo mapping", () => {
  let body = "";
  const response = {
    send(value: string) {
      body = value;
      return response;
    },
  };

  jobDashboardLogoMiddleware({} as never, response as never, () => {});
  response.send('<html><body><script id="__UI_CONFIG__"></script></body></html>');

  assert.match(body, /parcelis-lettermark-dark\.svg/);
  assert.match(body, /dark-mode/);
});

test("dashboard uses the Parcelis SVG favicon and PNG fallback", () => {
  assert.match(jobDashboardFavIcon.default, /\/brand\/favicon\.svg$/);
  assert.match(jobDashboardFavIcon.alternative, /\/brand\/favicon-96x96\.png$/);
});
