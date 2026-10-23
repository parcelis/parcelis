import { writeFile } from "node:fs/promises";
import { generateOpenApiDocument } from "trpc-to-openapi";

const { publicRouter } = await import("../src/router/public.router.ts");

const document = generateOpenApiDocument(publicRouter, {
  title: "Parcelis API",
  version: "0.1.0",
  description:
    "Use an organization API token with Authorization: Bearer pcls_api_<secret>. " +
    "Create tokens in Settings → Organization → API tokens. Tokens grant full access to the " +
    "documented organization REST operations without granular scopes. No browser cookies or " +
    "organization-selection header are needed. Health is public.",
  securitySchemes: {
    Authorization: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "Opaque API token",
      description:
        "Enter the complete pcls_api_ credential created in organization settings. " +
        "Invalid, expired, or revoked credentials return 401. Tokens cannot authenticate browser sessions or tRPC.",
    },
  },
  baseUrl: "http://localhost:40010/api/v1",
});

await writeFile(new URL("../openapi/parcelis.openapi.json", import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
