import { createHash } from "node:crypto";
import { config } from "dotenv";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { test, expect } from "./fixtures/authenticated";

config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
test.skip(!databaseUrl, "DATABASE_URL is required for session browser tests.");
test.use({ launchOptions: { ignoreDefaultArgs: ["--disable-background-timer-throttling"] } });

async function sessionFor(page: import("@playwright/test").Page, prisma: PrismaClient) {
  const cookie = (await page.context().cookies()).find((item) => item.name === "parcelis_session_v2");
  expect(cookie).toBeDefined();
  const tokenHash = createHash("sha256").update(cookie!.value).digest("hex");
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  expect(session).not.toBeNull();
  return session!.id;
}

test("active editing renews an almost idle session; expired sessions return to login", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  try {
    const id = await sessionFor(page, prisma);
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 13.5 * 60_000) },
    });
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("auth.session") && response.ok()),
      page.goto("/settings/profile"),
    ]);
    const beforeRead = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(Date.now() - beforeRead.lastSeenAt.getTime()).toBeLessThan(14 * 60_000);
    await page.mouse.move(300, 300);
    await page.waitForTimeout(1200);
    const afterPointerMove = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(afterPointerMove.lastSeenAt).toEqual(beforeRead.lastSeenAt);
    const readSucceeded = await page.evaluate(async () => {
      const input = encodeURIComponent(JSON.stringify({ json: null }));
      return (await fetch(`/trpc/auth.session?input=${input}`, { credentials: "include" })).ok;
    });
    expect(readSucceeded).toBe(true);
    const afterRead = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(afterRead.lastSeenAt).toEqual(beforeRead.lastSeenAt);
    await page.getByRole("textbox", { name: "Phone" }).press("1");
    await expect(async () => {
      const session = await prisma.session.findUniqueOrThrow({ where: { id } });
      expect(session.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    }).toPass();

    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 14.5 * 60_000) },
    });
    await page.reload();
    const warning = page.getByRole("alertdialog", { name: "Your session is about to expire" });
    await expect(warning).toBeVisible();
    await warning.getByRole("button", { name: "Stay signed in" }).click();
    await expect(async () => {
      const session = await prisma.session.findUniqueOrThrow({ where: { id } });
      expect(session.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    }).toPass();
    await expect(warning).toBeHidden();

    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 15 * 60_000 - 1000) },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByText("Your session expired after 15 minutes without activity.", { exact: false }),
    ).toBeVisible();
  } finally {
    await prisma.$disconnect();
  }
});

test("the warning opens while Parcelis is a background tab", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  const otherTab = await page.context().newPage();
  try {
    const id = await sessionFor(page, prisma);
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 13.75 * 60_000) },
    });
    await page.reload();
    await otherTab.goto("about:blank");
    await otherTab.bringToFront();
    const warning = page.getByRole("alertdialog", { name: "Your session is about to expire" });
    await expect(warning).toBeVisible({ timeout: 25_000 });
  } finally {
    await otherTab.close();
    await prisma.$disconnect();
  }
});

test("renewal in one tab updates the warning in another tab", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  const second = await page.context().newPage();
  try {
    const id = await sessionFor(page, prisma);
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 14.5 * 60_000) },
    });
    await Promise.all([page.reload(), second.goto("/")]);
    const warning = page.getByRole("alertdialog", { name: "Your session is about to expire" });
    await expect(warning).toBeVisible();
    await expect(second.getByRole("alertdialog", { name: "Your session is about to expire" })).toBeVisible();
    await warning.getByRole("button", { name: "Stay signed in" }).click();
    await expect(warning).toBeHidden();
    await expect(second.getByRole("alertdialog", { name: "Your session is about to expire" })).toBeHidden();
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(second).toHaveURL(/\/login$/);
  } finally {
    await second.close();
    await prisma.$disconnect();
  }
});

test("job dashboard activity renews the session while its background reads do not", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  try {
    const id = await sessionFor(page, prisma);
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 13.5 * 60_000) },
    });
    await page.goto("/admin/jobs/");
    await expect(page).toHaveURL(/\/settings\/jobs$/);
    const dashboard = page.frameLocator('iframe[title="Job dashboard"]');
    await expect(dashboard.locator("body")).toBeVisible();
    const before = await prisma.session.findUniqueOrThrow({ where: { id } });
    await page.waitForTimeout(2000);
    const afterBackgroundReads = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(afterBackgroundReads.lastSeenAt).toEqual(before.lastSeenAt);

    await dashboard.locator("body").click({ position: { x: 300, y: 300 } });
    await expect(async () => {
      const session = await prisma.session.findUniqueOrThrow({ where: { id } });
      expect(session.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    }).toPass();
  } finally {
    await prisma.$disconnect();
  }
});

test("an open page shows the warning when it enters the final minute", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  try {
    const id = await sessionFor(page, prisma);
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 13.75 * 60_000) },
    });
    await page.reload();
    const warning = page.getByRole("alertdialog", { name: "Your session is about to expire" });
    await expect(warning).toBeHidden();
    await expect(warning).toBeVisible({ timeout: 25_000 });
  } finally {
    await prisma.$disconnect();
  }
});

test("an already open page picks up a changed server deadline", async ({ page }) => {
  test.setTimeout(90_000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  try {
    const id = await sessionFor(page, prisma);
    await expect(page.getByRole("alertdialog", { name: "Your session is about to expire" })).toBeHidden();
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(Date.now() - 13.5 * 60_000) },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("alertdialog", { name: "Your session is about to expire" })).toBeVisible({
      timeout: 75_000,
    });
  } finally {
    await prisma.$disconnect();
  }
});

const proxyBaseURL = process.env.PLAYWRIGHT_TEST_BASE_URL;

test.describe("proxy origin", () => {
  test.skip(!proxyBaseURL, "Set PLAYWRIGHT_TEST_BASE_URL to the running proxy origin.");

  test("serves session status and shows the warning", async ({ page }) => {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    try {
      const id = await sessionFor(page, prisma);
      await prisma.session.update({
        where: { id },
        data: { lastSeenAt: new Date(Date.now() - 14.5 * 60_000) },
      });
      await page.goto("/properties");
      expect(new URL(page.url()).origin).toBe(new URL(proxyBaseURL!).origin);
      const sessionResponse = await page.evaluate(async () => {
        const response = await fetch("/trpc/auth.session?input=%7B%22json%22%3Anull%7D", {
          credentials: "include",
        });
        return { status: response.status, body: await response.text() };
      });
      expect(sessionResponse.status, sessionResponse.body).toBe(200);
      await expect(page.getByRole("alertdialog", { name: "Your session is about to expire" })).toBeVisible();
    } finally {
      await prisma.$disconnect();
    }
  });
});
