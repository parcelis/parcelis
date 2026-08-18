# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine

WORKDIR /repo
RUN apk add --no-cache openssl && corepack enable
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_S3_URL
ARG NEXT_PUBLIC_BRAND_LOGO_URL
ARG NEXT_PUBLIC_DARK_BRAND_LOGO_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_S3_URL=$NEXT_PUBLIC_S3_URL
ENV NEXT_PUBLIC_BRAND_LOGO_URL=$NEXT_PUBLIC_BRAND_LOGO_URL
ENV NEXT_PUBLIC_DARK_BRAND_LOGO_URL=$NEXT_PUBLIC_DARK_BRAND_LOGO_URL
RUN pnpm install --frozen-lockfile && pnpm --filter @parcelis/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@parcelis/web", "exec", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
