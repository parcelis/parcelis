# Parcelis Architecture

This document gives contributors a practical map of the Parcelis codebase, its runtime boundaries, and the main data flows.

## Overview

Parcelis is a property-management platform for landlords, small operators, and local property teams. It is a pnpm workspace managed with Turborepo. The system has web, API, docs, and worker applications and shared packages for UI, API contracts, jobs, configuration, and persistence.

```text
app image: Next.js web + NestJS API + worker + @parcelis/jobs

Browser --> proxy container --+--> application container (app image)
                              |       +--> Next.js web (apps/web)
                              |       +--> NestJS API (apps/api) --Prisma--> PostgreSQL
                              +--> documentation container (docs image)

worker container (app image) --> worker (apps/worker) --> Redis
```

The browser reaches the API through the same application origin. Direct public
asset URLs are served by MinIO / S3-compatible storage.

During local development, nginx listens on `http://localhost` and routes `/` to
the web app, `/trpc/*` and `/api/*` to the API, and `/docs/*` to Docusaurus.
The web, API, docs, and worker application processes continue to run on their own host runtime for hot reload.

## Monorepo structure

### Applications

| Package            | Location      | Responsibility                                                   | Default port |
| ------------------ | ------------- | ---------------------------------------------------------------- | ------------ |
| `@parcelis/web`    | `apps/web`    | Next.js App Router operational UI                                | 30000        |
| `@parcelis/api`    | `apps/api`    | NestJS API, tRPC, OpenAPI middleware, object-storage integration | 40010        |
| `@parcelis/docs`   | `apps/docs`   | Docusaurus user, contributor, and generated API documentation    | 40000        |
| `@parcelis/worker` | `apps/worker` | PostgreSQL outbox dispatch and BullMQ job enqueueing             | —            |

### Shared packages

| Package             | Location           | Responsibility                                                                         |
| ------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `@parcelis/ui`      | `packages/ui`      | Shared Tailwind and shadcn-style UI primitives, dialogs, drawers, and brand components |
| `@parcelis/schemas` | `packages/schemas` | Zod input schemas and inferred TypeScript contracts shared by web and API              |
| `@parcelis/db`      | `packages/db`      | Prisma schema, migrations, seed data, database client, and durable outbox operations   |
| `@parcelis/jobs`    | `packages/jobs`    | Queue names, Redis configuration, and versioned event and job contracts                |
| `@parcelis/email`   | `packages/email`   | Server-only SMTP transport and reusable email delivery capabilities                    |
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

PostgreSQL stores hashed session tokens, revocation state, a seven-day absolute expiration, and `lastSeenAt`. The shared API session check rejects revoked, disabled-account, absolutely expired, and idle sessions after 15 minutes without activity. `SESSION_IDLE_TIMEOUT_ENABLED=false` disables only the idle check. Authenticated browser interaction calls `auth.activity`; a conditional update accepts at most one activity timestamp per minute and rechecks validity so concurrent revocation cannot be undone. Background requests never renew activity. The browser uses the server's expiration timestamp for its warning and shares renewals and logout across tabs. The `parcelis_session_v2` cookie requires existing users to sign in again when this policy is deployed. Redis remains dedicated to background jobs.

The API also mounts `publicRouter` at `/api/v1/*` through `OpenApiMiddleware`. The OpenAPI document is generated from that router and consumed by the Docusaurus API-reference generator.

## Background jobs and outbox

`recordOutboxEvent` records an `OutboxEvent` in PostgreSQL in the same transaction as a related database change. Account notification flows (registration verification, verification resend, administrator-created account verification, and password-reset requests) write `notification.email` outbox events and do not send directly from request handlers. The worker claims due events with a time-limited claim token, validates each versioned contract from `@parcelis/jobs`, and adds a BullMQ job to Redis with a deterministic job ID. It then records dispatch success in PostgreSQL. A temporary queue error returns the event to `pending` with capped exponential backoff and continues retrying until it succeeds. Unsupported event versions or malformed payloads remain `failed`; application administrators can inspect operational metadata and replay failed outbox events within the active organization. Failed-event API responses omit payloads and raw errors, and replay returns only the event ID, organization ID, and status, so email verification and password-reset bearer links remain private to the delivery path. Stored payloads remain intact for retries. A composite foreign key requires each notification delivery to reference an outbox event in the same organization.

The worker also consumes `notification.email` jobs from the `account-notifications` queue and sends them through `@parcelis/email`. This consumer is always enabled in the worker process. Account verification and password-reset jobs carry optional template metadata; the worker renders their React Email templates, while existing plain-text jobs remain supported. Deploy the template-aware worker before the API starts writing these jobs, because older workers reject the new payload field. Before delivery, it resolves the event organization’s saved SMTP configuration through `@parcelis/email`, falling back to environment SMTP only when no configuration exists. The API and worker share `EMAIL_SETTINGS_ENCRYPTION_KEY` to decrypt saved credentials. The dispatcher checks about every minute for queued or sending deliveries whose dispatched BullMQ job is missing and restores them with a deterministic job ID. The worker retries temporary SMTP failures up to three attempts with exponential backoff, marks permanent failures immediately, and records attempts and final outcomes in PostgreSQL. After SMTP accepts a message, the worker saves its message ID on the BullMQ job and on the delivery row before marking it sent. Recovery copies the saved database ID into a replacement job, so a later database failure does not cause another SMTP send even if the original Redis job disappears. A crash before either checkpoint can still cause duplicate delivery because SMTP, Redis, and PostgreSQL cannot commit atomically.

Future leases write `lease.activate` outbox events due on their UTC start date. The worker consumes these jobs from the `leasing-notifications` queue and activates each due lease in a transaction that also updates property occupancy. For a back-to-back lease, the same transaction ends an expired predecessor and transfers occupancy. A startup and minute-by-minute database reconciliation activates due scheduled leases if a queue job is lost or exhausted. Repeated jobs leave an already active lease unchanged.

The account email flow and recovery paths are illustrated in [Email Configuration](apps/docs/content/getting-started/email-configuration.mdx#background-delivery-and-recovery).

The API mounts Bull Board at `/admin/jobs` for application administrators. Administrators can operate queue jobs from the dashboard; unsafe requests require the configured web origin. The dashboard hides Redis connection details and redacts job payloads and error diagnostics before returning them. Local and production proxies expose it at `/admin/jobs/` on the Parcelis host. The web app routes dashboard visits through `/settings/jobs`, where Bull Board runs in a same-origin frame. User interaction in the frame reaches the shared browser session monitor; Bull Board's background requests do not renew the session. The API enforces the same PostgreSQL idle check on every dashboard request.

Idempotency keys preserve the first recorded event and its initial schedule. Repeating a key does not reschedule the event; `availableAt` can subsequently change through retry backoff or administrator replay.

PostgreSQL is the durable source of truth and Redis is the delivery mechanism. Delivery is at least once: a worker can crash after enqueueing a job but before recording success, so job consumers must be idempotent. Expired claims make interrupted events eligible for recovery after a worker restart.

Outbox rows are retained indefinitely in the initial implementation; no automatic cleanup runs. This preserves the organization-scoped idempotency-key constraint. Add archival before introducing deletion, and retain idempotency tombstones if archived rows are removed.

## Frontend

`apps/web/app` contains Next.js App Router pages for the portfolio dashboard, properties, property units, tenants, and login. Page-level components compose shared UI controls from `@parcelis/ui` and feature components from `apps/web/components`.

Client-side server state uses TanStack Query. Query keys are centralized next to the tRPC client, allowing mutations to invalidate the corresponding property, tenant, unit, or note data predictably.

Use `@parcelis/ui` for reusable controls. New cross-screen controls belong in `packages/ui/src/components`; feature-specific forms and state helpers belong under `apps/web/components`.

The expanded sidebar shows the active organization and, for users with access to more than one, provides an organization switcher. Organization settings in `apps/web/app/settings/organization` manage the organization name, slug, and light and dark avatar images.

## API

The NestJS application starts in `apps/api/src/main.ts`. `AppModule` mounts:

- `TrpcMiddleware` at `/trpc` and `/trpc/*` for application procedures.
- `OpenApiMiddleware` at `/api/v1` and `/api/v1/*` for documented public procedures.
- Bull Board at `/admin/jobs` for administrator-only queue monitoring and job operations.

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
  |- Lease -> Unit
  |- MaintenanceTicket
  |- Tag (many-to-many)
  `- Note

Lease
  |- LeaseTenant -> Tenant
  `- Invoice

Tenant
  |- EmergencyContact
  |- LeaseTenant -> Lease
  `- Note
```

- An organization owns operational records. Membership gives a user access to an organization and records the organization-level role; users also retain a default organization and sessions retain an active organization.
- A property holds its address, operational status, contacts, units, leases, tags, and maintenance tickets.
- A lease belongs to a property and unit, supports one or more tenants, and holds rent, dates, and lease status.
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

`docker-compose-dev.yml` provides PostgreSQL, pgAdmin, Redis, MinIO, and the MinIO initialization job for host-based development. Redis is password-protected and reserved for background jobs. The initialization job creates the private image bucket, public asset bucket, bucket policy, and local brand assets. `docker-compose.yml` runs published Parcelis application and documentation images with PostgreSQL, Redis, and MinIO.

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

The durable outbox and dispatcher checks can be run with:

```bash
pnpm --filter @parcelis/db test
pnpm --filter @parcelis/worker test
```

## Container deployment

`Dockerfile.app` builds `apps/web`, `apps/api`, `apps/worker`, and `packages/jobs` into the single `app` image. Nginx routes browser requests to Next.js and forwards `/trpc/*` and `/api/*` to NestJS inside the application container. Production Compose runs a separate worker container from the same image and connects it to Redis. The production Compose proxy is the `proxy` image and routes `/docs/*` to the documentation container. A release workflow publishes `app`, `docs`, and `proxy` to Docker Hub when a GitHub release is published.

## Design rules

- Keep shared input validation in `@parcelis/schemas`.
- Keep durable data constraints and migrations in `@parcelis/db`.
- Keep reusable visual primitives in `@parcelis/ui`.
- Keep API routes thin: validate input, perform domain/database work, and return a stable contract.
- Prefer transactions for multi-step writes that must remain consistent.
- Treat object storage as a separate persistence boundary: store object keys in PostgreSQL, not file bytes.
