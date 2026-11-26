import webPackage from "../../../web/package.json" with { type: "json" };

export function getInstallationMetadata(env: Readonly<Record<string, string | undefined>> = process.env) {
  const publicUrl = URL.parse(env.NEXTAUTH_URL?.trim() ?? "");
  const url =
    publicUrl &&
    (publicUrl.protocol === "https:" || publicUrl.protocol === "http:") &&
    !publicUrl.username &&
    !publicUrl.password &&
    !publicUrl.search &&
    !publicUrl.hash &&
    publicUrl.href.length <= 2048
      ? publicUrl.href
      : undefined;
  return { url, version: webPackage.version };
}
