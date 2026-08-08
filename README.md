<p align="center">
  <img src="https://i.imgur.com/9fKiINL.png" alt="Parcelis Dark Banner" style="text-align:center;" />
</p>
Parcelis (PAR-suhl-iss) is an open-source property management platform for landlords, small operators, and local property teams.

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

<br /><br />

<p align="center">
<a href="https://discord.gg/4XYkWmVpWH"><img src="https://i.imgur.com/d7JM2wK.png" width="150px" /></a>
<span>&nbsp; &nbsp; &nbsp;</span>
<a href="https://parcelis.dev/"><img width="50" height="50" alt="image" src="https://github.com/user-attachments/assets/9f838f54-df0d-4f52-bfa8-8d21e8c99735" /></a>
<span>&nbsp; &nbsp; &nbsp;</span>
<a href="https://snyk.io/?utm_source=open-source&utm_medium=pg-ptr&utm_campaign=ref-2501-osp&utm_content=pg-cta"><img src="https://github.com/snyk-labs/secure-developer-sample-repo/blob/main/badge_round.svg" width="100px" /></a>
</p>

<br />

[![CI](https://github.com/parcelis/parcelis/actions/workflows/ci.yml/badge.svg)](https://github.com/parcelis/parcelis/actions/workflows/ci.yml)   [![Linter](https://github.com/parcelis/parcelis/actions/workflows/lint.yml/badge.svg)](https://github.com/parcelis/parcelis/actions/workflows/lint.yml)   ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/parcelis/parcelis)   ![GitHub Issues](https://img.shields.io/github/issues/parcelis/parcelis)   ![GitHub Pull Requests](https://img.shields.io/github/issues-pr/parcelis/parcelis)   ![GitHub Discussions (all)](https://img.shields.io/github/discussions/all/parcelis/parcelis)





## <p align="center"> Currently under development. Will update once we have a basic MVP to pilot.</p>

<br /><br />

## Apps

- `apps/web`: Next.js App Router frontend.
- `apps/api`: NestJS backend exposing a tRPC router.
- `apps/docs`: Docusaurus documentation site for platform and contributor guides.

## Packages

- `packages/ui`: shared Parcelis UI primitives and brand components.
- `packages/schemas`: shared Zod schemas for frontend and backend contracts.
- `packages/db`: Prisma schema, migrations, and database client exports.
- `packages/config`: shared TypeScript, ESLint, and Prettier configuration.

## Technology

Parcelis is built with open-source tools and services. See [DEPENDENCIES.md](DEPENDENCIES.md) for the maintained technology inventory and each tool's role.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, contributor expectations,
and the Conventional Commit format enforced for pull requests.

## Licensing

Parcelis is licensed under the GNU Affero General Public License version 3. See
[LICENSING.md](LICENSING.md) for details.

## Object storage

Parcelis uses MinIO for local S3-compatible image storage. Docker Compose starts
MinIO on `http://localhost:9001`, opens the console at `http://localhost:9010`,
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
web app can use `NEXT_PUBLIC_S3_URL` for public asset URLs.
`NEXT_PUBLIC_BRAND_LOGO_URL` points at the MinIO-hosted Parcelis logo.
The responsive navigation and login banners are bundled with the web app as
`/brand/parcelis-light-banner.png` and `/brand/parcelis-dark-banner.png`.

Property images are stored under
`properties/{propertyId}/images/{imageId}.{extension}`. Tenant images use
`tenants/{tenantId}/images/{imageId}.{extension}`. Both use the private
`parcelis-images` bucket and short-lived signed URLs.

For Docker Compose, host ports are configured with `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`,
`PGADMIN_PORT`, `MINIO_API_PORT`, and `MINIO_CONSOLE_PORT`:

```bash
WEB_PORT=43200 API_PORT=43202 DOCS_PORT=43201 POSTGRES_PORT=43203 PGADMIN_PORT=43204 MINIO_API_PORT=43205 MINIO_CONSOLE_PORT=43206 docker compose -f docker-compose-dev.yml up
```

The Compose services retain their standard internal ports, but map to the
the local ports listed above by default. Set the corresponding
environment variables to override individual host ports.

If Docker reports that its predefined address pools have been fully subnetted,
Parcelis uses a fixed `10.88.0.0/24` development network. If that subnet is also
busy on your machine, run `docker network ls` and change the subnet in
`docker-compose.yml`, or remove unused Docker networks with `docker network prune`.
