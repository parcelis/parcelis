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
| Area    | Dependency                                                                                                                                                                                     | Purpose                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Web     | [Next.js](https://nextjs.org/)                                                                                                                                                                 | React application framework and App Router.                                            |
| Web     | [React](https://react.dev/) and React DOM                                                                                                                                                      | Web UI runtime.                                                                        |
| Web     | [TanStack Query](https://tanstack.com/query)                                                                                                                                                   | Server-state fetching, caching, and mutations.                                         |
| Web     | [TanStack Hotkeys](https://tanstack.com/hotkeys)                                                                                                                                               | Application keyboard shortcuts.                                                        |
| Web     | [Sonner](https://sonner.emilkowal.ski/)                                                                                                                                                        | Toast notifications for completed operational actions.                                 |
| Web/API | [tRPC](https://trpc.io/)                                                                                                                                                                       | Type-safe communication between the web app and API.                                   |
| Web     | [Zod](https://zod.dev/)                                                                                                                                                                        | Shared client-side input validation.                                                   |
| API     | [React PDF](https://react-pdf.org/)                                                                                                                                                            | Renders application PDFs on the server.                                               |
| Web/UI  | [Lucide React v1](https://lucide.dev/)                                                                                                                                                         | Interface icons.                                                                       |
| Web     | [React Icons](https://react-icons.github.io/react-icons/)                                                                                                                                      | GitHub and Discord brand icons.                                                        |
| API     | [NestJS](https://nestjs.com/)                                                                                                                                                                  | API application framework.                                                             |
| API     | [Express](https://expressjs.com/)                                                                                                                                                              | HTTP server platform used by NestJS.                                                   |
| API     | [tRPC OpenAPI](https://trpc.io/docs/openapi)                                                                                                                                                   | Generates an OpenAPI specification from the tRPC router.                               |
| API     | [RxJS](https://rxjs.dev/)                                                                                                                                                                      | Reactive primitives used by NestJS.                                                    |
| API     | [cors](https://github.com/expressjs/cors) and [reflect-metadata](https://github.com/rbuckton/reflect-metadata)                                                                                 | Cross-origin request handling and NestJS decorator metadata.                           |
| API     | [dotenv](https://github.com/motdotla/dotenv)                                                                                                                                                   | Environment variable loading.                                                          |
| API     | [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)                                                                                                           | Presigned S3-compatible upload and download URLs for MinIO property and tenant images. |
| Docs    | [Docusaurus](https://docusaurus.io/)                                                                                                                                                           | Documentation site framework.                                                          |
| Docs    | [Docusaurus Faster](https://docusaurus.io/docs/advanced/rspack) and [SWC](https://swc.rs/)                                                                                                     | Compiles documentation JavaScript, including the OpenAPI theme.                        |
| Docs    | [MDX](https://mdxjs.com/)                                                                                                                                                                      | JSX-enabled documentation content.                                                     |
| Docs    | [docusaurus-plugin-copy-page-button](https://github.com/portdeveloper/docusaurus-plugin-copy-page-button)                                                                                      | Copies a documentation page as Markdown and provides related AI-tool actions.          |
| Docs    | [docusaurus-plugin-openapi-docs](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs) and [docusaurus-theme-openapi-docs](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs) | Generates and renders API reference pages from OpenAPI specifications.                 |
| Docs    | [docusaurus-plugin-sass](https://github.com/eguled/docusaurus-plugin-sass) and [Sass](https://sass-lang.com/)                                                                                  | Compiles the OpenAPI theme's Sass styles.                                              |

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
| [Playwright](https://playwright.dev/) | End-to-end browser testing for critical web workflows. |
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
