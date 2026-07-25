import { writeFile } from "node:fs/promises";
import { generateOpenAPIDocument } from "@trpc/openapi";

const operationSummaries = {
  health: "Check API health",
  "properties.list": "List properties",
  "properties.byId": "Get a property",
  "properties.create": "Create a property",
  "properties.update": "Update a property",
  "properties.archive": "Archive a property",
  "properties.delete": "Delete a property",
  "properties.updateNotes": "Update property notes",
  "unitOptions.list": "List unit options",
};

const tagNames = {
  health: "System",
  properties: "Properties",
  unitOptions: "Unit options",
};

const document = await generateOpenAPIDocument("./src/router/app.router.ts", {
  exportName: "AppRouter",
  title: "Parcelis API",
  version: "0.1.0",
  servers: [{ url: "http://localhost:4000/api" }],
});

for (const pathItem of Object.values(document.paths ?? {})) {
  for (const operation of Object.values(pathItem ?? {})) {
    if (
      !operation ||
      typeof operation !== "object" ||
      !("operationId" in operation)
    ) {
      continue;
    }

    const summary = operationSummaries[operation.operationId];

    if (!summary) {
      throw new Error(`Missing friendly name for ${operation.operationId}`);
    }

    operation.summary = summary;
    operation.tags = operation.tags?.map((tag) => tagNames[tag] ?? tag);
  }
}

document.paths = Object.fromEntries(
  Object.entries(document.paths ?? {}).map(([path, operation]) => [
    path.replaceAll(".", "/"),
    operation,
  ]),
);

await writeFile(
  new URL("../openapi/parcelis.openapi.json", import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
