# Contributing to Parcelis

Thanks for contributing to Parcelis. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Contributor License Agreement

By submitting a contribution, you accept the [Contributor License Agreement](CLA.md). It lets
Parcelis use and relicense contributions while you retain ownership. If you contribute for an
organization, ensure that you are authorized to accept the agreement on its behalf.

## Issues

Search existing issues before opening a new one. Use the matching GitHub issue form for feature
requests, bug reports, or documentation changes, and complete its required fields. For new
features, wait for maintainer approval before opening a pull request. Adding the
`ready for development` label removes the approval notice from the feature issue body;
removing the label restores it. Approval also creates or links a Kanban card.

## Commit messages

Parcelis uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Write commit subjects in this form:

```text
type(optional-scope): short imperative description
```

Use lowercase types. The allowed types are:

- `feat`: a new user-facing capability.
- `fix`: a bug correction.
- `docs`: documentation-only changes.
- `refactor`: code restructuring without changing behavior.
- `test`: test additions or corrections.
- `perf`: a performance improvement.
- `build`: build system or dependency changes.
- `ci`: continuous-integration changes.
- `chore`: maintenance that does not fit another type.
- `merge`: integrates another branch.
- `revert`: reverses an earlier change.

Scopes are optional. When useful, use a concise area of the monorepo, such as `web`, `api`, `db`, `ui`, `docs`, or `infra`.

```text
feat(web): add property filters
fix(api): reject duplicate unit names
docs: explain production deployment
ci: validate pull request commit messages
```

Indicate a breaking change with `!` before the colon or a `BREAKING CHANGE:` footer:

```text
feat(api)!: rename the properties endpoint

BREAKING CHANGE: clients must use the new endpoint name.
```

Pull requests validate every commit message in CI. If the repository uses squash merging, make the pull-request title follow the same format because it becomes the final commit message.

## Development

Keep changes focused, run the relevant checks, and update user-facing documentation with workflow changes.

CI runs script tests, lint, type checks, and the application build on every pull request and push
to `main`. Docker builds and container smoke tests are not part of PR CI. The release workflow
builds and publishes Docker images when a GitHub release is published.

### Secret scanning

The `Gitleaks / Gitleaks` check runs on pull requests, pushes to `main`, daily at
04:23 UTC, and manual dispatch. PRs from this repository use the pinned Gitleaks
action to scan their commits. Pushes, scheduled runs, manual runs, and fork or
Dependabot PRs scan the fetched history. Checkout fetches all history and does not
persist credentials. Findings and scanner errors fail the check. Logs redact
detected secrets. The action posts review comments for findings on same-repository
PRs and writes a job summary; report artifacts are disabled. Only the same-repository
PR commenting job requests `pull-requests: write`. Push, scheduled, manual, fork,
and Dependabot scans use a read-only token. The final `Gitleaks` check requires the
selected scan to succeed, keeping the required check name consistent across triggers.

To investigate a failure, open the PR's Gitleaks check, select **Details**, and expand
the failed scan step. Findings include the rule, file, line, commit, and fingerprint.
License, download, and other scanner errors also appear in the step logs and may
prevent a findings comment or summary. Fork and Dependabot findings appear in the
verbose, redacted logs instead of PR comments.

Fork and Dependabot PRs use the checksum-verified Gitleaks CLI without the organization
license or other Actions secrets. The workflow uses `pull_request`, never
`pull_request_target`, and does not install dependencies or execute repository code.
GitHub may require maintainer approval before running workflows for first-time contributors.

To reproduce a history scan, install [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
fetch the relevant history, and run from the repository root:

```bash
gitleaks git --redact --log-opts=--all
```

If a finding is a real credential, revoke or rotate it immediately and remove it
from the code. Deleting it in a later commit does not undo exposure. Coordinate any
history cleanup with maintainers. Never paste credentials into an issue or PR.
For a confirmed false positive, add only its exact fingerprint to `.gitleaksignore`
with a comment explaining why it is safe. Do not exclude whole directories or rules.
Changes to scanner configuration and exclusions require careful review.

The initial Gitleaks 8.30.1 full-history review found 91 false positives, recorded as
exact commit/file/rule/line fingerprints in `.gitleaksignore`: 18 display-only API token
prefix fixtures, 14 lease draft UUID fixtures, 57 compressed JSON API documentation
fields, and two matches spanning architecture prose about password hashing and S3.
No real credentials were identified in those findings. New occurrences still require review.

A subsequent PR review confirmed 18 additional compressed API metadata matches in
commit `8812a14`; their exact fingerprints are also recorded in `.gitleaksignore`.
Rewriting commits changes these fingerprints even when the file contents are identical.
To avoid repeated metadata findings, `.gitleaks.toml` extends the default rules and
adds an allowlist only to `generic-api-key`: both the generated `.api.mdx` path and
the `api: eJ...` zlib/base64 match format must match. Other fields, paths, and secret
rules remain scanned. Keep credentials out of the source API specification. A second
rule-scoped allowlist matches only the three reviewed display-only `tokenPrefix`
fixture values in the API token test files, so those also survive commit rewrites.

Before rollout, maintainers must:

1. Obtain the organization action license from [Gitleaks](https://gitleaks.io/) and
   configure `GITLEAKS_LICENSE` as a repository Actions secret, or an organization
   Actions secret with access granted to this repository. Missing licenses fail
   licensed runs; the CLI fallback is limited to fork and Dependabot PRs.
2. Run the workflow manually and verify a clean licensed scan. Verify a clean fork
   PR and a disposable fork PR containing a synthetic detectable token; the latter
   must fail. Never use a real credential for this test or merge the test branch.
3. After validating the runs, require `Gitleaks` in the branch ruleset. Scheduled
   runs start after the workflow reaches the default branch.

### Repository structure

Apps:

- `apps/web`: Next.js App Router frontend.
- `apps/api`: separate Next.js API serving tRPC, REST, and Bull Board.
- `apps/docs`: Docusaurus documentation site for platform and contributor guides.

The API commands run Next.js on port 40010. `build` creates the production Next.js
build; `typecheck` checks the API routes, modules, and tests. For direct API previews,
include the Redis settings from `.env.example` in your `.env`; the full development
launcher supplies these automatically. Stop the existing development processes
before restarting.

Run API commands through pnpm's filter. The API launcher sets `PARCELIS_API_ROOT`
to its absolute application directory so PDF fonts and brand images resolve independently
of the working directory. Direct source imports use the invoice module's location.
The production launcher drains requests, closes Next.js,
then closes initialized Redis queues and Prisma clients. It allows 15 seconds for
shutdown; Docker and Supervisor allow additional time before killing the process.
Shutdown closes upgraded sockets, including development HMR connections, while ordinary HTTP requests drain.
Production rejects HTTP upgrades immediately; development forwards them to Next.js for HMR.

Set `API_TRUST_PROXY_HOPS` only behind an enforced proxy boundary. The default `0`
ignores forwarded client IPs, so IP-based rate limits share the unknown-IP bucket.
The supplied production Compose stack has two nginx hops; use `2` only when public
API traffic exclusively follows that path. Adjust the count for any additional proxy.
The production environment example sets `2` for this stack.
Use decimal digits for the proxy count; empty values and other numeric formats are rejected.
The launcher validates this value before starting Next.js; changes require restarting the API.
`/settings/jobs`
continues to use the same-origin `/admin/jobs/` route with the selected API runtime.

Packages:

- `packages/ui`: shared Parcelis UI primitives and brand components.
- `packages/schemas`: shared Zod schemas for frontend and backend contracts.
- `packages/db`: Prisma schema, migrations, and database client exports.
- `packages/config`: shared TypeScript, ESLint, and Prettier configuration.

`@parcelis/db` exposes TypeScript source to native Node. Relative source imports must use the
actual `.ts` extension; the shared TypeScript configuration rewrites these to `.js` in builds.

### Local development

Install dependencies and run the apps on your machine with hot reload:

```bash
pnpm install
cp .env.example .env
# Set a unique, 12+ character SEED_ADMIN_PASSWORD in .env
# Generate NEXTAUTH_SECRET with: openssl rand -base64 32
docker compose -f docker-compose-dev.yml up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Set `NEXTAUTH_URL` in `.env` to the public browser origin (normally `http://localhost` through nginx). When using the web app's port directly, include that port. The web app forwards `/api/auth/*` to the API. NextAuth uses host-only cookies and enables Secure when `NEXTAUTH_URL` is HTTPS; the old `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SECURE`, and `AUTH_DISABLED` overrides are removed. Use the same private, stable `NEXTAUTH_SECRET` in the web and API processes; changing it invalidates NextAuth cookies. NextAuth JWT sessions have a seven-day rolling expiry: checking the session renews it for another seven days. There is no separate server-enforced idle timeout or database session record. Cookies from the previous session implementation require signing in again using existing credentials.

A missing or blank `NEXTAUTH_SECRET` disables NextAuth sign-in. The login page displays a service-unavailable message; the API logs the missing setting. Restore the original secret and restart `pnpm dev` to resume existing sessions, or generate a new secret to require users to sign in again.

#### What `pnpm dev` starts

`pnpm dev` starts the web, API, docs, React Email preview, shared jobs compiler, and worker apps with hot reload. It also starts nginx, PostgreSQL, Redis, MinIO, and the one-shot MinIO initialization job, so Docker must be running. It stops existing listeners on the configured app ports and chooses the next open port only when needed.

Use nginx as the normal local entry point:

| Service              | URL                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Web app              | `http://localhost`                                                                                       |
| Documentation        | `http://localhost/docs/`                                                                                 |
| API                  | `http://localhost/api/v1`                                                                                |
| React Email previews | `http://templates.localhost/` by default; use `http://templates.localhost:<PROXY_PORT>/` when configured |

If `templates.localhost` does not resolve on your system, add `127.0.0.1 templates.localhost` to `/etc/hosts`.

The host processes and local services are also available directly:

| Service       | Address                  |
| ------------- | ------------------------ |
| Web app       | `http://localhost:30000` |
| Docs          | `http://localhost:40000` |
| API           | `http://localhost:40010` |
| Email preview | `http://localhost:30001` |
| PostgreSQL    | `localhost:54320`        |
| pgAdmin       | `http://localhost:8000`  |
| MinIO API     | `http://localhost:9001`  |
| MinIO console | `http://localhost:9010`  |
| Redis         | `localhost:63790`        |

#### Local database

Prisma commands run through `pnpm db:*` automatically load the root `.env`. If `DATABASE_URL` is unset, the API uses `postgresql://parcelis:parcelis@localhost:54320/parcelis?schema=public` only when `NODE_ENV` is `development` or `test`. Other environments require an explicit PostgreSQL URL; empty or invalid values fail startup.

pgAdmin is available at `http://localhost:8000` with `admin@parcelis.dev` / `parcelis`. The Parcelis database is preconfigured; use `parcelis` as its password when connecting for the first time.

Set `SEED_ADMIN_PASSWORD` to a unique password of at least 12 characters before the first `pnpm db:seed`. Set `SEED_ADMIN_EMAIL` to use an address other than the default `admin@parcelis.dev`. The seed creates the local administrator account without replacing an existing password.

The demo organization also includes **Demo active token** and **Demo revoked token**
for the API-token settings table, with creator, usage, expiration, and revocation
metadata. The active example does not expire. Their random secrets are discarded;
create a new token in settings for API testing. The examples are created only when
missing. Rerunning the seed preserves existing token values and does not duplicate
examples or change user-created tokens.

After pulling schema changes, run:

```bash
pnpm db:migrate
pnpm db:seed
```

#### Useful commands

- `pnpm dev:services:refresh`: recreate nginx, PostgreSQL, Redis, and MinIO while preserving their volumes, then rerun MinIO initialization.
- `pnpm --filter @parcelis/email email:preview`: run only the React Email template preview on `http://localhost:30001`.
- `pnpm email:verify`: verify the configured SMTP connection and authentication without sending an email.
- Stop an existing app watcher with `Ctrl+C` before starting another `pnpm dev` process.

### API tests

Keep API unit and router tests in feature folders under `apps/api/src/tests`, such as
`apps/api/src/tests/permissions`. Run the API suite with:

```bash
pnpm --filter @parcelis/api test
```

The durable outbox and worker dispatcher use the same Node test runner. Script tests also run in the CI quality job:

```bash
pnpm --filter @parcelis/db test
pnpm --filter @parcelis/worker test
pnpm test:scripts
```

The outbox PostgreSQL integration tests require a separate test database whose name
contains `test`. Create the database, then point `OUTBOX_TEST_DATABASE_URL` at it.
The tests compare normalized host, port, database, and schema against `DATABASE_URL`, ignoring credentials and unrelated connection parameters. Host aliases are not resolved, so use a genuinely separate test database. Each test creates a unique temporary schema from the current Prisma schema with `prisma db push` and drops it afterward; the test user needs schema creation privileges. Interrupted runs may leave isolated schemas, but subsequent runs do not claim their events. Unit test commands exclude integration suites:

```bash
createdb -h localhost -p 54320 -U parcelis parcelis_test
DATABASE_URL=postgresql://parcelis:parcelis@localhost:54320/parcelis_test?schema=public pnpm --filter @parcelis/db db:migrate
OUTBOX_TEST_DATABASE_URL=postgresql://parcelis:parcelis@localhost:54320/parcelis_test?schema=public pnpm --filter @parcelis/db test:integration
OUTBOX_TEST_DATABASE_URL=postgresql://parcelis:parcelis@localhost:54320/parcelis_test?schema=public pnpm --filter @parcelis/worker test:integration
```

API-token persistence and REST authentication tests use the same isolated-schema helper with
`API_TOKEN_TEST_DATABASE_URL`. They run separately from the ordinary API suite:

```bash
API_TOKEN_TEST_DATABASE_URL='postgresql://parcelis:parcelis@localhost:54320/parcelis_test?schema=public' pnpm --filter @parcelis/api exec tsx --test "src/tests/api-tokens/*.integration.ts"
```

The suite checks unique token hashes, creator/revoker deletion, organization
deletion, management permissions, pagination, credential secrecy, and concurrent
revocation. REST tests exercise every approved operation family against two
organizations, including foreign records, nested inputs, image ownership, and
last-used throttling. Object-storage calls are mocked; database operations use
PostgreSQL. The suites create tables from the current Prisma schema rather than replaying
migrations, and skip when the test URL is unset. To create the test database with
the development container, run
`docker compose -f docker-compose-dev.yml exec postgres-service createdb -U parcelis parcelis_test`
once after PostgreSQL is running; an existing test database can be reused.

The release integration suite also replays the additive token migration against
populated disposable tables. Set `API_TOKEN_ROLLBACK_API_ROOT` to the absolute path
of a trusted pre-token `apps/api` checkout with its dependencies installed to exercise
its REST Fetch route against the same schema. The rollback subtest is skipped only
when this variable is unset; an invalid path or missing dependencies makes it fail. See the
[API-token rollout runbook](apps/docs/content/getting-started/api-token-rollout.mdx)
for migration order, rollback limits, and the verification matrix.

The worker integration suite also includes a Redis recovery test. Set `OUTBOX_TEST_REDIS_URL` to a local Redis instance to run it; otherwise that test is skipped. It creates and removes only a uniquely named test queue. Check the mapped Redis port with `docker compose -f docker-compose-dev.yml ps`; `pnpm dev` can choose a different port from the `REDIS_PORT` requested in `.env`:

```bash
OUTBOX_TEST_REDIS_URL=redis://:parcelis-redis@localhost:63790 pnpm --filter @parcelis/worker test:integration
```

### End-to-end tests

Parcelis uses Playwright for browser-level tests. Install Chromium once after installing dependencies:

```bash
pnpm exec playwright install chromium
```

Run the suite with `pnpm test:e2e`. It starts the web app automatically unless `PLAYWRIGHT_TEST_BASE_URL` points to an existing environment. Use `pnpm test:e2e:ui` to run tests in Playwright UI mode.

Run API-token settings coverage with
`pnpm test:e2e tests/e2e/api-tokens.spec.ts --workers=1` against a local API and
seeded administrator. The suite creates two test credentials and revokes them in
cleanup; it checks that revocation rejects the next REST call while another token
remains valid. Permission, pagination, failure, clipboard, navigation, and delayed
response cases use controlled API responses after real session authentication.

The proxy-origin session test is skipped by default. Point `PLAYWRIGHT_TEST_BASE_URL` to the running proxy when running the full suite.

Playwright loads the root `.env` for local administrator credentials and database
settings. To watch tests against a running `pnpm dev` stack, use headed mode:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost PLAYWRIGHT_SLOW_MO=500 pnpm test:e2e tests/e2e/api-smoke.spec.ts --headed --workers=1
```

Authenticated tests require `SEED_ADMIN_PASSWORD` and optionally `SEED_ADMIN_EMAIL`
to match the local administrator account. Missing or empty passwords fail authenticated tests.
The API smoke tests check health,
unauthenticated rejection, authenticated tRPC/REST reads, and the embedded Bull Board
through the running proxy. Run lease write tests against disposable
test data; several existing draft tests modify the selected unit's drafts.

The local property write smoke tests create their own uniquely named properties,
update property details and create/edit notes through the browser, and upload,
display, and delete an image. They verify changes after reloading and remove their
test images, notes, and properties afterward:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost PLAYWRIGHT_SLOW_MO=800 pnpm test:e2e tests/e2e/property-notes.spec.ts tests/e2e/property-image.spec.ts --headed --workers=1
```

To check the production invoice PDF route, build the API first, then run the opt-in
integration test from `apps/api` against local PostgreSQL:

```bash
pnpm --filter @parcelis/api build
cd apps/api
API_HTTP_INTEGRATION_TEST=1 node --env-file=../../.env --import tsx --test src/tests/invoices/invoice-pdf.http.integration.test.ts
```

The test creates an isolated schema, starts a temporary production Next.js API,
checks embedded fonts and branding, and removes the schema and server afterward.
Set `API_TEST_ARTIFACT_DIR` to retain a sample PDF for visual inspection.

To run the combined deployment smoke batch, build `Dockerfile.app`, then set
`API_TEST_IMAGE` to its local image tag when running the same test. It also
checks the nginx/web/API proxy, native password login, REST, Bull Board assets and
Redis, image upload/deletion, concurrent lease finalization, and invoice payment.
The test maps `host.docker.internal` to Docker's host gateway to reach local dependencies
on Docker Desktop and Linux Docker hosts;
set `REDIS_PORT` to the port printed by the running dev stack if it differs from
`.env`. It stops and removes its temporary container and isolated schema.

```bash
docker build -f Dockerfile.app -t parcelis-next-deployment-test .
# From apps/api; omit REDIS_PORT when .env already matches the running service.
REDIS_PORT=63791 API_HTTP_INTEGRATION_TEST=1 API_TEST_IMAGE=parcelis-next-deployment-test node --env-file=../../.env --import tsx --test src/tests/invoices/invoice-pdf.http.integration.test.ts
```

Place tests in `tests/e2e`. Cover a changed user workflow with stable role, label, or text locators and assertions that verify the user-visible outcome. Do not commit `playwright-report` or `test-results`.

To record an initial test draft, start the web app and run:

```bash
pnpm exec playwright codegen http://localhost:30000
```

Review generated code before committing it; replace fragile selectors and add outcome-based assertions.

### Docker Compose

Parcelis uses two Compose workflows:

- `docker-compose-dev.yml` starts nginx and the local infrastructure services needed for development: PostgreSQL, pgAdmin, Redis, MinIO, and the one-shot MinIO initialization job. Use it with `pnpm dev`; the web, API, docs, jobs, and worker processes stay on the host so you get hot reload.
- `docker-compose.yml` runs the production-style application stack using published images for the app and docs containers, a separate worker container from the app image, plus PostgreSQL, Redis, and MinIO.

#### Local development dependencies

```bash
cp .env.example .env
# Set a unique, 12+ character SEED_ADMIN_PASSWORD in .env
# Generate NEXTAUTH_SECRET with: openssl rand -base64 32
docker compose -f docker-compose-dev.yml up -d
```

The development stack provides the nginx proxy and local dependencies. `pnpm dev` starts nginx, PostgreSQL, Redis, MinIO, and MinIO initialization before starting the host-based web, API, docs, React Email preview, jobs, and worker processes. Keep the compose stack running while you work, then stop it when you are done. Set `PROXY_PORT` when port 80 is already in use.

#### Production-style deployment

Published releases publish separate Docker images for the application, documentation site, and nginx proxy: `parcelis/app`, `parcelis/docs`, and `parcelis/proxy`.

Copy `.env.production.example` to `.env.production`, replace every placeholder (including `REDIS_PASSWORD`), and set `PARCELIS_VERSION` to a release tag such as `v0.4.1` rather than using `latest`.

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d --remove-orphans
```

The Compose stack runs the database migration job and MinIO provisioning before the application services become available. The `migrate` and `minio-init` containers exit after that initialization work; MinIO continues running and the app, docs, and worker services remain up. Put a TLS reverse proxy in front of the exposed web, docs, and object-storage endpoints configured in `.env.production`.
The production nginx proxy serves the web UI at `/`, documentation at `/docs/`, and the API at `/api/v1` on the configured `APP_PORT`. Terminate TLS at nginx or place a TLS proxy in front of it, and expose object storage separately when required.

For logs and cleanup:

```bash
docker compose -f docker-compose-dev.yml logs -f
docker compose -f docker-compose-dev.yml down
docker compose --env-file .env.production logs -f
```

`docker compose -f docker-compose-dev.yml down` stops containers but preserves the local database and object-storage volumes. Use `docker compose -f docker-compose-dev.yml down -v` only when you intentionally want to erase local Parcelis data and start over.

### Object storage

Parcelis uses MinIO for local image storage. Docker Compose starts the service and the one-time `minio-init` job, which exits after preparing the buckets.

| Service or bucket | Address or purpose                                                                      |
| ----------------- | --------------------------------------------------------------------------------------- |
| MinIO API         | `http://localhost:9001`                                                                 |
| MinIO console     | `http://localhost:9010`                                                                 |
| `parcelis-images` | Private property and tenant images                                                      |
| `parcelis-assets` | Public brand assets, including `brand/parcelis-light.png` and `brand/parcelis-dark.png` |

MinIO CORS uses the server-level `MINIO_API_CORS_ALLOW_ORIGIN` setting. Development allows
`http://localhost` and localhost ports; production defaults to `WEB_ORIGIN`. Set a comma-separated
list of origins to override it. Initialization failures stop `pnpm dev` before the apps start.

#### Using storage in the apps

- The API reads S3-compatible settings from `OBJECT_STORAGE_*` environment variables.
- The web app can use `NEXT_PUBLIC_S3_URL` for public asset URLs and `NEXT_PUBLIC_BRAND_LOGO_URL` for the MinIO-hosted logo.
- The responsive navigation and login banners are bundled with the web app at `/brand/parcelis-light-banner.png` and `/brand/parcelis-dark-banner.png`.

#### Image paths

Property images use `properties/{propertyId}/images/{imageId}.{extension}`. Tenant images use `tenants/{tenantId}/images/{imageId}.{extension}`. Both are stored in the private `parcelis-images` bucket and served with short-lived signed URLs.

#### Custom ports

Override local host ports with `APP_PORT`, `API_PORT`, `DOCS_PORT`, `POSTGRES_PORT`, `PGADMIN_PORT`, `MINIO_API_PORT`, and `MINIO_CONSOLE_PORT`:

```bash
APP_PORT=43200 API_PORT=43202 DOCS_PORT=43201 POSTGRES_PORT=43203 PGADMIN_PORT=43204 MINIO_API_PORT=43205 MINIO_CONSOLE_PORT=43206 docker compose -f docker-compose-dev.yml up
```

The containers keep their standard internal ports. Set only the variables you need to change.

If Docker reports that its predefined address pools have been fully subnetted,
Parcelis uses a fixed `10.88.0.0/24` development network. If that subnet is also
busy on your machine, run `docker network ls` and change the subnet in
`docker-compose.yml`, or remove unused Docker networks with `docker network prune`.

### UI components

Parcelis uses shadcn/ui-style primitives through `@parcelis/ui`. Add or extend
shared components in `packages/ui/src/components`, then import them into apps
instead of hand-styling repeated controls in page files.
