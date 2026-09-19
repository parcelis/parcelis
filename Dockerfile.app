# syntax=docker/dockerfile:1
#
# Shared Parcelis application Dockerfile with explicit targets.
#
# - `app`: modular image with the web app, API, and internal nginx. Deploy it
#   together with the docs and proxy images (Modular: app + docs + proxy).
# - `all-in-one`: single application image with the web app, API,
#   documentation site, and public nginx routing. Deploy it instead of the
#   modular images (Simplified: all-in-one).
#
# PostgreSQL and S3-compatible object storage remain external services in both
# topologies, and database migrations stay an explicit deployment step.

FROM docker.io/library/node:24.21.0-alpine AS base
ENV FORCE_COLOR=0
WORKDIR /repo
RUN apk add --no-cache libc6-compat openssl && corepack enable

# Workspace manifests, lockfile, patches, and scripts. scripts/ must be present
# before any `pnpm install` because the root postinstall runs
# scripts/prisma-with-env.mjs (prisma db:generate).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY scripts scripts

# ---------------------------------------------------------------------------
# API build
# ---------------------------------------------------------------------------
FROM base AS api-build
# Copy all workspace manifests so pnpm can resolve the api's transitive
# workspace dependencies (db, email, schemas, config) without first needing
# their source files.
COPY packages packages
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @parcelis/api...
COPY apps/api apps/api
# Build the api and every workspace it depends on so the runtime can resolve
# the declared `dist/index.js` entries (notably @parcelis/email).
RUN pnpm --filter @parcelis/email build && pnpm --filter @parcelis/api build

# ---------------------------------------------------------------------------
# Web build
# ---------------------------------------------------------------------------
FROM base AS web-build
# The web app declares `@parcelis/api` as a workspace dependency, so the api
# workspace manifest must be present before pnpm install.
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile --filter @parcelis/web...
# The web imports `type AppRouter from "@parcelis/api/router"`, whose
# `package.json#exports.router.default` points at `src/router/app.router.ts`.
# Copy the api source so TypeScript can resolve the router types during the
# Next build. (The api is already linked into the web's node_modules via
# pnpm workspace symlinks, so this is the only missing piece on disk.)
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @parcelis/web build

# ---------------------------------------------------------------------------
# Docs build
# ---------------------------------------------------------------------------
FROM base AS docs-build
COPY apps/docs/package.json apps/docs/package.json
COPY packages packages
# @parcelis/docs has no workspace dependencies, so @parcelis/db is listed
# explicitly: the root postinstall (`pnpm db:generate`) needs the Prisma CLI
# on every `pnpm install`, including this filtered one.
RUN pnpm install --frozen-lockfile --filter @parcelis/docs... --filter @parcelis/db...
COPY apps/docs apps/docs
WORKDIR /repo/apps/docs
ENV DOCS_BASE_URL=/docs/
RUN pnpm build

# ---------------------------------------------------------------------------
# Shared production runtime base (web app + API)
# ---------------------------------------------------------------------------
FROM docker.io/library/node:24.21.0-alpine AS runtime-base
WORKDIR /repo
RUN apk add --no-cache nginx openssl supervisor && corepack enable

# Workspace manifests and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY scripts scripts
# API: manifest and compiled output
COPY --from=api-build /repo/apps/api/package.json apps/api/package.json
COPY --from=api-build /repo/apps/api/dist apps/api/dist
# Workspace packages the api imports at runtime
COPY --from=api-build /repo/packages packages
# Web: manifest, build output, and public assets
COPY --from=web-build /repo/apps/web/package.json apps/web/package.json
COPY --from=web-build /repo/apps/web/.next apps/web/.next
COPY --from=web-build /repo/apps/web/public apps/web/public

# Production-only install: the api runs from dist/ and the web from .next/, so
# the development toolchain stays out of the image. The Prisma CLI is a
# production dependency of @parcelis/db, so migration tooling
# (`prisma migrate deploy`) and the postinstall client generation remain
# available.
RUN pnpm install --frozen-lockfile --prod --filter @parcelis/api... --filter @parcelis/web...

# ---------------------------------------------------------------------------
# Modular application image
# ---------------------------------------------------------------------------
FROM runtime-base AS app
COPY infra/docker/app/nginx.conf /etc/nginx/http.d/default.conf
COPY infra/docker/app/supervisord.conf /etc/supervisord.conf
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD sh -c 'wget -q -O /dev/null http://127.0.0.1:3000/api/v1/health && wget -q -O /dev/null http://127.0.0.1:3000/'
CMD ["supervisord", "-c", "/etc/supervisord.conf"]

# ---------------------------------------------------------------------------
# Single application image (web app + API + docs + public nginx)
# ---------------------------------------------------------------------------
FROM runtime-base AS all-in-one
# Docs build output (static files served directly by nginx)
COPY --from=docs-build /repo/apps/docs/build /usr/share/parcelis-docs
COPY infra/docker/all-in-one/nginx.conf /etc/nginx/http.d/default.conf
# Reuse the modular supervisor configuration: api + web + nginx on the same
# loopback ports the nginx config expects.
COPY infra/docker/app/supervisord.conf /etc/supervisord.conf
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD sh -c 'wget -q -O /dev/null http://127.0.0.1:3000/api/v1/health && wget -q -O /dev/null http://127.0.0.1:3000/'
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
