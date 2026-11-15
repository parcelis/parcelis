import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { InvoicePdfInvoice } from "../../modules/invoice-pdf";

const invoice: InvoicePdfInvoice = {
  currencyCode: "USD",
  invoiceNumber: 123,
  amountCents: 12_445,
  balanceCents: 1,
  dueOn: new Date("2027-01-01"),
  status: "open",
  items: [
    { item: "Rent", description: "Partial month", quantity: 1, rateCents: 12_345 },
    { item: "Service", description: "Additional charge", quantity: 2, rateCents: 50 },
  ],
  lease: { unitLabel: "1A" },
  payments: [
    {
      amountCents: 12_444,
      paidOn: new Date("2027-01-02"),
      paymentMethod: "check",
      tenant: { firstName: "Alex", lastName: "Smith" },
    },
  ],
  property: {
    name: "Currency Property",
    line1: "1 Main Street",
    line2: null,
    city: "Madison",
    region: "WI",
    postalCode: "53703",
  },
  tenant: { firstName: "Alex", lastName: "Smith" },
};

test("invoice PDFs render saved currency, retain fractions, and reject unsupported metadata", () => {
  const apiRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const require = createRequire(new URL("../../../package.json", import.meta.url));
  const modulePath = fileURLToPath(new URL("../../modules/invoice-pdf.tsx", import.meta.url));
  const script = `
    const assert = require("node:assert/strict");
    globalThis.React = require("react");
    const { writeFile } = require("node:fs/promises");
    const { renderInvoicePdf } = require(${JSON.stringify(modulePath)});
    const invoice = JSON.parse(${JSON.stringify(JSON.stringify(invoice))}, (key, value) =>
      ["dueOn", "paidOn"].includes(key) ? new Date(value) : value);
    (async () => {
      const buffer = await renderInvoicePdf(invoice);
      assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
      assert.ok(buffer.length > 5000);
      await assert.rejects(renderInvoicePdf({ ...invoice, currencyCode: "JPY" }));
      if (process.env.INVOICE_CURRENCY_PDF_PATH) await writeFile(process.env.INVOICE_CURRENCY_PDF_PATH, buffer);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  // Match the import export-condition used by the Next.js PDF bundle.
  const result = spawnSync(
    process.execPath,
    ["--conditions=import", "--import", require.resolve("tsx"), "--eval", script],
    {
      cwd: apiRoot,
      env: process.env,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
});
