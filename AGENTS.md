# Parcelis Agent Guide

## Architecture

- Workspace uses a pnpm/Turbo monorepo with apps in `apps/` and shared packages in `packages/`.
- Main apps:
  - `apps/web`: Next.js App Router frontend.
  - `apps/api`: Next.js API exposing tRPC, REST, and Bull Board.
  - `apps/docs`: Legacy documentation site; maintained documentation lives in `parcelis/parcelis-docs`.
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
- If `DATABASE_URL` is unset, the API falls back to `postgresql://parcelis:parcelis@localhost:54320/parcelis?schema=public` only when `NODE_ENV` is `development` or `test`. Other environments require an explicit PostgreSQL URL; empty or invalid values fail startup.
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
- When editing `schema.prisma`, prefer Prisma portable types over provider-specific native types so the schema remains compatible with the repo's current PostgreSQL setup and supports future cross-database portability goals. If a provider-specific feature is unavoidable, document the constraint and its supported providers.
- After editing `schema.prisma`, run `pnpm db:migrate` and `pnpm db:generate`.
- Seed local demo data with `pnpm db:seed`.
- Prefer Prisma transactions for multi-step writes that must stay consistent.

## Docs

- User-facing documentation lives in [parcelis/parcelis-docs](https://github.com/parcelis/parcelis-docs).
- The current local checkout is `../parcelis-docs/parcelis-docs`. Read its repository instructions before editing; use its own tooling and package-manager version.
- The published Docusaurus site uses the `docusaurus-docs-site` branch, with guides in `docusaurus-site/docs` and its source OpenAPI specification in `docusaurus-site/static/openapi/parcelis.openapi.json`. Confirm these locations against that repository's instructions before editing.
- Assess documentation impact when planning every change. Changes to user-facing workflows, behavior, configuration, setup, permissions, or public APIs require corresponding documentation updates.
- Before finalizing a change, check whether it requires updates to any of the following:
  - Guides and API reference in `parcelis/parcelis-docs`. Do not use `apps/docs/content` as the destination for maintained user-facing documentation.
  - `DEPENDENCIES.md` when adding, removing, or materially changing a direct dependency or service.
  - `CONTRIBUTING.md` when changing the contributor workflow, development setup, or contribution standards.
  - `README.md` when changing the project overview, architecture, local setup, or primary workflows.
  - `ARCHITECTURE.md` when changing application boundaries, request/data flows, package responsibilities, infrastructure, or local runtime topology.
- Complete applicable updates in both repositories as part of the same task. Keep repository-local documentation changes in the application PR and link the companion docs PR in both directions when PRs are requested. Do not stage, commit, push, or create PRs without authorization.
- For public API changes, regenerate the OpenAPI specification in this repository, update the docs site's source specification, regenerate its API pages, and run the docs repository's relevant checks. Do not hand-edit generated API pages.
- If the docs checkout is unavailable or cannot be edited, report the affected pages and required changes as outstanding work. Do not claim the task is complete while required documentation remains outstanding.
- Include documentation changes and validation in the handoff or PR summary. If no documentation changes are needed, explain why.
- The `Documentation requirement` CI check requires exactly one populated PR-template field: `Companion docs PR:` with a full docs PR URL, or `Documentation not needed:` with an explanation. Leave the other field empty; exemptions require review.
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
