# Parcelis Agent Guide

## Architecture

- Workspace uses a pnpm/Turbo monorepo with apps in `apps/` and shared packages in `packages/`.
- Main apps:
  - `apps/web`: Next.js App Router frontend.
  - `apps/api`: NestJS backend exposing the tRPC router.
  - `apps/docs`: Docusaurus documentation site.
- Shared packages:
  - `packages/ui`: shadcn/ui-style Parcelis primitives and brand components.
  - `packages/schemas`: shared Zod schemas and inferred TypeScript types.
  - `packages/db`: Prisma schema, migrations, seed data, and database client exports.
  - `packages/config`: shared ESLint, Prettier, and TypeScript config.
- Use `@parcelis/*` workspace imports between apps and packages.
- Keep API input validation in `packages/schemas` so frontend and backend contracts stay aligned.

## Build/Test Commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Turbo dev: `pnpm dev:turbo`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Type check: `pnpm typecheck`
- Format: `pnpm format`
- Generate Prisma client: `pnpm db:generate`
- Run Prisma migrations: `pnpm db:migrate`
- Seed database: `pnpm db:seed`
- Run a package command directly with filters, for example `pnpm --filter @parcelis/web typecheck`.

## Local Development

- Copy environment defaults before first run: `cp .env.example .env`.
- Start required local services with `docker compose up postgres minio minio-init -d`.
- Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed` after installing or pulling schema changes.
- `pnpm dev` chooses open ports when defaults are busy and prints the selected URLs.
- Default local URLs are web `http://localhost:3000`, API `http://localhost:4000`, docs `http://localhost:3001`, and MinIO console `http://localhost:9001`.
- If `DATABASE_URL` is unset, the API falls back to `postgresql://parcelis:parcelis@localhost:55432/parcelis?schema=public`.
- Stop an existing watcher with `Ctrl+C` before starting a second dev run.

## Code Style

- Use TypeScript across apps and packages.
- Follow Prettier from `packages/config/prettier.config.cjs`: semicolons, double quotes, trailing commas, 100 character print width.
- Prefix intentionally unused variables or parameters with `_`.
- Prefer clear named exports for shared code.
- Use `async`/`await` for asynchronous logic.
- Keep comments sparse and only explain non-obvious logic or constraints.
- Avoid broad compatibility paths, unrelated refactors, and speculative abstractions.
- Run focused `typecheck` or `lint` commands for touched packages when possible.

## Frontend

- Use Next.js App Router patterns in `apps/web/app`.
- Components that use hooks or browser-only state need `"use client"`.
- Prefer shared primitives from `@parcelis/ui`. Do not create local UI controls, unless you specificially ask after looking for shared primitives or pulling them from shadcn.
- Add reusable UI primitives in `packages/ui/src/components`.
- Use Tailwind utility classes and existing Parcelis design tokens from the UI package.
- Use `lucide-react` icons for interface actions when an icon is appropriate.
- Keep operational screens dense, scannable, and task-focused rather than marketing-oriented.

## API and Data

- Add tRPC routes in `apps/api/src/router/app.router.ts` or split them when the router grows.
- Validate procedure inputs with Zod schemas from `@parcelis/schemas`.
- Keep Prisma models and migrations in `packages/db/prisma`.
- After editing `schema.prisma`, run `pnpm db:migrate` and `pnpm db:generate`.
- Seed local demo data with `pnpm db:seed`.
- Prefer Prisma transactions for multi-step writes that must stay consistent.

## Docs

- Docusaurus docs live in `apps/docs/content`.
- Update docs alongside user-facing workflow changes when behavior or setup changes, meaning when a commit happens.
- Keep docs concise and task-oriented.

## Git

- Never auto-commit unless explicitly asked.
- Never auto-push unless explicitly asked.
- Never stage changes unless explicitly asked.
- Do not revert unrelated working tree changes.
- Before changing a file with existing modifications, inspect it and preserve user work.

## Pull Requests

- Follow any templates in `.github` if creating or updating PR text.
- Keep summaries focused on user-visible behavior, touched packages, and verification.
- Mention skipped checks and why they were skipped.

## Gotchas

- This repo uses `pnpm@10.28.2`; avoid npm or yarn lockfile changes.
- `postinstall` runs Prisma client generation.
- Docker Compose maps Postgres to host port `55432` by default.
- `minio-init` is expected to exit after creating buckets and uploading brand assets.
- Use `docker compose down -v` only when intentionally deleting local database and object-storage volumes.
