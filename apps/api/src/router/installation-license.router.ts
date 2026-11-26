import { randomBytes, randomUUID } from "node:crypto";
import { initializeInstallationIdentity, installationRecordId, type PrismaClient } from "@parcelis/db";
import { activateInstallationLicenseSchema, type ActivateInstallationLicense } from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
import { requireAdministrator, requireOrganizationAdministrator } from "../modules/authorization";
import { consumeLoginRateLimit } from "../modules/login-rate-limit";
import { syncAccountsLicense, unlinkAccountsInstallation } from "../modules/parcelis-accounts-license";
import { organizationProcedure, router } from "./trpc";

const statusFields = { tier: true, lastSyncedAt: true, validUntil: true, inactive: true } as const;

function planStatus(
  license:
    | {
        tier: string | null;
        lastSyncedAt: Date | null;
        validUntil: Date | null;
        inactive: boolean;
      }
    | null
    | undefined,
) {
  const state: "unlinked" | "inactive" | "active" | "expired" = !license?.lastSyncedAt
    ? "unlinked"
    : license.inactive
      ? "inactive"
      : license.validUntil && license.validUntil.getTime() > Date.now() && license.tier
        ? "active"
        : "expired";

  return {
    state,
    tier: state === "active" ? (license?.tier ?? "free") : "free",
    lastSyncedAt: license?.lastSyncedAt?.toISOString() ?? null,
  };
}

const readProcedure = organizationProcedure.use(({ ctx, next }) => {
  requireOrganizationAdministrator(ctx.organization.role);
  return next();
});
const manageProcedure = readProcedure.use(async ({ ctx, next }) => {
  requireAdministrator(ctx.user.role);
  consumeLoginRateLimit(`installation-license:${ctx.user.id}`);
  return next();
});

async function changeLicense(prisma: PrismaClient, action?: ActivateInstallationLicense | "unlink") {
  const activation = typeof action === "object" ? action : undefined;
  const identity = activation
    ? await initializeInstallationIdentity(prisma)
    : await prisma.installation.findUnique({ where: { id: installationRecordId } });
  if (!identity) {
    if (action === "unlink") return planStatus(null);
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activate the installation first." });
  }

  const { installationId } = identity;
  const where = { installationId };
  const current = activation
    ? await prisma.installationLicense.upsert({
        where,
        create: { installationId, credential: randomBytes(32).toString("base64url") },
        update: { installationId },
        select: { lastSyncedAt: true },
      })
    : await prisma.installationLicense.findUnique({ where, select: { lastSyncedAt: true } });

  if (action === "unlink" && !current?.lastSyncedAt) return planStatus(null);
  if (activation ? current?.lastSyncedAt : !current?.lastSyncedAt) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: activation
        ? "This installation is already linked. Use Refresh to sync its plan."
        : "Activate the installation first.",
    });
  }
  if (!current) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activate the installation first." });

  const operationId = randomUUID();
  const now = new Date();
  const claim = await prisma.installationLicense.updateMany({
    where: {
      ...where,
      lastSyncedAt: activation ? null : { not: null },
      OR: [{ operationUntil: null }, { operationUntil: { lte: now } }],
    },
    data: { operationId, operationUntil: new Date(now.getTime() + 30_000) },
  });
  if (!claim.count)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Another license request just ran or is still in progress. Try again.",
    });

  const claimed = { ...where, operationId };
  try {
    const registration = await prisma.installationLicense.findUnique({
      where,
      select: { registrationId: true, credential: true, operationId: true },
    });
    if (!registration && action !== "unlink") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activate the installation first." });
    }
    if (registration?.operationId !== operationId) {
      throw new TRPCError({ code: "CONFLICT", message: "A newer license request is in progress. Try again." });
    }

    const registrationId = registration.registrationId ?? installationId;
    const clearedLicense = { signedLicense: null, tier: null, validUntil: null };
    let changes;
    if (action === "unlink") {
      await unlinkAccountsInstallation(registrationId, registration.credential);
      changes = {
        ...clearedLicense,
        inactive: false,
        lastSyncedAt: null,
        registrationId: randomUUID(),
        credential: randomBytes(32).toString("base64url"),
      };
    } else {
      const response = await syncAccountsLicense(registrationId, registration.credential, activation);
      changes =
        response.kind === "inactive"
          ? { ...clearedLicense, inactive: true, lastSyncedAt: new Date() }
          : {
              inactive: false,
              signedLicense: response.signedLicense,
              tier: response.tier,
              validUntil: response.validUntil,
              lastSyncedAt: new Date(),
            };
    }
    const saved = await prisma.installationLicense.updateMany({
      where: claimed,
      data: { ...changes, operationId: null, operationUntil: null },
    });
    if (!saved.count)
      throw new TRPCError({ code: "CONFLICT", message: "A newer license request is in progress. Try again." });
  } finally {
    await prisma.installationLicense.updateMany({
      where: claimed,
      data: { operationId: null, operationUntil: null },
    });
  }

  return planStatus(await prisma.installationLicense.findUnique({ where, select: statusFields }));
}

async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn’t read or save the license." });
  }
}

export const installationLicenseRouter = router({
  status: readProcedure.query(({ ctx }) =>
    safely(async () => {
      const identity = await ctx.prisma.installation.findUnique({
        where: { id: installationRecordId },
        select: { license: { select: statusFields } },
      });
      return planStatus(identity?.license);
    }),
  ),
  activate: manageProcedure
    .input(activateInstallationLicenseSchema)
    .mutation(({ ctx, input }) => safely(() => changeLicense(ctx.prisma, input))),
  refresh: manageProcedure.mutation(({ ctx }) => safely(() => changeLicense(ctx.prisma))),
  unlink: manageProcedure.mutation(({ ctx }) => safely(() => changeLicense(ctx.prisma, "unlink"))),
});
