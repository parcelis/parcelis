# Parcelis Architecture

This document gives contributors a practical map of the Parcelis codebase, its runtime boundaries, and the main data flows.

## Overview

Parcelis is a property-management platform for landlords, small operators, and local property teams. It is a pnpm workspace managed with Turborepo. The system has three applications and shared packages for UI, API contracts, configuration, and persistence.

```text
                              Browser
                                 |
                                 v
            Parcelis application image (app)
                     |
          +----------+----------+
          |                     |
          v                     v
Next.js web application     NestJS API
     (apps/web)             (apps/api)
                                  |
                                  | Prisma
                                  v
                              PostgreSQL

The browser reaches the API through the same application origin. Direct public
asset URLs are served by MinIO / S3-compatible storage.

      Docusaurus documentation site (apps/docs) is built and deployed separately.
```

During local development, nginx listens on `http://localhost` and routes `/` to
the web app, `/trpc/*` and `/api/*` to the API, and `/docs/*` to Docusaurus.
The three application processes continue to run on their own host ports for hot
reload.

## Monorepo structure

### Applications

| Package          | Location    | Responsibility                                                   | Default port |
| ---------------- | ----------- | ---------------------------------------------------------------- | ------------ |
| `@parcelis/web`  | `apps/web`  | Next.js App Router operational UI                                | 30000        |
| `@parcelis/api`  | `apps/api`  | NestJS API, tRPC, OpenAPI middleware, object-storage integration | 40010        |
| `@parcelis/docs` | `apps/docs` | Docusaurus user, contributor, and generated API documentation    | 40000        |

### Shared packages

| Package             | Location           | Responsibility                                                                         |
| ------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `@parcelis/ui`      | `packages/ui`      | Shared Tailwind and shadcn-style UI primitives, dialogs, drawers, and brand components |
| `@parcelis/schemas` | `packages/schemas` | Zod input schemas and inferred TypeScript contracts shared by web and API              |
| `@parcelis/db`      | `packages/db`      | Prisma schema, migrations, seed data, and database client exports                      |
| `@parcelis/config`  | `packages/config`  | Shared TypeScript, ESLint, Prettier, and Tailwind configuration                        |

## Request flow

```text
Next.js route or client component
        |
        | @trpc/client
        v
POST /trpc/*
        |
        v
NestJS TrpcMiddleware
        |
        v
appRouter procedure
        |
        +--> Zod schema from @parcelis/schemas
        |
        +--> PrismaService
                 |
                 v
             PostgreSQL
```

The web app creates a typed tRPC proxy client in `apps/web/components/api-client.ts`. API procedures are defined in `apps/api/src/router/app.router.ts`; their inputs use schemas from `@parcelis/schemas`. The API context supplies Nest's `PrismaService`, authenticated user and session, and the active organization to every procedure.

The API also mounts `publicRouter` at `/api/v1/*` through `OpenApiMiddleware`. The OpenAPI document is generated from that router and consumed by the Docusaurus API-reference generator.

## Frontend

`apps/web/app` contains Next.js App Router pages for the portfolio dashboard, properties, property units, tenants, and login. Page-level components compose shared UI controls from `@parcelis/ui` and feature components from `apps/web/components`.

Client-side server state uses TanStack Query. Query keys are centralized next to the tRPC client, allowing mutations to invalidate the corresponding property, tenant, unit, or note data predictably.

Use `@parcelis/ui` for reusable controls. New cross-screen controls belong in `packages/ui/src/components`; feature-specific forms and state helpers belong under `apps/web/components`.

The expanded sidebar shows the active organization and, for users with access to more than one, provides an organization switcher. Organization settings in `apps/web/app/settings/organization` manage the organization name, slug, and light and dark avatar images.

## API

The NestJS application starts in `apps/api/src/main.ts`. `AppModule` mounts:

- `TrpcMiddleware` at `/trpc` and `/trpc/*` for application procedures.
- `OpenApiMiddleware` at `/api/v1` and `/api/v1/*` for documented public procedures.

Object storage is configured in `apps/api/src/modules/object-storage.config.ts`. The API generates signed download and upload URLs for private property and tenant images; the browser uploads directly to object storage after receiving a signed URL.

The API context resolves the active organization from the `x-parcelis-organization-slug` request header, the user's default organization, or the session's active organization. `organizationProcedure` requires that context and operational queries and writes filter or persist its organization ID. Organization administrators can update organization details and avatars; application administrators can access every organization.

## Data model

Prisma models live in `packages/db/prisma/schema.prisma`. The operational model centers on:

```text
Organization
  |- OrganizationMembership -> User
  |- Property
  |- Tenant
  |- Lease
  |- Invoice
  `- MaintenanceTicket

Property
  |- Unit
  |    |- UnitUtility -> UtilityType
  |    |- UnitAmenity -> AmenityType
  |    `- Note
  |- Lease -> Tenant
  |- MaintenanceTicket
  |- Tag (many-to-many)
  `- Note

Tenant
  |- EmergencyContact
  |- Lease
  `- Note
```

- An organization owns operational records. Membership gives a user access to an organization and records the organization-level role; users also retain a default organization and sessions retain an active organization.
- A property holds its address, operational status, contacts, units, leases, tags, and maintenance tickets.
- A lease connects a tenant to a property unit label and holds rent, balance, dates, and lease status.
- Notes belong to exactly one property, unit, or tenant.
- Organization, property, and tenant images are stored as object keys in PostgreSQL; the image bytes live in object storage. Object keys are partitioned by organization.

Schema changes require a new migration in `packages/db/prisma/migrations`. Do not edit an existing migration after it has been applied. Run `pnpm db:generate` after schema changes and `pnpm db:migrate` to apply migrations locally.

## Documentation pipeline

User-facing documentation is authored in `apps/docs/content`. API documentation is generated rather than hand-maintained:

```text
apps/api/src/router/public.router.ts
        |
        | pnpm --filter @parcelis/api generate:openapi
        v
apps/api/openapi/parcelis.openapi.json
        |
        | pnpm --filter @parcelis/docs generate:api
        v
apps/docs/content/api-reference
```

Update the applicable user guide and generated API reference whenever a user-facing workflow or public API contract changes.

## Local development

`docker-compose-dev.yml` provides PostgreSQL, pgAdmin, MinIO, and the MinIO initialization job for host-based development. The initialization job creates the private image bucket, public asset bucket, bucket policy, and local brand assets. `docker-compose.yml` runs published Parcelis application and documentation images with PostgreSQL and MinIO.

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose-dev.yml up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The usual verification commands are:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

For scoped work, prefer the package-level command, for example `pnpm --filter @parcelis/web typecheck`.

## Container deployment

`Dockerfile.app` builds `apps/web` and `apps/api` into the single `app` image. Nginx routes browser requests to Next.js and forwards `/trpc/*` and `/api/*` to NestJS inside the container. The production Compose proxy is the `proxy` image and routes `/docs/*` to the documentation container. A release workflow publishes `app`, `docs`, and `proxy` to Docker Hub when a GitHub release is published.

## Design rules

- Keep shared input validation in `@parcelis/schemas`.
- Keep durable data constraints and migrations in `@parcelis/db`.
- Keep reusable visual primitives in `@parcelis/ui`.
- Keep API routes thin: validate input, perform domain/database work, and return a stable contract.
- Prefer transactions for multi-step writes that must remain consistent.
- Treat object storage as a separate persistence boundary: store object keys in PostgreSQL, not file bytes.
