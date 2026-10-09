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
SEED_ADMIN_EMAIL=<demo administrator email>
NEXTAUTH_URL=https://<your-service>.onrender.com
NEXTAUTH_SECRET=<a private random secret shared by web and API>
```

Leave `NEXT_PUBLIC_API_URL` and `API_INTERNAL_URL` unset in Render. The scripts set the two API URLs to the local API. NextAuth uses host-only Secure cookies for the configured HTTPS public URL.

The API starts its separate Next.js runtime on the internal API port. The build
command produces the Next.js API; the web app remains a separate process.

The pre-deploy command applies migrations and seeds demo data. Sign in using the configured
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
