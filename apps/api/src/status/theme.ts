export const statusThemes = ["light", "dark", "system"] as const;
export type StatusTheme = (typeof statusThemes)[number];
const themeCookieName = "parcelis-status-theme";

function parseTheme(value: string | null | undefined): StatusTheme | undefined {
  return statusThemes.find((theme) => theme === value);
}

export function getStatusTheme(url: URL, cookieHeader = "") {
  const requested = parseTheme(url.searchParams.get("theme"));
  const stored = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${themeCookieName}=`))
    ?.slice(themeCookieName.length + 1);
  return {
    theme: requested ?? parseTheme(stored) ?? "system",
    cookie: requested ? `${themeCookieName}=${requested}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly` : undefined,
  };
}
