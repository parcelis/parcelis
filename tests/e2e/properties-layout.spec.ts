import { test, expect } from "./fixtures/authenticated";

test("keeps the Properties hero and all five metrics within the viewport", async ({ page }) => {
  await page.goto("/properties");
  const heading = page.getByRole("heading", { name: "Portfolio directory", exact: true });
  await expect(heading).toBeVisible();
  const hero = heading.locator("../..");

  for (const width of [390, 768, 820, 834, 912, 1023, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1024 });
    await expect(async () => {
      const bounds = await hero.evaluate((element) => {
        const intro = element.children[0]!;
        const metrics = element.children[1]!;
        const heroBounds = element.getBoundingClientRect();
        const introBounds = intro.getBoundingClientRect();
        const metricBounds = metrics.getBoundingClientRect();
        return {
          pageFits: document.documentElement.scrollWidth <= window.innerWidth,
          cardCount: metrics.children.length,
          cardsFit: Array.from(metrics.children).every((card) => {
            const bounds = card.getBoundingClientRect();
            return (
              bounds.width > 0 &&
              bounds.left >= heroBounds.left &&
              bounds.right <= heroBounds.right &&
              bounds.left >= 0 &&
              bounds.right <= window.innerWidth &&
              card.scrollWidth <= card.clientWidth + 1
            );
          }),
          sideBySide: introBounds.right <= metricBounds.left && metricBounds.top < introBounds.bottom,
        };
      });
      expect(bounds.pageFits, `page overflow at ${width}px`).toBe(true);
      expect(bounds.cardCount).toBe(5);
      expect(bounds.cardsFit, `metric overflow at ${width}px`).toBe(true);
      if (width >= 1440) expect(bounds.sideBySide, `desktop layout at ${width}px`).toBe(true);
    }).toPass();
  }
});
