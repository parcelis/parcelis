# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine

WORKDIR /repo
RUN apk add --no-cache openssl && corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @parcelis/api build

EXPOSE 4000
CMD ["pnpm", "--filter", "@parcelis/api", "start"]
