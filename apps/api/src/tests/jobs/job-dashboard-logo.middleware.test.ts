import assert from "node:assert/strict";
import test from "node:test";
import {
  jobDashboardFavIcon,
  jobDashboardLogoMiddleware,
} from "../../modules/job-dashboard-logo.middleware";

test("dashboard HTML maps distinct Parcelis logos to each theme", () => {
  let body = "";
  const response = {
    send(value: string) {
      body = value;
      return response;
    },
  };

  jobDashboardLogoMiddleware({} as never, response as never, () => {});
  response.send('<html><body><script id="__UI_CONFIG__"></script></body></html>');

  const sources = JSON.parse(body.match(/const sources=(\{.*?\});/)![1]!);
  assert.match(sources.light, /\/brand\/parcelis-lettermark-light\.svg$/);
  assert.match(sources.dark, /\/brand\/parcelis-lettermark-dark\.svg$/);
  assert.match(body, /dark-mode/);
});

test("dashboard uses the Parcelis SVG favicon and PNG fallback", () => {
  assert.match(jobDashboardFavIcon.default, /\/brand\/favicon\.svg$/);
  assert.match(jobDashboardFavIcon.alternative, /\/brand\/favicon-96x96\.png$/);
});
