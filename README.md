<p align="center">
  <img src="https://i.imgur.com/9fKiINL.png" alt="Parcelis Dark Banner" style="text-align:center;" />
</p>
Parcelis is an open-source property management platform for landlords, small operators, and local property teams.


<h3 align="center">
  🧩
  <a href="https://github.com/parcelis/parcelis/discussions/categories/ideas">Request a feature</a>
  <span>&nbsp; &nbsp; &nbsp; · &nbsp; &nbsp; &nbsp;</span>
  🐞
  <a href="https://github.com/parcelis/parcelis/issues">Report a bug</a>
  <span>&nbsp; &nbsp; &nbsp; · &nbsp; &nbsp; &nbsp;</span>
  👥💬
  <a href="https://github.com/parcelis/parcelis/discussions">Community Discussions</a>
</h3>

## Currently under development. Will update once we have a basic MVP to pilot.



## Apps

- `apps/web`: Next.js App Router frontend.
- `apps/api`: NestJS backend exposing a tRPC router.
- `apps/docs`: Next.js documentation site with MDX-ready structure.

## Packages

- `packages/ui`: shared Parcelis UI primitives and brand components.
- `packages/schemas`: shared Zod schemas for frontend and backend contracts.
- `packages/db`: Prisma schema, migrations, and database client exports.
- `packages/config`: shared TypeScript, ESLint, and Prettier configuration.

## Local development

Install dependencies, start the Docker-backed services, and run the apps on your
machine with hot reload:

```bash
pnpm install
cp .env.example .env
docker compose up postgres minio minio-init -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` chooses the next open ports when the defaults are busy and prints the URLs it selected.
Defaults are web `http://localhost:3000`, API `http://localhost:4000`, and docs `http://localhost:3001`.
If `DATABASE_URL` is not set, the API falls back to `postgresql://parcelis:parcelis@localhost:55432/parcelis?schema=public`.
If a previous dev run is still watching files, stop it with `Ctrl+C` before
starting another one.
Prisma commands load the root `.env` automatically when run through `pnpm db:*`.
After pulling schema changes, run `pnpm db:migrate && pnpm db:seed` to apply new
columns and refresh demo operating metrics such as overdue balances, lease
expirations, and unit-level maintenance tickets.

## Run with Docker

Docker Compose can run Postgres, MinIO, the API, and the web app together. This
is useful when you want the full Parcelis environment without starting Node
processes on your host machine.

```bash
cp .env.example .env
docker compose up -d postgres minio minio-init
docker compose run --rm api sh -c "corepack enable && pnpm install && pnpm db:migrate && pnpm db:seed"
docker compose up -d web api
```

Open the web app at `http://localhost:3000`, the API at
`http://localhost:4000`, and the MinIO console at `http://localhost:9001`.
The `minio-init` container runs once to create buckets and upload the light and
dark Parcelis logos, then exits normally.

Use these commands while the Docker environment is running:

```bash
docker compose logs -f web api
docker compose down
```

`docker compose down` stops containers but preserves the local database and
object-storage volumes. Use `docker compose down -v` only when you intentionally
want to erase local Parcelis data and start over.

## UI components

Parcelis uses shadcn/ui-style primitives through `@parcelis/ui`. Add or extend
shared components in `packages/ui/src/components`, then import them into apps
instead of hand-styling repeated controls in page files.

## Licensing

Parcelis is licensed under the GNU Affero General Public License version 3. See
[LICENSING.md](LICENSING.md) for details.

## Object storage

Parcelis uses MinIO for local S3-compatible image storage. Docker Compose starts
MinIO on `http://localhost:9000`, opens the console at `http://localhost:9001`,
and creates a private `parcelis-images` bucket through the `minio-init` service.
It also creates a public-read `parcelis-assets` bucket and uploads the brand
logos to `brand/parcelis-light.png` and `brand/parcelis-dark.png`. The
`minio-init` container exits after the buckets are ready.

Default local credentials are:

```bash
MINIO_ROOT_USER=parcelis-minio
MINIO_ROOT_PASSWORD=parcelis-minio-secret
```

The API reads S3-compatible settings from `OBJECT_STORAGE_*` env vars, while the
web app can use `NEXT_PUBLIC_OBJECT_STORAGE_URL` for public asset URLs.
`NEXT_PUBLIC_BRAND_LOGO_URL` points at the MinIO-hosted Parcelis logo.

For Docker Compose, host ports are configured with `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `MINIO_API_PORT`, and `MINIO_CONSOLE_PORT`:

```bash
WEB_PORT=3010 API_PORT=4010 POSTGRES_PORT=5434 MINIO_API_PORT=9010 MINIO_CONSOLE_PORT=9011 docker compose up
```

The Compose Postgres container listens on `5432` internally, but maps to host
port `55432` by default so it can coexist with local Postgres installs.
The Compose MinIO container listens on `9000` internally, with the console on
`9001`.

If Docker reports that its predefined address pools have been fully subnetted,
Parcelis uses a fixed `10.88.0.0/24` development network. If that subnet is also
busy on your machine, run `docker network ls` and change the subnet in
`docker-compose.yml`, or remove unused Docker networks with `docker network prune`.
