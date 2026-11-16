import type { apiClient } from "../../apps/web/components/api-client";
import { test, expect } from "./fixtures/authenticated";
import { currencySettingsFixture } from "./fixtures/currency";

type Invoice = NonNullable<Awaited<ReturnType<typeof apiClient.invoices.byId.query>>>;

test("invoice editing and payment preserve saved currency and fractional balances", async ({ page }) => {
  const listResponse = await page.request.get("/trpc/invoices.list", { params: { input: "{}" } });
  expect(listResponse.ok()).toBe(true);
  const list = (await listResponse.json()) as { result: { data: Array<{ id: number }> } };
  const id = list.result.data[0]?.id;
  expect(id, "A seeded invoice is required for this workflow").toBeDefined();
  const invoiceResponse = await page.request.get("/trpc/invoices.byId", { params: { input: JSON.stringify({ id }) } });
  const {
    result: { data: invoice },
  } = (await invoiceResponse.json()) as { result: { data: Invoice } };
  expect(invoice.items.length).toBeGreaterThan(0);
  invoice.currencyCode = "USD";
  invoice.amountCents = 1234;
  invoice.balanceCents = 1234;
  invoice.status = "open";
  invoice.payments = [];
  invoice.items = [{ ...invoice.items[0]!, quantity: 1, rateCents: 1234, amountCents: 1234 }];
  const writes: Array<{ procedure: string; amount: number }> = [];

  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const batched = url.searchParams.has("batch");
    if (
      request.method() === "POST" &&
      procedures.some((procedure) => ["invoices.update", "invoices.recordPayments"].includes(procedure))
    ) {
      const input = request.postDataJSON() as
        | Record<
            string,
            {
              items?: Array<{ rateCents: number }>;
              payments?: Array<{ amountCents: number }>;
            }
          >
        | {
            items?: Array<{ rateCents: number }>;
            payments?: Array<{ amountCents: number }>;
          };
      const results = procedures.map((procedure, index) => {
        const args =
          batched && input !== null && typeof input === "object" && String(index) in input
            ? (input as Record<
                string,
                {
                  items?: Array<{ rateCents: number }>;
                  payments?: Array<{ amountCents: number }>;
                }
              >)[String(index)]!
            : (input as {
                items?: Array<{ rateCents: number }>;
                payments?: Array<{ amountCents: number }>;
              });
        if (procedure === "invoices.update") {
          const amount = args.items![0]!.rateCents;
          writes.push({ procedure, amount });
          invoice.amountCents = amount;
          invoice.balanceCents = amount;
          invoice.items[0]!.rateCents = amount;
          invoice.items[0]!.amountCents = amount;
        }
        if (procedure === "invoices.recordPayments") {
          const amount = args.payments![0]!.amountCents;
          writes.push({ procedure, amount });
          invoice.balanceCents -= amount;
        }
        return { result: { data: procedure === "invoices.update" ? invoice : [] } };
      });
      await route.fulfill({ json: batched ? results : results[0] });
      return;
    }
    if (!procedures.some((procedure) => ["invoices.byId", "organizations.currency"].includes(procedure))) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    const results = batched ? body : [body];
    procedures.forEach((procedure, index) => {
      if (procedure === "invoices.byId") results[index] = { result: { data: invoice } };
      if (procedure === "organizations.currency")
        results[index] = {
          result: {
            data: {
              ...currencySettingsFixture(),
              currencyCode: "JPY",
              supportedCurrencies: [{ code: "JPY", name: "Japanese Yen", minorUnitDigits: 0 }],
            },
          },
        };
    });
    await route.fulfill({ response, json: batched ? results : results[0] });
  });

  await page.goto(`/income/invoices/${id}`);
  await expect(page.getByText("$12.34 USD", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit invoice", exact: true }).click();
  const edit = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Edit invoice", exact: true }) });
  const rate = edit.getByRole("spinbutton", { name: "Rate (USD)", exact: true });
  await expect(rate).toHaveValue("12.34");
  await expect(rate).toHaveAttribute("step", "0.01");
  await rate.fill("12.351");
  await expect(edit.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await rate.fill("12.35");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  await expect(page.getByText("$12.35 USD", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  const payment = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Record payment", exact: true }) });
  await payment.getByRole("combobox", { name: "Payment method *", exact: true }).selectOption("cash");
  const amount = payment.getByRole("spinbutton", { name: "Amount * (USD)", exact: true });
  await amount.fill("12.36");
  await expect(payment.getByRole("button", { name: "Record payment", exact: true })).toBeDisabled();
  await amount.fill("12.34");
  await payment.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(payment).not.toBeVisible();
  await expect(page.getByText("$0.01 USD", { exact: true }).first()).toBeVisible();
  expect(writes).toEqual([
    { procedure: "invoices.update", amount: 1235 },
    { procedure: "invoices.recordPayments", amount: 1234 },
  ]);
});
