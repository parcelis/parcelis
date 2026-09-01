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
- API tests: `pnpm --filter @parcelis/api test`
- End-to-end tests: `pnpm test:e2e`
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
- Default local URLs are web `http://localhost:30000`, API `http://localhost:40010`, docs `http://localhost:40000`, and MinIO console `http://localhost:9010`.
- If `DATABASE_URL` is unset, the API falls back to `postgresql://parcelis:parcelis@localhost:54320/parcelis?schema=public`.
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
- Use Flexbox for layout. Do not use CSS Grid or Tailwind `grid` utilities.
- Use `lucide-react` icons for interface actions when an icon is appropriate.
- Use the default `Button` size with `className="min-w-40"` for standard page-header actions,
  back-navigation buttons, and drawer-footer actions. Match the Edit Property drawer buttons for
  height, padding, and minimum width.
- Reserve `size="sm"` and compact widths for dense table actions, icon-only controls, and
  multi-action toolbars where standard buttons would cause overflow.
- Use `variant="destructive"` for actions that permanently delete data; it uses a red outline, red content, and a
  white surface. Use `variant="secondary"` for
  non-destructive actions such as archive, cancel, and back navigation; a confirmation dialog's final action may use
  `primary` to distinguish it from cancellation.
- In drawer footers, place Cancel on the left and the primary action on the right. Use
  `ChevronRight` after the label for every Next button.
- Keep operational screens dense, scannable, and task-focused rather than marketing-oriented.

## API and Data

- Add tRPC routes in `apps/api/src/router/app.router.ts` or split them when the router grows.
- Keep API unit and router tests in feature folders under `apps/api/src/tests`, such as
  `apps/api/src/tests/permissions`.
- Validate procedure inputs with Zod schemas from `@parcelis/schemas`.
- For schemas that are not database-driven, define them once in a central shared location and import them where needed; never duplicate or hardcode the same schema in multiple places.
- Keep Prisma models and migrations in `packages/db/prisma`.
- After editing `schema.prisma`, run `pnpm db:migrate` and `pnpm db:generate`.
- Seed local demo data with `pnpm db:seed`.
- Prefer Prisma transactions for multi-step writes that must stay consistent.

## Docs

- Docusaurus docs live in `apps/docs/content`.
- Before finalizing a change, check whether it requires updates to any of the following:
  - Docusaurus content in `apps/docs/content` for user-facing workflows, behavior, or setup.
  - `DEPENDENCIES.md` when adding, removing, or materially changing a direct dependency or service.
  - `CONTRIBUTING.md` when changing the contributor workflow, development setup, or contribution standards.
  - `README.md` when changing the project overview, architecture, local setup, or primary workflows.
  - `ARCHITECTURE.md` when changing application boundaries, request/data flows, package responsibilities, infrastructure, or local runtime topology.
- Make the applicable documentation updates in the same change. If none are needed, state that in the handoff or pull request summary.
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

## GitHub Issues

- Before creating or updating an issue, inspect `.github/ISSUE_TEMPLATE` and use the matching template's title format, labels, required sections, and checklists.
- Search existing issues for duplicates before creating a new one.

## Gotchas

- This repo uses `pnpm@11.20.0`; avoid npm or yarn lockfile changes.
- `postinstall` runs Prisma client generation.
- Docker Compose maps local dependencies to the documented default host ports.
- `minio-init` is expected to exit after creating buckets and uploading brand assets.
- Use `docker compose down -v` only when intentionally deleting local database and object-storage volumes.
