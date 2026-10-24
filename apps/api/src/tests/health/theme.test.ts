import assert from "node:assert/strict";
import test from "node:test";
import { getStatusTheme } from "../../status/theme";
import { renderStatusPage } from "../../status/page";

test("theme defaults to system and reads the saved preference", () => {
  const url = new URL("http://localhost/status");
  assert.equal(getStatusTheme(url).theme, "system");
  assert.equal(getStatusTheme(url, "other=value; parcelis-status-theme=dark").theme, "dark");
  assert.equal(getStatusTheme(url, "parcelis-status-theme=invalid").theme, "system");
});

test("valid selections override the cookie and persist without accepting arbitrary input", () => {
  const selection = getStatusTheme(new URL("http://localhost/status?theme=light"), "parcelis-status-theme=dark");
  assert.equal(selection.theme, "light");
  assert.ok(selection.cookie?.includes("parcelis-status-theme=light; Path=/;"));
  assert.ok(selection.cookie?.includes("SameSite=Lax; HttpOnly"));
  const invalid = getStatusTheme(new URL("http://localhost/status?theme=%3Cscript%3E"), "parcelis-status-theme=dark");
  assert.equal(invalid.theme, "dark");
  assert.equal(invalid.cookie, undefined);
});

test("theme controls reflect the selected mode and retain a CSS system preference", () => {
  const page = renderStatusPage("operational", [], "dark");
  assert.ok(page.includes('data-theme="dark"'));
  assert.ok(page.includes('href="?theme=dark" aria-current="true"'));
  assert.ok(page.includes("prefers-color-scheme: dark"));
  assert.ok(page.includes("parcelis-fullmark-dark.svg"));
  assert.ok(!page.includes("<script>"));
});
