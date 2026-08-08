# Contributing to Parcelis

Thanks for contributing to Parcelis. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Contributor License Agreement

By submitting a contribution, you accept the [Contributor License Agreement](CLA.md). It lets
Parcelis use and relicense contributions while you retain ownership. If you contribute for an
organization, ensure that you are authorized to accept the agreement on its behalf.

The public [CLA Gist](https://gist.github.com/NDCallahan/580fbbc25333ebc1deaf66dcfd853635)
is available for CLA-bot configuration.

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

### Local development

Install dependencies, start the Docker-backed services, and run the apps on your
machine with hot reload:

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

`pnpm dev` uses the Parcelis host-port block and chooses the next open port when a default is busy.
It reads the root `.env` so the web, API, and database connection use the same port configuration.
Defaults are web `http://localhost:30000`, docs `http://localhost:40000`, API
`http://localhost:40010`, PostgreSQL `localhost:54320`, pgAdmin
`http://localhost:8000`, MinIO `http://localhost:9001`, and the MinIO console
`http://localhost:9010`.
pgAdmin is available at `http://localhost:8000` with the default login
`admin@parcelis.dev` / `parcelis`; the Parcelis database is preconfigured.
When connecting to it for the first time, use the database password `parcelis`.
If `DATABASE_URL` is not set, the API falls back to `postgresql://parcelis:parcelis@localhost:54320/parcelis?schema=public`.
If a previous dev run is still watching files, stop it with `Ctrl+C` before
starting another one.
Prisma commands load the root `.env` automatically when run through `pnpm db:*`.
Set `SEED_ADMIN_PASSWORD` to a unique password of at least 12 characters before the first
`pnpm db:seed`; it creates the local administrator account without replacing an existing password.
After pulling schema changes, run `pnpm db:migrate && pnpm db:seed` to apply new
columns and refresh demo operating metrics such as overdue balances, lease
expirations, and unit-level maintenance tickets.

### Docker Compose

`docker-compose-dev.yml` runs only the local dependencies. Use it with `pnpm dev`; the
web, API, and docs processes remain on the host for hot reload.

```bash
cp .env.example .env
docker compose -f docker-compose-dev.yml up -d
```

`docker-compose.yml` builds and runs the deployable application stack. Copy
`.env.production.example` to `.env.production`, replace every placeholder, then run:

```bash
docker compose --env-file .env.production up -d --build
```

It runs database migrations and MinIO provisioning before starting the API. The
`migrate` and `minio-init` containers exit successfully after that work; MinIO itself
continues running. Put a TLS reverse proxy in front of the web, API, docs, and object-storage URLs configured in `.env.production`.

For local dependency logs and cleanup:

```bash
docker compose -f docker-compose-dev.yml logs -f
docker compose -f docker-compose-dev.yml down
```

`docker compose -f docker-compose-dev.yml down` stops containers but preserves the local database and
object-storage volumes. Use `docker compose -f docker-compose-dev.yml down -v` only when you intentionally
want to erase local Parcelis data and start over.

### API reference

The API reference is generated from the tRPC router. Regenerate the OpenAPI specification and Docusaurus pages after changing API procedures or shared schemas:

```bash
pnpm --filter @parcelis/api generate:openapi
pnpm --filter @parcelis/docs generate:api
```

### UI components

Parcelis uses shadcn/ui-style primitives through `@parcelis/ui`. Add or extend
shared components in `packages/ui/src/components`, then import them into apps
instead of hand-styling repeated controls in page files.
