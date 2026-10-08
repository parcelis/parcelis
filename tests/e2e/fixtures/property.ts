import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect, test as authenticatedTest } from "./authenticated";

export async function mutate<T>(request: APIRequestContext, procedure: string, input: unknown) {
  const response = await request.post(`/trpc/${procedure}?batch=1`, { data: { "0": input } });
  expect(response.ok(), `${procedure}: HTTP ${response.status()}`).toBe(true);
  const payload = (await response.json()) as Array<{ result?: { data: T }; error?: { message: string } }>;
  expect(payload[0]?.error, procedure).toBeUndefined();
  expect(payload[0]?.result, procedure).toBeDefined();
  return payload[0].result!.data;
}

export const test = authenticatedTest.extend<{ property: { id: number; name: string } }>({
  property: [
    async ({ page, baseURL }, use) => {
      authenticatedTest.skip(
        !baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname),
        "This write smoke test requires a local app.",
      );
      const name = `API browser test ${randomUUID().slice(0, 8)}`;
      const property = await mutate<{ id: number }>(page.request, "properties.create", {
        name,
        propertyType: "House",
        address: { line1: "123 Test Street", city: "Chicago", region: "IL", postalCode: "60601" },
        unitCount: 1,
        units: [{ name: "Test Unit", marketRateCents: 100000, unitType: "Residential" }],
        tagIds: [],
      });
      try {
        await use({ ...property, name });
      } finally {
        await mutate(page.request, "properties.deleteImage", { id: property.id });
        const input = encodeURIComponent(JSON.stringify({ propertyId: property.id }));
        const response = await page.request.get(`/trpc/notes.list?input=${input}`);
        expect(response.ok(), "Read test notes for cleanup").toBe(true);
        const payload = (await response.json()) as { result: { data: Array<{ id: number }> } };
        for (const note of payload.result.data) await mutate(page.request, "notes.delete", { id: note.id });
        await mutate(page.request, "properties.delete", { id: property.id });
      }
    },
    { timeout: 30_000 },
  ],
});

export { expect };
