import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = process.env.PARCELIS_API_ROOT ?? fileURLToPath(new URL("../../", import.meta.url));
const apiRequire = createRequire(resolve(apiRoot, "package.json"));

export const invoicePdfAssets = {
  font: apiRequire.resolve("@fontsource/inter/files/inter-latin-400-normal.woff"),
  boldFont: apiRequire.resolve("@fontsource/inter/files/inter-latin-700-normal.woff"),
  banner: resolve(apiRoot, "../web/public/brand/parcelis-fullmark-light.png"),
  background: resolve(apiRoot, "../web/public/brand/parcelis-light-background.png"),
};
