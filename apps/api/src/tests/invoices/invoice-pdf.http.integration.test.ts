import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import { findOpenPort } from "../../../../../scripts/port-utils.mjs";
import { hashPassword } from "../../modules/auth";
import { runDeploymentSmoke } from "../runtime/deployment-smoke";

const databaseUrl = process.env.API_HTTP_INTEGRATION_TEST === "1" ? process.env.DATABASE_URL : undefined;
if (databaseUrl && !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("API HTTP integration tests require local PostgreSQL.");
}

test(
  "Next.js production HTTP checks use isolated PostgreSQL and embed PDF assets",
  { skip: !databaseUrl, timeout: 120_000 },
  async (t) => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const resources: {
      isolated?: Awaited<ReturnType<typeof createIsolatedTestSchema>>;
      prisma?: PrismaClient;
      child?: ChildProcess;
      container?: string;
      envDirectory?: string;
    } = {};
    t.after(async () => {
      const { child, prisma, isolated, container, envDirectory } = resources;
      try {
        if (container) {
          execFileSync("docker", ["stop", "--time", "25", container], { stdio: "pipe" });
          assert.equal(
            execFileSync("docker", ["inspect", "--format", "{{.State.ExitCode}}", container], {
              encoding: "utf8",
            }).trim(),
            "0",
          );
        }
        if (child && child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGTERM");
          try {
            await Promise.race([
              exited,
              setTimeout(20_000, undefined, { ref: false }).then(() => {
                throw new Error("API shutdown timed out.");
              }),
            ]);
            assert.equal(child.exitCode, 0);
          } catch (error) {
            child.kill("SIGKILL");
            await exited;
            throw error;
          }
        }
      } finally {
        if (container) execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
        if (envDirectory) await rm(envDirectory, { recursive: true, force: true });
        await prisma?.$disconnect();
        try {
          await isolated?.cleanup();
        } finally {
          await admin.$disconnect();
        }
      }
    });
    const isolated = (resources.isolated = await createIsolatedTestSchema(admin, databaseUrl!, "api_pdf_test"));
    const prisma = (resources.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    }));
    const organization = await prisma.organization.create({ data: { name: "PDF integration", slug: isolated.schema } });
    const user = await prisma.user.create({
      data: {
        name: "PDF tester",
        email: "pdf@example.test",
        passwordHash: await hashPassword("Deployment-test-password-123!"),
        role: "administrator",
        defaultOrganizationId: organization.id,
      },
    });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 600_000),
        activeOrganizationId: organization.id,
      },
    });
    const property = await prisma.property.create({
      data: {
        organizationId: organization.id,
        name: "PDF test house",
        line1: "123 Test Street",
        city: "Chicago",
        region: "IL",
        postalCode: "60601",
        propertyType: "House",
        unitCount: 1,
      },
    });
    const unit = await prisma.unit.create({
      data: { propertyId: property.id, name: "Test Unit", marketRateCents: 125_000 },
    });
    const tenant = await prisma.tenant.create({
      data: {
        organizationId: organization.id,
        firstName: "Test",
        lastName: "Resident",
        email: "resident@example.test",
      },
    });
    const dueOn = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 15));
    const lease = await prisma.lease.create({
      data: {
        organizationId: organization.id,
        propertyId: property.id,
        unitId: unit.id,
        status: "active",
        startsOn: dueOn,
        monthlyRentCents: 125_000,
      },
    });
    await prisma.leaseTenant.create({
      data: { organizationId: organization.id, leaseId: lease.id, tenantId: tenant.id },
    });
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: organization.id,
        propertyId: property.id,
        leaseId: lease.id,
        tenantId: tenant.id,
        periodStartsOn: dueOn,
        periodEndsOn: dueOn,
        dueOn,
        amountCents: 125_000,
        balanceCents: 125_000,
        items: {
          create: { item: "Rent", description: "Monthly rent", quantity: 1, rateCents: 125_000, amountCents: 125_000 },
        },
      },
    });
    const url = new URL(databaseUrl!);
    url.searchParams.set("schema", isolated.schema);
    const port = await findOpenPort(40011);
    const image = process.env.API_TEST_IMAGE;
    let logs = "";
    if (image) {
      const container = (resources.container = `parcelis-deployment-${randomUUID().slice(0, 8)}`);
      const envDirectory = (resources.envDirectory = await mkdtemp(resolve(tmpdir(), "parcelis-deployment-")));
      const envFile = resolve(envDirectory, "container.env");
      url.hostname = "host.docker.internal";
      const storageUrl = new URL(process.env.S3_ENDPOINT ?? "http://localhost:9001");
      storageUrl.hostname = "host.docker.internal";
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: url.href,
        API_INTERNAL_URL: "http://127.0.0.1:4000",
        WEB_ORIGIN: `http://127.0.0.1:${port}`,
        WEBAPP_URL: `http://127.0.0.1:${port}`,
        REDIS_HOST: "host.docker.internal",
        S3_ENDPOINT: storageUrl.href,
      };
      delete env.REDIS_URL;
      await writeFile(
        envFile,
        Object.entries(env)
          .filter(([, value]) => value !== undefined && !value.includes("\n"))
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
        { mode: 0o600 },
      );
      execFileSync(
        "docker",
        ["run", "--detach", "--name", container, "--env-file", envFile, "--publish", `127.0.0.1:${port}:3000`, image],
        { stdio: "pipe" },
      );
    } else {
      const child = (resources.child = spawn(process.execPath, ["scripts/start.mjs"], {
        cwd: resolve(__dirname, "../../.."),
        env: {
          ...process.env,
          NODE_ENV: "production",
          API_PORT: String(port),
          API_HOSTNAME: "127.0.0.1",
          DATABASE_URL: url.href,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }));
      child.stdout?.on("data", (chunk) => {
        logs += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        logs += chunk;
      });
    }
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 20_000;
    for (;;) {
      if (resources.child && resources.child.exitCode !== null) throw new Error(`API exited before readiness: ${logs}`);
      try {
        if (
          (await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) })).ok &&
          (!image || (await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) })).ok)
        )
          break;
      } catch {
        // Connection failures are expected while the server starts.
      }
      if (Date.now() >= deadline && image)
        logs = execFileSync("docker", ["logs", resources.container!], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      assert.ok(Date.now() < deadline, `Built services did not become ready: ${logs}`);
      await setTimeout(100);
    }
    if (image) {
      logs = execFileSync("docker", ["logs", resources.container!], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      await runDeploymentSmoke({
        base,
        cookie: `parcelis_session_v2=${token}`,
        prisma,
        propertyId: property.id,
        tenantId: tenant.id,
        organizationId: organization.id,
      });
    }
    const input = encodeURIComponent(JSON.stringify({ id: invoice.id }));
    const response = await fetch(`${base}/trpc/invoices.pdf?input=${input}`, {
      headers: { cookie: `parcelis_session_v2=${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, logs);
    const payload = (await response.json()) as { result: { data: { contentBase64: string; fileName: string } } };
    const pdf = Buffer.from(payload.result.data.contentBase64, "base64");
    assert.equal(payload.result.data.fileName, `invoice-${String(invoice.invoiceNumber).padStart(7, "0")}.pdf`);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 5000);
    assert.match(pdf.toString("latin1"), /\/FontFile2\b/);
    assert.match(pdf.toString("latin1"), /Inter/);
    assert.ok(
      (pdf.toString("latin1").match(/\/Subtype \/Image\b/g) ?? []).length >= 2,
      "Brand images must be included.",
    );
    if (process.env.API_TEST_ARTIFACT_DIR) {
      await mkdir(process.env.API_TEST_ARTIFACT_DIR, { recursive: true });
      await writeFile(resolve(process.env.API_TEST_ARTIFACT_DIR, "invoice-next-api.pdf"), pdf);
    }
  },
);
