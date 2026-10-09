export class NextAuthConfigurationError extends Error {}

export function getNextAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) throw new NextAuthConfigurationError("NEXTAUTH_SECRET is required for NextAuth authentication.");
  return secret;
}

export function getNextAuthConfiguration() {
  const secret = getNextAuthSecret();
  try {
    const url = new URL(process.env.NEXTAUTH_URL ?? "");
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");
    return { secret };
  } catch {
    throw new NextAuthConfigurationError("NEXTAUTH_URL must be the public Parcelis HTTP or HTTPS URL.");
  }
}
