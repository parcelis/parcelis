# syntax=docker/dockerfile:1
#
# Shared Parcelis application Dockerfile with explicit targets.
#
# - `app`: modular image with the web app and API, routed by the proxy image.
#   Deploy it together with the proxy image, plus a worker container
#   and Redis (Modular: app + worker + proxy).
# - `worker`: background worker with its production dependencies.
# - `single-image`: single application image with the web app, API, worker,
#   and public nginx routing. Deploy it instead of the
#   modular images (Simplified: single-image).
#
# PostgreSQL and S3-compatible object storage remain external services in both
# topologies, and database migrations stay an explicit deployment step.

FROM docker.io/library/node:24.22.2-alpine AS base
ENV FORCE_COLOR=0
WORKDIR /repo
RUN apk add --no-cache libc6-compat openssl && corepack enable

# Workspace manifests, lockfile, patches, and scripts. scripts/ must be present
# before any `pnpm install` because the root postinstall runs
# scripts/prisma-with-env.mjs (prisma db:generate).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
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
# the declared `dist/index.js` entries (notably @parcelis/email and
# @parcelis/jobs, which the api imports).
RUN pnpm --filter @parcelis/jobs build && pnpm --filter @parcelis/email build && pnpm --filter @parcelis/api build

# ---------------------------------------------------------------------------
# Worker build
# ---------------------------------------------------------------------------
FROM base AS worker-build
# Copy all workspace manifests so pnpm can resolve the worker's transitive
# workspace dependencies (db, email, jobs, config) without first needing
# their source files.
COPY packages packages
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile --filter @parcelis/worker...
COPY apps/worker apps/worker
# The worker imports `@parcelis/email` and `@parcelis/jobs` via their
# `dist/index.js` entries, so build them before the worker itself.
RUN pnpm --filter @parcelis/jobs build && pnpm --filter @parcelis/email build && pnpm --filter @parcelis/worker build

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

# The worker runtime is independent of the web and API build stages.
FROM base AS worker
ENV NODE_ENV=production
COPY --from=worker-build /repo/packages/db packages/db
COPY --from=worker-build /repo/packages/email/package.json packages/email/package.json
COPY --from=worker-build /repo/packages/email/dist packages/email/dist
COPY --from=worker-build /repo/packages/jobs/package.json packages/jobs/package.json
COPY --from=worker-build /repo/packages/jobs/dist packages/jobs/dist
COPY --from=worker-build /repo/apps/worker/package.json apps/worker/package.json
COPY --from=worker-build /repo/apps/worker/dist apps/worker/dist
RUN pnpm install --frozen-lockfile --prod --filter @parcelis/worker...
CMD ["node", "apps/worker/dist/main.js"]

# ---------------------------------------------------------------------------
# Shared production runtime base (web app + API)
# ---------------------------------------------------------------------------
FROM docker.io/library/node:24.22.2-alpine AS runtime-base
WORKDIR /repo
RUN apk add --no-cache openssl supervisor && corepack enable

# Workspace manifests and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts scripts
# API: manifest, Next.js build output, and startup configuration
COPY --from=api-build /repo/apps/api/package.json apps/api/package.json
COPY --from=api-build /repo/apps/api/.next apps/api/.next
COPY --from=api-build /repo/apps/api/scripts apps/api/scripts
COPY --from=api-build /repo/apps/api/src apps/api/src
COPY --from=api-build /repo/apps/api/next.config.mjs apps/api/next.config.mjs
# Workspace packages the api imports at runtime
COPY --from=api-build /repo/packages packages
# Web: manifest, build output, and public assets
COPY --from=web-build /repo/apps/web/package.json apps/web/package.json
COPY --from=web-build /repo/apps/web/.next apps/web/.next
COPY --from=web-build /repo/apps/web/public apps/web/public

# ---------------------------------------------------------------------------
# Modular application image
# ---------------------------------------------------------------------------
FROM runtime-base AS app
RUN pnpm install --frozen-lockfile --prod --filter @parcelis/api... --filter @parcelis/web...
ARG API_INTERNAL_PORT=4000
ENV API_PORT=${API_INTERNAL_PORT}
ENV API_INTERNAL_URL=http://127.0.0.1:${API_INTERNAL_PORT}
COPY infra/docker/app/supervisord.conf /etc/supervisord.conf
RUN sed -i "s/__API_INTERNAL_PORT__/${API_INTERNAL_PORT}/g" \
  /etc/supervisord.conf
EXPOSE 3001 ${API_INTERNAL_PORT}
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${API_PORT}/api/v1/health" && wget -q -O /dev/null http://127.0.0.1:3001/
CMD ["supervisord", "-c", "/etc/supervisord.conf"]

# ---------------------------------------------------------------------------
# Single application image (web app + API + public nginx)
# ---------------------------------------------------------------------------
FROM runtime-base AS single-image
RUN apk add --no-cache nginx
COPY --from=worker-build /repo/apps/worker/package.json apps/worker/package.json
COPY --from=worker-build /repo/apps/worker/dist apps/worker/dist
RUN pnpm install --frozen-lockfile --prod --filter @parcelis/api... --filter @parcelis/web... --filter @parcelis/worker...
ARG API_INTERNAL_PORT=4000
ENV API_INTERNAL_URL=http://127.0.0.1:${API_INTERNAL_PORT}
COPY infra/docker/single-image/nginx.conf /etc/nginx/http.d/default.conf
COPY infra/docker/single-image/supervisord.conf /etc/supervisord.conf
RUN sed -i "s/__API_INTERNAL_PORT__/${API_INTERNAL_PORT}/g" \
  /etc/nginx/http.d/default.conf /etc/supervisord.conf
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD sh -c 'wget -q -O /dev/null http://127.0.0.1:3000/api/v1/health && wget -q -O /dev/null http://127.0.0.1:3000/'
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
