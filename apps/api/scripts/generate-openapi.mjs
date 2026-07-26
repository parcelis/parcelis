import { writeFile } from "node:fs/promises";
import { generateOpenApiDocument } from "trpc-to-openapi";

const { publicRouter } = await import("../src/router/public.router.ts");

const document = generateOpenApiDocument(publicRouter, {
  title: "Parcelis API",
  version: "0.1.0",
  baseUrl: "http://localhost:4000/api/v1",
});

await writeFile(
  new URL("../openapi/parcelis.openapi.json", import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
