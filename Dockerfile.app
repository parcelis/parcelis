# syntax=docker/dockerfile:1
FROM node:24.21.0-alpine

WORKDIR /repo

RUN apk add --no-cache nginx openssl supervisor && corepack enable

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @parcelis/jobs build \
  && pnpm --filter @parcelis/worker build \
  && pnpm --filter @parcelis/api... build \
  && pnpm --filter @parcelis/web build

ARG API_INTERNAL_PORT=4000
COPY infra/docker/app/nginx.conf /etc/nginx/http.d/default.conf
COPY infra/docker/app/supervisord.conf /etc/supervisord.conf
RUN sed -i "s/__API_INTERNAL_PORT__/${API_INTERNAL_PORT}/g" \
  /etc/nginx/http.d/default.conf /etc/supervisord.conf

EXPOSE 3000

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
