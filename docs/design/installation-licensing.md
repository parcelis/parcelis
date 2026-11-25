# Parcelis Installation Licensing Design

Read this from the top to understand what must exist first, where a click goes, and why the app waits before it changes the displayed plan. The design has three parts. Settings handles the user interaction. The self-hosted API owns the installation identity and the verified local license. Parcelis Portal owns the tenant plan and remote registration. The Portal files live in parcelis-accounts. The self-hosted API and UI live in parcelis. Each **Code walkthrough** section links to the source and explains the order of the selected lines.

| Component | Responsibility |
| --- | --- |
| Browser | Displays the Installation page and sends signed-in tRPC requests to the self-hosted app. |
| Self-hosted API and PostgreSQL | Store the permanent support ID, private credential, signed license, and last successful sync. |
| Parcelis Portal and D1 | Issue activation codes, register installations, sign the tenant tier, and retain registration history. |

## Deployment order

1. **Prepare the Portal.** Apply the Portal licensing migrations, including 0002_licensing.sql and 0003_one_installation_per_tenant.sql. Configure its ES256 signer and deploy the key discovery, activate, refresh, and unlink routes. Key discovery must be available before the app can redeem a code.

2. **Apply the self-hosted schema.** Run the Prisma migrations in filename order. The identity migration creates Installation, the license migration adds the related InstallationLicense table, and the final migration adds registrationId for re-linking without changing the local support ID.

   *Files:* packages/db/prisma/migrations/20261124000000_add_installation_identity, 20261125000000_add_installation_license, and 20261125010000_separate_license_registration_id

3. **Set the metadata and prepare the build.** Set the API’s NEXTAUTH_URL to the address users open. Generate Prisma Client from schema.prisma, or use the matching release image. The API build reads the app version from `apps/web/package.json`. Dockerfile.app copies that manifest into the API build stage.

   *Files:* Dockerfile.app  •  apps/web/package.json  •  packages/db/prisma/schema.prisma

4. **Start the API and web app.** Start the matching build after the target database is migrated and its configuration is set. Reload an already-running API so it picks up the regenerated client. Then open Installation settings.

## The Settings page and the installation ID

### What runs when you open Settings

1. **Follow the route.** settings-rail.tsx links to Settings → Organization → Installation. The route’s page.tsx loads the current user and calls organizations.installationIdentity. It displays the app version and the copyable support ID, and mounts license-cards.tsx when the installation details load.

   *Files:* apps/web/components/settings-rail.tsx  •  apps/web/app/(authenticated)/settings/organization/installation/

2. **Follow the API request.** components/api-client.ts sends the call to /trpc. The web Next config proxies it to the API. The API’s tRPC route builds session and organization context, then dispatches through app.router.ts. The procedure checks the active organization role before reading the installation row.

   *Files:* apps/web/next.config.ts  •  apps/api/src/app/trpc/[trpc]/route.ts  •  apps/api/src/router/app.router.ts

3. **Read the license from PostgreSQL.** license-cards.tsx calls installationLicense.status. The license router derives the displayed state and tier from its saved fields, so opening the page does not contact the Portal. Organization owners and administrators can read the details. Only installation administrators can activate, refresh, or unlink.

   *Files:* apps/api/src/router/installation-license.router.ts

### What creates the support ID

packages/db/src/installation.ts defines initializeInstallationIdentity. It looks up the fixed row key installation and creates a UUID only when that row is missing. Registration calls it inside the same transaction as account setup. The administrator seed path also calls it. Activation can initialize it for an older installation that has no row. The settings query only reads it.

### Three values with different jobs

| Value | What happens to it |
| --- | --- |
| Support ID | Permanent UUID stored in Installation. The user can copy it. It survives unlinking and re-linking. |
| Portal registration ID | Initially the support UUID. After confirmed unlink, a fresh registration ID is saved for the next link. |
| Private credential | 32 random bytes encoded as base64url. Parcelis stores the credential server-side. The Portal stores its digest. |

### Code walkthrough for loading Settings

**Start in the page.** The current-user and identity queries can run in parallel. The identity result supplies the URL preview, version, and support ID. The page renders the license cards after the identity query succeeds. The cards then fetch `installationLicense.status` separately.

[page.tsx](../../apps/web/app/%28authenticated%29/settings/organization/installation/page.tsx#L26-L36)

```ts
const pathname = usePathname();
const currentUserQuery = useQuery({
  queryKey: queryKeys.auth.me,
  queryFn: () => apiClient.auth.me.query(),
});
const installationQuery = useQuery({
  queryKey: ["organizations", "installation-identity", pathname],
  queryFn: () => apiClient.organizations.installationIdentity.query(),
  retry: false,
});
const installationId = installationQuery.data?.installationId;
```

**Follow the identity query to the router.** `organizationProcedure` supplies the signed-in user and selected organization. The role check runs before the database lookup. A missing row returns a null ID, so opening Settings cannot create one by accident.

[app.router.ts](../../apps/api/src/router/app.router.ts#L906-L919)

```ts
installationIdentity: organizationProcedure.query(async ({ ctx }) => {
  requireOrganizationAdministrator(ctx.organization.role);

  const installation = await ctx.prisma.installation.findUnique({
    where: { id: installationRecordId },
    select: { installationId: true },
  });
  const { url, version } = getInstallationMetadata();
  return {
    installationId: installation?.installationId ?? null,
    installationUrl: url ?? null,
    releaseVersion: version ?? null,
  };
}),
```

**Follow the write path separately.** Registration passes its open transaction to this helper. Activation can also call it directly. The fixed lookup key and upsert preserve the UUID, including when two first-time requests race. The update branch only writes the same lookup key.

[installation.ts](../../packages/db/src/installation.ts#L4-L15)

```ts
export const installationRecordId = "installation";

export async function initializeInstallationIdentity(prisma: Pick<PrismaClient, "installation">) {
  const existing = await prisma.installation.findUnique({ where: { id: installationRecordId } });
  if (existing) return existing;

  return prisma.installation.upsert({
    where: { id: installationRecordId },
    create: { id: installationRecordId, installationId: randomUUID() },
    update: { id: installationRecordId },
  });
}
```

## Activation from the code to the plan

1. **Generate the code in Parcelis Portal.** A tenant owner opens the tenant’s activation dialog. The Portal action checks tenant ownership through its SQL, issues a code valid for 24 hours, and stores its digest. This happens before the self-hosted admin can submit the activation form.

   *Files:* Parcelis Portal  •  components/tenant-view.tsx → components/forms.tsx → lib/actions.ts → lib/activation-sql.ts

2. **Submit from the self-hosted app.** In license-cards.tsx, the admin enters Installation name, Environment, and Activation code and reviews Installation URL. The shared schema validates the three editable fields. The server also validates the request and checks that the caller may manage licensing.

   *Files:* Self-hosted app  •  license-cards.tsx → packages/schemas/src/installation-license.ts → installation-license.router.ts

3. **Save the credential before calling the Portal.** The router gets or creates the support ID and upserts a local InstallationLicense row. It claims a short operation lease so another request cannot write the same license concurrently. Retrying activation uses the same registration ID and credential. This matters if the Portal accepts the code but the response is lost.

4. **Discover the keys and send activation.** parcelis-accounts-license.ts fetches /.well-known/parcelis-license-keys.json first. If the keys are unavailable, it stops before sending the one-time code. Otherwise it posts the registration ID, credential, code, name, environment, and the server-derived URL and version to /api/installations/activate.

   *Files:* Self-hosted app  •  apps/api/src/modules/parcelis-accounts-license.ts and installation-metadata.ts

5. **Register and sign in the Portal.** The activation route validates the request, hashes the code and credential, and prepares a signed response using the tenant’s tier and a seven-day expiry. Its SQL claims the registration, then verifies that the saved row matches the registration ID, credential, and code. An exact retry can return the existing successful link. The route delivers the snapshot only after confirming the registration.

   *Files:* Parcelis Portal  •  app/api/installations/activate/route.ts → lib/activation-sql.ts and lib/tokens.ts

6. **Verify locally before changing the UI.** The API checks the ES256 signature, signing key, issuer, audience, registration ID, expiry, and matching tier and expiry metadata. Only then does it save the signed license, tier, expiry, and sync timestamp. The form clears, the License key field shows a fixed mask, and the Plan card displays the verified tier.

### Code walkthrough for activation

**1. Issue the code in the Portal.** `issueCode` is a server action. The SQL uses the caller’s user ID to check ownership and stores the digest of the original code. The Portal returns the original code so the owner can paste it into the self-hosted app.

[Portal actions.ts](https://github.com/parcelis/parcelis-portal/blob/af1d6c8552fa8d5792330f483b7cee04597cd608/lib/actions.ts#L46-L52)

```ts
const code = `plc_${randomToken(24)}`;
const expiresAt = now() + 24 * 3600;
const result = await env.DB.prepare(issueActivationCode)
  .bind(crypto.randomUUID(), await digest(code), expiresAt, user.id, tenantId, replacesId).run();
return result.meta.changes
  ? { code, expiresAt }
  : { error: "The installation or license status changed. Refresh the page before generating a code." };
```

**2. Validate before the browser sends the mutation.** `safeParse` stops a bad form submission early. The backend validates the same input again through the router’s `.input(activateInstallationLicenseSchema)`. UI validation gives immediate feedback, while server validation and `manageProcedure` enforce the request requirements.

[license-cards.tsx](../../apps/web/app/%28authenticated%29/settings/organization/installation/license-cards.tsx#L69-L81)

```ts
const fields = new FormData(form);
const input = activateInstallationLicenseSchema.safeParse(Object.fromEntries(fields));
if (!input.success) {
  setActivationError(input.error.issues[0]?.message ?? "Check your activation details.");
  return;
}

setActivationError(null);
try {
  const result = await activate.mutateAsync(input.data);
  form.reset();
  queryClient.setQueryData(queryKey, result);
  void queryClient.invalidateQueries({ queryKey: ["organizations", "installation-identity"] });
```

**3. Save the private credential before the remote request.** The create branch generates it only when the license row is new. The update branch preserves any existing credential. Next, the router takes a 30-second database claim using `operationId` and `operationUntil`. It checks that claim again on save so a delayed response cannot overwrite a newer operation.

[installation-license.router.ts](../../apps/api/src/router/installation-license.router.ts#L58-L66)

```ts
const { installationId } = identity;
const where = { installationId };
const current = activation
  ? await prisma.installationLicense.upsert({
      where,
      create: { installationId, credential: randomBytes(32).toString("base64url") },
      update: { installationId },
    })
  : await prisma.installationLicense.findUnique({ where });
```

[installation-license.router.ts](../../apps/api/src/router/installation-license.router.ts#L79-L93)

```ts
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
```

**4. Check the signing keys before sending a one-time code.** Activation stops early if public key discovery fails. The URL and version come from server configuration, so the form sends only its editable fields. The same client uses a bearer credential for refresh and sends just the metadata in the request body.

[parcelis-accounts-license.ts](../../apps/api/src/modules/parcelis-accounts-license.ts#L105-L124)

```ts
const activationKeys = activation ? await loadSigningKeys() : undefined;
const { url, version } = getInstallationMetadata();

let response: Response;
let body: unknown;
try {
  const path = activation ? "activate" : `${encodeURIComponent(installationId)}/refresh`;
  response = await request(`${parcelisAccountsOrigin}/api/installations/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(!activation && { Authorization: `Bearer ${credential}` }),
    },
    body: JSON.stringify(
      activation ? { ...activation, id: installationId, credential, url, version } : { url, version },
    ),
    redirect: "error",
    signal: timeout,
  });
  body = await response.json();
```

**5. Confirm the Portal registration before returning the snapshot.** The Portal prepares the signed snapshot, attempts to claim the registration, and checks the saved row before returning it. `recoverActivation` matches the registration ID, credential digest, and code digest. That check makes a retry safe if the first response was lost.

[Portal route.ts](https://github.com/parcelis/parcelis-portal/blob/af1d6c8552fa8d5792330f483b7cee04597cd608/app/api/installations/activate/route.ts#L24-L34)

```ts
const { id, credential, code, name, environment, url, version } = input.data;
const [credentialDigest, codeDigest] = await Promise.all([digest(credential), digest(code)]);
const db = env.DB.withSession("first-primary");
const claims = await db.prepare(getActivationLicense).bind(codeDigest).first<Omit<LicenseClaims, "id">>();
if (!claims) return json({ error: "activation_unavailable" }, 409);
const snapshot = await signer({ id, ...claims });

await db.prepare(claimInstallation).bind(id, credentialDigest, name, environment, url ?? null, version ?? null, codeDigest).run();
const registered = await db.prepare(recoverActivation).bind(id, credentialDigest, codeDigest).first();
if (!registered) return json({ error: "activation_unavailable" }, 409);
return json({ installationId: id, ...snapshot });
```

## Refresh and plan changes

1. **Click Refresh after activation.** The Plan card calls installationLicense.refresh. The router checks permissions, loads the current registration and credential, and claims the same operation lease. No activation code is needed.

2. **Send current installation metadata.** The server posts to /api/installations/{id}/refresh with the credential as a bearer token and the current url and version in the JSON body. installation-metadata.ts reads NEXTAUTH_URL and the web package version. It omits unsafe URLs, such as values with credentials, queries, or fragments.

   *Files:* Self-hosted app  •  license-cards.tsx → installation-license.router.ts → parcelis-accounts-license.ts → installation-metadata.ts

3. **Update the Portal registration first.** The refresh route authenticates the credential digest and checks the active registration and license. recordRefresh updates the Portal’s last seen time and any supplied URL or version, then reads the current tier. Omitted metadata leaves the prior values in place. The Portal signs a new snapshot.

   *Files:* Parcelis Portal  •  app/api/installations/[id]/refresh/route.ts → lib/activation-sql.ts → lib/tokens.ts

4. **Verify and save the response.** The API loads the public signing keys for the response, verifies the snapshot, then saves the new tier and local sync timestamp. The UI replaces the cached Plan status. An updated tenant tier therefore appears after a successful refresh.

### What a failed refresh changes

| Result | Local behavior |
| --- | --- |
| Network or verification failure | Shows an error and retains the previous verified snapshot and sync time until its expiry. |
| Confirmed inactive response | An Accounts 403 with license_inactive clears the cached license and moves the app to Free. |
| Saved license expires | Status returns Free and shows an expired license. An administrator can retry Refresh. |

The Portal’s last seen time records its successful database update. The app’s Last synced time records a response the app verified and saved. Those timestamps can differ when the Portal updates metadata but the app cannot verify the response.

### Code walkthrough for refresh and verification

**1. Read the current build metadata.** The helper reads `NEXTAUTH_URL` and validates the URL before returning it. Every build reports the version from the web package manifest. Refresh uses this helper on every request, so an upgrade does not require another activation code.

[installation-metadata.ts](../../apps/api/src/modules/installation-metadata.ts#L1-L16)

```ts
import webPackage from "../../../web/package.json" with { type: "json" };

export function getInstallationMetadata(env: Readonly<Record<string, string | undefined>> = process.env) {
  const publicUrl = URL.parse(env.NEXTAUTH_URL?.trim() ?? "");
  const url =
    publicUrl &&
    (publicUrl.protocol === "https:" || publicUrl.protocol === "http:") &&
    !publicUrl.username &&
    !publicUrl.password &&
    !publicUrl.search &&
    !publicUrl.hash &&
    publicUrl.href.length <= 2048
      ? publicUrl.href
      : undefined;
  return { url, version: webPackage.version };
}
```

**2. Follow the request into D1.** The Portal handler binds the registration ID, credential digest, version, and URL in that order. The `WHERE` clause requires an active installation and a license that has not been revoked. `coalesce` preserves existing metadata when a field is omitted.

[Portal activation-sql.ts](https://github.com/parcelis/parcelis-portal/blob/af1d6c8552fa8d5792330f483b7cee04597cd608/lib/activation-sql.ts#L44-L50)

```sql
UPDATE "Installation"
SET "lastSeenAt" = unixepoch(), "version" = coalesce(?3, "version"), "url" = coalesce(?4, "url")
WHERE "id" = ?1 AND "credentialDigest" = ?2 AND "deactivatedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "License" l WHERE l."id" = "Installation"."licenseId" AND l."revokedAt" IS NULL)
RETURNING "id", "licenseId",
  (SELECT "tier" FROM "License" WHERE "id" = "licenseId") AS "tier",
  (SELECT "installationCap" FROM "License" WHERE "id" = "licenseId") AS "installationCap"
```

**3. Trust the signed claims before updating the plan.** The verifier checks the ES256 signature before decoding the claims. It then checks that the JWT and response identify the requested registration and that the response tier and expiry match the signed claims. A bad signature or incorrect claim stops the operation before the router can save a replacement license.

[parcelis-accounts-license.ts](../../apps/api/src/modules/parcelis-accounts-license.ts#L53-L76)

```ts
const signature = Buffer.from(signaturePart, "base64url");
if (
  signature.length !== 64 ||
  !verify("sha256", Buffer.from(`${headerPart}.${claimsPart}`), { key, dsaEncoding: "ieee-p1363" }, signature)
) {
  throw new Error("Invalid license signature");
}

const claims = jwtClaims.parse(decode(claimsPart));
const nowSeconds = Math.floor(now / 1000);
if (
  claims.sub !== installationId ||
  snapshot.installationId !== installationId ||
  claims.tier !== snapshot.tier ||
  claims.iat > nowSeconds + 60 ||
  claims.exp <= nowSeconds ||
  claims.exp <= claims.iat ||
  claims.exp - claims.iat > sevenDays ||
  claims.exp * 1000 !== Date.parse(snapshot.validUntil)
) {
  throw new Error("Invalid license claims");
}

return { signedLicense: snapshot.license, tier: claims.tier, validUntil: new Date(claims.exp * 1000) };
```

**4. Write the verified response under the same claim.** After successful verification, the router writes the snapshot, tier, expiry, and a new local sync time. A confirmed inactive response clears the cached license. The conditional write prevents a stale operation from changing either result.

[installation-license.router.ts](../../apps/api/src/router/installation-license.router.ts#L110-L127)

```ts
  const response = await syncAccountsLicense(registrationId, current.credential, activation);
  changes =
    response.kind === "inactive"
      ? { ...clearedLicense, inactive: true }
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
```

## Unlink and link again

1. **Confirm the unlink in Settings.** When linked, license-cards.tsx shows a masked, read-only License key field and a disabled Activate button. An installation administrator selects Unlink installation and confirms. The mask contains no credential or signed license.

2. **Use the current registration to call the Portal.** installation-license.router.ts authorizes the admin and claims the operation lease. parcelis-accounts-license.ts posts to /api/installations/{id}/unlink with the current registration ID and private bearer credential.

3. **Deactivate without deleting history.** The Portal hashes the credential and updates the matching D1 registration’s deactivation time. The Portal returns 204 when the operation succeeds. An exact retry still returns 204 and preserves the original deactivation time.

   *Files:* Parcelis Portal  •  app/api/installations/[id]/unlink/route.ts → lib/unlink-installation.ts

4. **Clear the local license after confirmation.** Only after the 204 does the API clear the signed snapshot, tier, expiry, and sync time. It creates a fresh registration ID and credential for the next link and leaves the local support ID alone. The browser returns to Free and shows the activation form.

5. **Generate a new code to link again.** Repeat the activation sequence with a new code. The Portal retains the old registration in history, while the new UUID creates a distinct registration for the same self-hosted installation.

### Code walkthrough for unlink and reactivation

**1. Match the current registration and credential in the Portal.** The route hashes the bearer credential before running this query and returns HTTP 204 only when a registration matched. The first request sets the deactivation time. A retry keeps that time and can still confirm success.

[Portal unlink-installation.ts](https://github.com/parcelis/parcelis-portal/blob/af1d6c8552fa8d5792330f483b7cee04597cd608/lib/unlink-installation.ts#L2-L5)

```sql
UPDATE "Installation"
SET "deactivatedAt" = coalesce("deactivatedAt", unixepoch())
WHERE "id" = ?1 AND "credentialDigest" = ?2
RETURNING "id"
```

**2. Wait for HTTP 204 before changing local state.** `unlinkAccountsInstallation` throws on other responses. The `await` therefore keeps the local license intact when the portal route is missing or the request fails. On success, the router clears the snapshot and creates a fresh Portal registration ID and credential. The support ID remains the key used to find the local row.

[installation-license.router.ts](../../apps/api/src/router/installation-license.router.ts#L97-L108)

```ts
const registrationId = current.registrationId ?? installationId;
const clearedLicense = { signedLicense: null, tier: null, validUntil: null };
let changes;
if (action === "unlink") {
  await unlinkAccountsInstallation(registrationId, current.credential);
  changes = {
    ...clearedLicense,
    inactive: false,
    lastSyncedAt: null,
    registrationId: randomUUID(),
    credential: randomBytes(32).toString("base64url"),
  };
```

**3. Switch the browser back to the activation form.** The browser replaces its cached status only after the mutation resolves. The resulting `unlinked` state shows the Free plan and lets the admin enter a new Portal code. The server never sends the signed license or private credential to the browser.

### Where to start when something fails

**Installation details fail to load.** Check that the identity migration exists in the target database and the running API uses its regenerated Prisma client.

**URL or version stays stale in the Portal.** Check the running API’s NEXTAUTH_URL and version source, then check that the deployed Portal refresh route accepts and saves both fields.

**Unlink returns 404.** Check deployment of the Portal unlink route. The self-hosted app keeps its local link unless the Portal confirms the unlink.

*Files:* Regression coverage  •  apps/api/src/tests/installation/installation-license.integration.ts  •  Parcelis Portal tests/unlink-installation.test.mjs
