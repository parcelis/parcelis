# Render demo deployment

This folder contains Render-only commands for serving the web app and API from one Web Service. It does not change the application's normal development or production scripts.

Configure the Render service with:

```text
Build Command: node demo/render/build.mjs
Pre-Deploy Command: node demo/render/prepare.mjs
Start Command: node demo/render/start.mjs
```

Set these environment variables:

```ini
DATABASE_URL=<Render PostgreSQL internal connection string>
WEB_ORIGIN=https://<your-service>.onrender.com
SEED_ADMIN_PASSWORD=<a unique password of at least 12 characters>
AUTH_COOKIE_SECURE=true
```

Leave `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`, and `AUTH_COOKIE_DOMAIN` unset in Render. The scripts set the two API URLs to the local API and keep authentication cookies scoped to the Render service.

The pre-deploy command applies migrations and seeds demo data. Sign in using `admin@parcelis.dev` and the configured `SEED_ADMIN_PASSWORD`.
