# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine

WORKDIR /repo

RUN apk add --no-cache nginx openssl supervisor && corepack enable

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @parcelis/api build \
  && pnpm --filter @parcelis/web build

COPY infra/docker/app/nginx.conf /etc/nginx/http.d/default.conf
COPY infra/docker/app/supervisord.conf /etc/supervisord.conf

EXPOSE 3000

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
