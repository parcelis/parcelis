# syntax=docker/dockerfile:1
FROM node:24.21.0-alpine

WORKDIR /repo
RUN apk add --no-cache openssl && corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @parcelis/api... build

ENV API_PORT=4000
EXPOSE 4000
WORKDIR /repo/apps/api
CMD ["node", "scripts/start.mjs"]
