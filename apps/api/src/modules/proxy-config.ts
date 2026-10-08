let trustedProxyHops: number | undefined;

export function parseTrustedProxyHops(value: string | undefined) {
  const raw = value?.trim() ?? "0";
  const hops = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(hops)) {
    throw new Error("API_TRUST_PROXY_HOPS must be a non-negative integer.");
  }
  return hops;
}

export function getTrustedProxyHops() {
  trustedProxyHops ??= parseTrustedProxyHops(process.env.API_TRUST_PROXY_HOPS);
  return trustedProxyHops;
}
