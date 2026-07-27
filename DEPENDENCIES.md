# Parcelis dependencies

This is the human-readable inventory of technologies used directly by Parcelis.
Package manifests and `pnpm-lock.yaml` remain the source of truth for exact and transitive versions.

When adding or removing a direct dependency, update the relevant package manifest and this file in the same change.

## Applications

| Area    | Dependency                                                                                                                                                                                     | Purpose                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Web     | [Next.js](https://nextjs.org/)                                                                                                                                                                 | React application framework and App Router.                                   |
| Web     | [React](https://react.dev/) and React DOM                                                                                                                                                      | Web UI runtime.                                                               |
| Web     | [TanStack Query](https://tanstack.com/query)                                                                                                                                                   | Server-state fetching, caching, and mutations.                                |
| Web     | [TanStack Hotkeys](https://tanstack.com/hotkeys)                                                                                                                                               | Application keyboard shortcuts.                                               |
| Web/API | [tRPC](https://trpc.io/)                                                                                                                                                                       | Type-safe communication between the web app and API.                          |
| Web     | [Zod](https://zod.dev/)                                                                                                                                                                        | Shared client-side input validation.                                          |
| Web     | [Lucide](https://lucide.dev/)                                                                                                                                                                  | Interface icons.                                                              |
| API     | [NestJS](https://nestjs.com/)                                                                                                                                                                  | API application framework.                                                    |
| API     | [Express](https://expressjs.com/)                                                                                                                                                              | HTTP server platform used by NestJS.                                          |
| API     | [tRPC OpenAPI](https://trpc.io/docs/openapi)                                                                                                                                                   | Generates an OpenAPI specification from the tRPC router.                      |
| API     | [RxJS](https://rxjs.dev/)                                                                                                                                                                      | Reactive primitives used by NestJS.                                           |
| API     | [cors](https://github.com/expressjs/cors) and [reflect-metadata](https://github.com/rbuckton/reflect-metadata)                                                                                 | Cross-origin request handling and NestJS decorator metadata.                  |
| API     | [dotenv](https://github.com/motdotla/dotenv)                                                                                                                                                   | Environment variable loading.                                                 |
| Docs    | [Docusaurus](https://docusaurus.io/)                                                                                                                                                           | Documentation site framework.                                                 |
| Docs    | [Docusaurus Faster](https://docusaurus.io/docs/advanced/rspack) and [SWC](https://swc.rs/)                                                                                                     | Compiles documentation JavaScript, including the OpenAPI theme.               |
| Docs    | [MDX](https://mdxjs.com/)                                                                                                                                                                      | JSX-enabled documentation content.                                            |
| Docs    | [docusaurus-plugin-copy-page-button](https://github.com/portdeveloper/docusaurus-plugin-copy-page-button)                                                                                      | Copies a documentation page as Markdown and provides related AI-tool actions. |
| Docs    | [docusaurus-plugin-openapi-docs](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs) and [docusaurus-theme-openapi-docs](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs) | Generates and renders API reference pages from OpenAPI specifications.        |
| Docs    | [docusaurus-plugin-sass](https://github.com/eguled/docusaurus-plugin-sass) and [Sass](https://sass-lang.com/)                                                                                  | Compiles the OpenAPI theme's Sass styles.                                     |

## Shared packages

| Area       | Dependency                                                                                             | Purpose                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Data       | [Prisma](https://www.prisma.io/)                                                                       | Database schema, migrations, generated client, and seeding.  |
| Data       | [PostgreSQL](https://www.postgresql.org/)                                                              | Primary relational database.                                 |
| Validation | `@parcelis/db`                                                                                         | Supplies database enum values to shared validation schemas.  |
| Validation | [Zod](https://zod.dev/)                                                                                | Shared API input schemas and TypeScript types.               |
| UI         | [Radix UI](https://www.radix-ui.com/)                                                                  | Accessible checkbox, dropdown, popover, and slot primitives. |
| UI         | [class-variance-authority](https://cva.style/)                                                         | Component variant definitions.                               |
| UI         | [clsx](https://github.com/lukeed/clsx) and [tailwind-merge](https://github.com/dcastil/tailwind-merge) | Conditional and conflict-safe Tailwind class composition.    |
| UI         | [Tailwind CSS](https://tailwindcss.com/)                                                               | Utility-first styling.                                       |

## Development and delivery

| Area           | Dependency                                                                                  | Purpose                                                     |
| -------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Workspace      | [pnpm](https://pnpm.io/)                                                                    | Package manager and monorepo workspace support.             |
| Workspace      | [Turborepo](https://turbo.build/)                                                           | Cached orchestration for build, lint, and typecheck tasks.  |
| Runtime        | [Node.js](https://nodejs.org/)                                                              | JavaScript runtime; the development containers use Node 22. |
| Language       | [TypeScript](https://www.typescriptlang.org/)                                               | Type checking and application language.                     |
| Code quality   | [ESLint](https://eslint.org/), `typescript-eslint`, and React/Next ESLint plugins           | Linting for TypeScript, React, and Next.js.                 |
| Formatting     | [Prettier](https://prettier.io/)                                                            | Source-code formatting.                                     |
| Commits        | [Commitlint](https://commitlint.js.org/)                                                    | Conventional Commit validation.                             |
| CSS build      | [PostCSS](https://postcss.org/) and [Autoprefixer](https://github.com/postcss/autoprefixer) | CSS transformation and browser-prefixing.                   |
| Containers     | [Docker Compose](https://docs.docker.com/compose/)                                          | Local multi-service development environment.                |
| Database admin | [pgAdmin](https://www.pgadmin.org/)                                                          | Local PostgreSQL table browser and query tool.              |
| Docs hosting   | [Caddy](https://caddyserver.com/)                                                           | Serves the static Docusaurus build in the docs container.   |
| Object storage | [MinIO](https://min.io/)                                                                    | Local S3-compatible object storage.                         |

## Version tracking

Direct JavaScript dependency versions are declared in these manifests:

- Root tooling: `package.json`
- Web: `apps/web/package.json`
- API: `apps/api/package.json`
- Documentation: `apps/docs/package.json`
- Shared packages: `packages/*/package.json`

`pnpm-lock.yaml` records the resolved dependency tree. Docker image tags are declared in `docker-compose.yml` and `apps/docs/Dockerfile`.
