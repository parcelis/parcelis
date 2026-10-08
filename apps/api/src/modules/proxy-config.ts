let trustedProxyHops: number | undefined;

export function parseTrustedProxyHops(value: string | undefined) {
  const hops = Number(value ?? 0);
  if (!Number.isSafeInteger(hops) || hops < 0) {
    throw new Error("API_TRUST_PROXY_HOPS must be a non-negative integer.");
  }
  return hops;
}

export function getTrustedProxyHops() {
  trustedProxyHops ??= parseTrustedProxyHops(process.env.API_TRUST_PROXY_HOPS);
  return trustedProxyHops;
}
