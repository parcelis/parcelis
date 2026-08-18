FROM nginx:1.31.3-alpine AS proxy

COPY infra/docker/proxy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
