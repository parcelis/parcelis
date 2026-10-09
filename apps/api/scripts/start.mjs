import { startNextApi } from "./server.mjs";

await startNextApi().catch((error) => {
  console.error("API startup failed.", error);
  process.exit(1);
});
