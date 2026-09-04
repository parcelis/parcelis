# Contributing to Parcelis

Thanks for contributing to Parcelis. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Contributor License Agreement

By submitting a contribution, you accept the [Contributor License Agreement](CLA.md). It lets
Parcelis use and relicense contributions while you retain ownership. If you contribute for an
organization, ensure that you are authorized to accept the agreement on its behalf.

## Issues

Search existing issues before opening a new one. Use the matching GitHub issue form for feature
requests, bug reports, or documentation changes, and complete its required fields. For new
features, wait for maintainer approval before opening a pull request.

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

### Repository structure

Apps:

- `apps/web`: Next.js App Router frontend.
- `apps/api`: NestJS backend exposing a tRPC router.
- `apps/docs`: Docusaurus documentation site for platform and contributor guides.

Packages:

- `packages/ui`: shared Parcelis UI primitives and brand components.
- `packages/schemas`: shared Zod schemas for frontend and backend contracts.
- `packages/db`: Prisma schema, migrations, and database client exports.
- `packages/config`: shared TypeScript, ESLint, and Prettier configuration.

### Local development

Install dependencies and run the apps on your machine with hot reload:

```bash
pnpm install
cp .env.example .env
# Set a unique, 12+ character SEED_ADMIN_PASSWORD in .env
docker compose -f docker-compose-dev.yml up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

#### What `pnpm dev` starts

`pnpm dev` starts the web, API, docs, and React Email preview apps with hot reload. It also starts nginx, PostgreSQL, MinIO, and the one-shot MinIO initialization job, so Docker must be running. It stops existing listeners on the configured app ports and chooses the next open port only when needed.

Use nginx as the normal local entry point:

| Service | URL |
| --- | --- |
| Web app | `http://localhost` |
| Documentation | `http://localhost/docs/` |
| API | `http://localhost/api/v1` |
| React Email previews | `http://templates.localhost/` |

The host processes and local services are also available directly:

| Service | Address |
| --- | --- |
| Web app | `http://localhost:30000` |
| Docs | `http://localhost:40000` |
| API | `http://localhost:40010` |
| React Email previews | `http://localhost:30001` |
| PostgreSQL | `localhost:54320` |
| pgAdmin | `http://localhost:8000` |
| MinIO API | `http://localhost:9001` |
| MinIO console | `http://localhost:9010` |

#### Local database

Prisma commands run through `pnpm db:*` automatically load the root `.env`. If `DATABASE_URL` is unset, the API uses `postgresql://parcelis:parcelis@localhost:54320/parcelis?schema=public`.

pgAdmin is available at `http://localhost:8000` with `admin@parcelis.dev` / `parcelis`. The Parcelis database is preconfigured; use `parcelis` as its password when connecting for the first time.

Set `SEED_ADMIN_PASSWORD` to a unique password of at least 12 characters before the first `pnpm db:seed`. Set `SEED_ADMIN_EMAIL` to use an address other than the default `admin@parcelis.dev`. The seed creates the local administrator account without replacing an existing password.

After pulling schema changes, run:

```bash
pnpm db:migrate
pnpm db:seed
```

#### Useful commands

- `pnpm dev:services:refresh`: recreate nginx, PostgreSQL, and MinIO while preserving their volumes, then rerun MinIO initialization.
- `pnpm email:verify`: verify the configured SMTP connection and authentication without sending an email.
- Stop an existing app watcher with `Ctrl+C` before starting another `pnpm dev` process.

### API tests

Keep API unit and router tests in feature folders under `apps/api/src/tests`, such as
`apps/api/src/tests/permissions`. Run the API suite with:

```bash
pnpm --filter @parcelis/api test
```

### End-to-end tests

Parcelis uses Playwright for browser-level tests. Install Chromium once after installing dependencies:

```bash
pnpm exec playwright install chromium
```

Run the suite with `pnpm test:e2e`. It starts the web app automatically unless `PLAYWRIGHT_TEST_BASE_URL` points to an existing environment. Use `pnpm test:e2e:ui` to run tests in Playwright UI mode.

Place tests in `tests/e2e`. Cover a changed user workflow with stable role, label, or text locators and assertions that verify the user-visible outcome. Do not commit `playwright-report` or `test-results`.

To record an initial test draft, start the web app and run:

```bash
pnpm exec playwright codegen http://localhost:30000
```

Review generated code before committing it; replace fragile selectors and add outcome-based assertions.

### Docker Compose

Parcelis uses two Compose workflows:

- `docker-compose-dev.yml` starts nginx and the local infrastructure services needed for development: PostgreSQL, pgAdmin, MinIO, and the one-shot MinIO initialization job. Use it with `pnpm dev`; the web, API, and docs processes stay on the host so you get hot reload.
- `docker-compose.yml` runs the production-style application stack using published images for the app and docs containers, plus PostgreSQL and MinIO.

#### Local development dependencies

```bash
cp .env.example .env
# Set a unique, 12+ character SEED_ADMIN_PASSWORD in .env
docker compose -f docker-compose-dev.yml up -d
```

The development stack provides the nginx proxy and local dependencies. `pnpm dev` starts nginx, PostgreSQL, MinIO, and MinIO initialization before starting the host-based web, API, docs, and React Email preview processes. Keep the compose stack running while you work, then stop it when you are done. Set `PROXY_PORT` when port 80 is already in use.

#### Production-style deployment

Published releases publish separate Docker images for the application, documentation site, and nginx proxy: `parcelis/app`, `parcelis/docs`, and `parcelis/proxy`.

Copy `.env.production.example` to `.env.production`, replace every placeholder, and set `PARCELIS_VERSION` to a release tag such as `v0.4.1` rather than using `latest`.

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d --remove-orphans
```

The Compose stack runs the database migration job and MinIO provisioning before the application services become available. The `migrate` and `minio-init` containers exit after that initialization work; MinIO continues running and the app/docs services remain up. Put a TLS reverse proxy in front of the exposed web, docs, and object-storage endpoints configured in `.env.production`.
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

| Service or bucket | Address or purpose |
| --- | --- |
| MinIO API | `http://localhost:9001` |
| MinIO console | `http://localhost:9010` |
| `parcelis-images` | Private property and tenant images |
| `parcelis-assets` | Public brand assets, including `brand/parcelis-light.png` and `brand/parcelis-dark.png` |

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
