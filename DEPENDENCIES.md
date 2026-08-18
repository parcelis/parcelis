# Parcelis dependencies

This is a high-level inventory of the technologies Parcelis intentionally uses. Package manifests are the source of truth for direct dependencies, and `pnpm-lock.yaml` records exact resolved and transitive versions.

When adding or removing a primary technology or service, update this file in the same change.

## Application platform

| Technology | Purpose |
| --- | --- |
| [Next.js](https://nextjs.org/) and [React](https://react.dev/) | Main Parcelis web app. |
| [NestJS](https://nestjs.com/), [Express](https://expressjs.com/), and [tRPC](https://trpc.io/) | API and communication between the web app and backend. |
| [Docusaurus](https://docusaurus.io/) | Documentation site and API reference. |
| [Markdown](https://daringfireball.net/projects/markdown/) and [MDX](https://mdxjs.com/) | Documentation content. |

## Data and storage

| Technology | Purpose |
| --- | --- |
| [Prisma](https://www.prisma.io/) and [PostgreSQL](https://www.postgresql.org/) | Database schema, migrations, and application data. |
| [MinIO](https://min.io/) | Local S3-compatible object storage for images and assets. |
| [Zod](https://zod.dev/) | Shared validation for application data. |

## Interface

| Technology | Purpose |
| --- | --- |
| [Tailwind CSS](https://tailwindcss.com/) | Application styling. |
| [Radix UI](https://www.radix-ui.com/) | Accessible building blocks for interface components. |
| [Lucide](https://lucide.dev/) | Interface icons. |

## Development and delivery

| Technology | Purpose |
| --- | --- |
| [Node.js 24.19.0](https://nodejs.org/) | JavaScript runtime. |
| [pnpm 11](https://pnpm.io/) | Package management and workspace support. |
| [Turborepo](https://turbo.build/) | Builds, linting, and type checking across the monorepo. |
| [TypeScript](https://www.typescriptlang.org/) | Application language and type checking. |
| [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/) | Code linting and formatting. |
| [Docker Compose](https://docs.docker.com/compose/) | Local infrastructure and production-style deployment. |
| [pgAdmin](https://www.pgadmin.org/) | Local PostgreSQL administration. |

## Version tracking

Direct JavaScript dependencies are declared in:

- Root tooling: `package.json`
- Web: `apps/web/package.json`
- API: `apps/api/package.json`
- Documentation: `apps/docs/package.json`
- Shared packages: `packages/*/package.json`

`pnpm-lock.yaml` records the resolved dependency tree. Docker image tags are declared in `docker-compose.yml` and `apps/docs/Dockerfile`.
