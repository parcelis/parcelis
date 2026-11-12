import assert from "node:assert/strict";
import test from "node:test";
import { getBillingCalendarDate, getReceivableStatus, summarizeInvoiceBalances } from "@parcelis/schemas";

test("billing date follows organization midnight across DST and year boundaries", () => {
  assert.equal(getBillingCalendarDate("America/Chicago", new Date("2027-01-01T02:00:00Z")), "2026-12-31");
  assert.equal(getBillingCalendarDate("Pacific/Auckland", new Date("2026-12-31T12:00:00Z")), "2027-01-01");
  assert.equal(getBillingCalendarDate("America/Chicago", new Date("2026-03-09T04:59:00Z")), "2026-03-08");
  assert.equal(getBillingCalendarDate("America/Chicago", new Date("2026-03-09T05:01:00Z")), "2026-03-09");
  assert.equal(getBillingCalendarDate("America/Chicago", new Date("2026-11-02T05:59:00Z")), "2026-11-01");
  assert.equal(getBillingCalendarDate("America/Chicago", new Date("2026-11-02T06:01:00Z")), "2026-11-02");
});

test("balances separate future, current and overdue charges without trusting stale status", () => {
  const invoices = [
    { dueOn: "2026-10-01", status: "open", amountCents: 10001, balanceCents: 4001 },
    { dueOn: "2026-11-01", status: "overdue", amountCents: 20002, balanceCents: 20002 },
    { dueOn: "2026-12-01", status: "overdue", amountCents: 30003, balanceCents: 30003 },
    { dueOn: "2026-09-01", status: "paid", amountCents: 5005, balanceCents: 0 },
    { dueOn: "2026-09-01", status: "void", amountCents: 90000, balanceCents: 90000 },
  ];
  assert.deepEqual(summarizeInvoiceBalances(invoices, "2026-11-01"), {
    futureCents: 30003,
    dueTodayCents: 20002,
    overdueCents: 4001,
    outstandingCents: 54006,
    recordedPaymentCents: 11005,
  });
  assert.deepEqual(
    invoices.map((invoice) => getReceivableStatus(invoice, "2026-11-01")),
    ["overdue", "open", "open", "paid", "void"],
  );
});

test("a payment reversal restores receivables and reduces recorded payments without rounding", () => {
  const invoice = { dueOn: new Date("2026-01-01"), status: "paid", amountCents: 10001, balanceCents: 0 };
  assert.equal(summarizeInvoiceBalances([invoice], "2026-02-01").recordedPaymentCents, 10001);
  const reversed = summarizeInvoiceBalances([{ ...invoice, status: "overdue", balanceCents: 4001 }], "2026-02-01");
  assert.equal(reversed.recordedPaymentCents, 6000);
  assert.equal(reversed.overdueCents, 4001);
});
