# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine AS base

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
RUN DOCS_BASE_URL=/docs/ pnpm build

FROM nginx:1.31.3-alpine AS nginx
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/build /usr/share/nginx/html
EXPOSE 80
