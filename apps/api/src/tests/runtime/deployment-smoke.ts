import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrismaClient } from "@parcelis/db";
import { deletePropertyImageObject } from "../../modules/object-storage.config";

// Utility functions for deployment smoke tests.
export async function readSmokeMutationResult<T>(response: Response, procedure: string) {
  const body = await response.text();
  const diagnostic = `${procedure}: HTTP ${response.status}: ${body.slice(0, 500)}`;
  assert.equal(response.status, 200, diagnostic);
  let payload: { result?: { data: T }; error?: unknown };
  try {
    payload = JSON.parse(body);
  } catch {
    assert.fail(`${diagnostic} (invalid JSON)`);
  }
  assert.ok(payload?.result, diagnostic);
  return payload.result.data;
}

export async function runDeploymentSmoke({
  base,
  cookie,
  prisma,
  propertyId,
  tenantId,
  organizationId,
}: {
  base: string;
  cookie: string;
  prisma: PrismaClient;
  propertyId: number;
  tenantId: number;
  organizationId: number;
}) {
  const headers = { cookie, "content-type": "application/json" };
  function request(input: string | URL, init: RequestInit = {}) {
    return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
  }
  async function mutate<T>(procedure: string, input: unknown) {
    const response = await request(`${base}/trpc/${procedure}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
    return readSmokeMutationResult<T>(response, procedure);
  }

  for (const path of ["/trpc/auth.me", "/api/v1/tags", "/admin/jobs/"]) {
    const denied = await request(`${base}${path}`);
    assert.equal(denied.status, 401, path);
    assert.match(denied.headers.get("cache-control") ?? "", /no-store/);
  }
  const login = await request(`${base}/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "pdf@example.test", password: "Deployment-test-password-123!" }),
  });
  assert.equal(login.status, 200, "Native password verification must work in the image.");
  assert.match(login.headers.get("set-cookie") ?? "", /parcelis_session_v2=/);
  const loginCookie = login.headers.get("set-cookie")!.split(";")[0]!;
  assert.equal((await request(`${base}/trpc/auth.me`, { headers: { cookie: loginCookie } })).status, 200);
  assert.equal((await request(`${base}/login`)).status, 200, "The proxy must serve the built web app.");
  for (const path of ["/api/v1/tags", "/admin/jobs/api/queues"]) {
    const response = await request(`${base}${path}`, { headers });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    await response.json();
  }
  const dashboard = await request(`${base}/admin/jobs/?embedded=1`, { headers });
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  const script = html.match(/src="([^"]+\.js[^"]*)"/)?.[1];
  assert.ok(script, "Bull Board must reference its bundled JavaScript.");
  assert.equal((await request(new URL(script, `${base}/admin/jobs/`), { headers })).status, 200);

  const buffer = await readFile(resolve(__dirname, "../../../../web/public/brand/parcelis-fullmark-light.png"));
  const upload = await mutate<{ uploadUrl: string; objectKey: string; fields: Record<string, string> }>(
    "properties.createImageUploadUrl",
    { id: propertyId, contentType: "image/png", fileSize: buffer.length, fileName: "deployment-test.png" },
  );
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append("file", new Blob([new Uint8Array(buffer)], { type: "image/png" }), "deployment-test.png");
    assert.equal((await request(upload.uploadUrl, { method: "POST", body: form })).status, 204);
    await mutate("properties.completeImageUpload", { id: propertyId, objectKey: upload.objectKey });
    const response = await request(
      `${base}/trpc/properties.byId?input=${encodeURIComponent(JSON.stringify({ id: propertyId }))}`,
      { headers },
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { result: { data: { imageUrl: string } } };
    const stored = await request(payload.result.data.imageUrl);
    assert.equal(stored.status, 200);
    assert.deepEqual(Buffer.from(await stored.arrayBuffer()), buffer);
    await mutate("properties.deleteImage", { id: propertyId });
    assert.equal((await request(payload.result.data.imageUrl)).status, 404);
  } finally {
    await deletePropertyImageObject(upload.objectKey);
  }

  await prisma.invoiceCharge.create({
    data: { organizationId, name: "Rent", description: "Monthly rent", isDefault: true },
  });
  const unit = await prisma.unit.create({ data: { propertyId, name: "Deployment unit", marketRateCents: 120_000 } });
  const draft = await mutate<{ id: number; revision: number }>("leases.createDraft", {
    leaseDraftKey: randomUUID(),
    propertyId,
    unitId: unit.id,
  });
  const year = new Date().getUTCFullYear() + 1;
  const saved = await mutate<{ id: number; revision: number }>("leases.updateDraft", {
    leaseId: draft.id,
    expectedRevision: draft.revision,
    data: {
      tenantIds: [tenantId],
      termType: "fixed",
      startsOn: `${year}-01-01`,
      endsOn: `${year}-12-31`,
      monthlyRentCents: 120_000,
      securityDepositCents: 0,
      rentDueDay: 1,
      billingResponsibility: "joint",
      allowPartialPayments: true,
      draftStep: "review",
    },
  });
  const input = { leaseId: saved.id, expectedRevision: saved.revision };
  const [first, retried] = await Promise.all([
    mutate<{ status: string; invoiceSummary: { invoiceCount: number } }>("leases.finalizeDraft", input),
    mutate<{ status: string; invoiceSummary: { invoiceCount: number } }>("leases.finalizeDraft", input),
  ]);
  assert.equal(first.status, "scheduled");
  assert.equal(first.invoiceSummary.invoiceCount, 12);
  assert.deepEqual(first.invoiceSummary, retried.invoiceSummary);
  const invoices = await prisma.invoice.findMany({ where: { leaseId: saved.id }, orderBy: { dueOn: "asc" } });
  assert.equal(invoices.length, 12);
  const invoice = invoices[0]!;
  await mutate("invoices.recordPayment", {
    id: invoice.id,
    amountCents: 120_000,
    paidByTenantId: tenantId,
    paidOn: `${year}-01-01`,
    paymentMethod: "check",
  });
  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.balanceCents, 0);
  assert.equal(paid.status, "paid");
  assert.equal(await prisma.invoicePayment.count({ where: { invoiceId: invoice.id } }), 1);
  console.log(
    "Proxy, native login, REST, Bull Board assets/Redis, image storage, concurrent lease finalization, and invoice payment checks passed.",
  );
}
