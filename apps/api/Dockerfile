# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @parcelis/api build

EXPOSE 4000
CMD ["pnpm", "--filter", "@parcelis/api", "start"]
