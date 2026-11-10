FROM nginx:1.31.8-alpine AS proxy

ARG API_INTERNAL_PORT=4000
COPY infra/docker/proxy/nginx.conf /etc/nginx/conf.d/default.conf
RUN sed -i "s/__API_INTERNAL_PORT__/${API_INTERNAL_PORT}/g" /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/api/v1/health && wget -q -O /dev/null http://127.0.0.1/
