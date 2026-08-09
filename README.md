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

![GitHub Tag](https://img.shields.io/github/v/tag/parcelis/parcelis)
![Docker Automated build](https://img.shields.io/docker/automated/ndcallahan/parcelis)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/parcelis/parcelis/publish-images.yml)
[![CI](https://github.com/parcelis/parcelis/actions/workflows/ci.yml/badge.svg)](https://github.com/parcelis/parcelis/actions/workflows/ci.yml) [![Linter](https://github.com/parcelis/parcelis/actions/workflows/lint.yml/badge.svg)](https://github.com/parcelis/parcelis/actions/workflows/lint.yml) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/parcelis/parcelis) ![GitHub Issues](https://img.shields.io/github/issues/parcelis/parcelis) ![GitHub Pull Requests](https://img.shields.io/github/issues-pr/parcelis/parcelis) ![GitHub Discussions (all)](https://img.shields.io/github/discussions/all/parcelis/parcelis)

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

## Deployment

Published releases provide a combined application image at Docker Hub as `parcelis/apps` and a documentation image as `parcelis/docs`. The application image serves the web UI and API through one public port. PostgreSQL and MinIO remain separate, persistent services managed by `docker-compose.yml`.

Before publishing the first release, configure these GitHub repository values:

- Secret: `DOCKERHUB_USERNAME` — the Docker Hub username used for publishing.
- Secret: `DOCKERHUB_TOKEN` — a Docker Hub access token with permission to push to the `parcelis` organization.

Copy `.env.production.example` to `.env.production`, set the production values, then run:

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
```

Set `PARCELIS_VERSION` to a release tag such as `v0.3.0`; do not rely on `latest` for a production deployment.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, contributor expectations,
and the Conventional Commit format enforced for pull requests.

## Licensing

Parcelis is licensed under the GNU Affero General Public License version 3. See
[LICENSING.md](LICENSING.md) for details.
