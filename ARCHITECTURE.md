# Parcelis Architecture

This document gives contributors a practical map of the Parcelis codebase, its runtime boundaries, and the main data flows.

## Overview

Parcelis is a property-management platform for landlords, small operators, and local property teams. It is a pnpm workspace managed with Turborepo. The system has three applications and shared packages for UI, API contracts, configuration, and persistence.

```text
                              Browser
                                 |
                                 v
                  Next.js web application (apps/web)
                     |                         |
                     | Same-origin tRPC proxy  | Direct public asset URLs
                     v                         v
          NestJS API (apps/api)          MinIO / S3-compatible storage
                     |
                     | Prisma
                     v
                 PostgreSQL

      Docusaurus documentation site (apps/docs) is built and deployed separately.
```

## Monorepo structure

### Applications

| Package          | Location    | Responsibility                                                   | Default port |
| ---------------- | ----------- | ---------------------------------------------------------------- | ------------ |
| `@parcelis/web`  | `apps/web`  | Next.js App Router operational UI                                | 3000         |
| `@parcelis/api`  | `apps/api`  | NestJS API, tRPC, OpenAPI middleware, object-storage integration | 4000         |
| `@parcelis/docs` | `apps/docs` | Docusaurus user, contributor, and generated API documentation    | 3001         |

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
POST /api/trpc/*
        |
        | Next.js rewrite
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

The web app creates a typed tRPC client in `apps/web/components/api-client.ts`. Browser requests use the same-origin `/api/trpc` path, which Next.js rewrites to the NestJS API so session cookies remain on the web origin. API procedures are defined in `apps/api/src/router/app.router.ts`; their inputs use schemas from `@parcelis/schemas`. The API context supplies the authenticated session and Nest's `PrismaService` to every procedure.

The API also mounts `publicRouter` at `/api/v1/*` through `OpenApiMiddleware`. The OpenAPI document is generated from that router and consumed by the Docusaurus API-reference generator.

## Frontend

`apps/web/app` contains Next.js App Router pages for the portfolio dashboard, properties, property units, tenants, and login. Page-level components compose shared UI controls from `@parcelis/ui` and feature components from `apps/web/components`.

Client-side server state uses TanStack Query. Query keys are centralized next to the tRPC client, allowing mutations to invalidate the corresponding property, tenant, unit, or note data predictably.

Use `@parcelis/ui` for reusable controls. New cross-screen controls belong in `packages/ui/src/components`; feature-specific forms and state helpers belong under `apps/web/components`.

## API

The NestJS application starts in `apps/api/src/main.ts`. `AppModule` mounts:

- `TrpcMiddleware` at `/trpc` and `/trpc/*` for application procedures.
- `OpenApiMiddleware` at `/api/v1` and `/api/v1/*` for documented public procedures.

Object storage is configured in `apps/api/src/modules/object-storage.config.ts`. The API generates signed download and upload URLs for private property and tenant images; the browser uploads directly to object storage after receiving a signed URL.

The API context resolves the session cookie and supplies Prisma. Application procedures require an authenticated
session. `RolePermission` stores independent View, Create, Edit, Archive, and Delete flags for each role and resource,
and API procedures enforce the applicable action. Notes use separate Property Notes, Unit Notes, Tenant Notes, and
Maintenance Notes resources. Note procedures require both the scoped Notes action and View access to the parent record.
Organization scoping is not yet implemented, so the API should not be treated as multi-tenant.

## Data model

Prisma models live in `packages/db/prisma/schema.prisma`. The operational model centers on:

```text
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

- A property holds its address, operational status, contacts, units, leases, tags, and maintenance tickets.
- A lease connects a tenant to a property unit label and holds rent, balance, dates, and lease status.
- Notes belong to exactly one property, unit, or tenant.
- Property and tenant images are stored as object keys in PostgreSQL; the image bytes live in object storage.

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

Docker Compose provides PostgreSQL, pgAdmin, MinIO, and the MinIO initialization job. The initialization job creates the private image bucket, public asset bucket, bucket policy, and local brand assets.

```bash
pnpm install
cp .env.example .env
docker compose up postgres pgadmin minio minio-init -d
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

## Design rules

- Keep shared input validation in `@parcelis/schemas`.
- Keep durable data constraints and migrations in `@parcelis/db`.
- Keep reusable visual primitives in `@parcelis/ui`.
- Keep API routes thin: validate input, perform domain/database work, and return a stable contract.
- Prefer transactions for multi-step writes that must remain consistent.
- Treat object storage as a separate persistence boundary: store object keys in PostgreSQL, not file bytes.
