# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

ENV FORCE_COLOR=0
WORKDIR /repo
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json apps/docs/package.json
RUN pnpm install --frozen-lockfile --filter @parcelis/docs...

FROM dependencies AS build
COPY apps/docs apps/docs
WORKDIR /repo/apps/docs
RUN pnpm build

FROM caddy:2-alpine AS caddy
COPY apps/docs/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/docs/build /srv
EXPOSE 80
