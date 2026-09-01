import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

export type DnsResolver = (hostname: string) => Promise<string[]>;

export type UrlValidationOk = { ok: true; url: string };
export type UrlValidationFail = { ok: false; reason: string };
export type UrlValidationResult = UrlValidationOk | UrlValidationFail;

export interface ValidateUrlOptions {
  resolve?: DnsResolver;
}

const fail = (reason: string): UrlValidationFail => ({ ok: false, reason });

const LOCAL_SUFFIXES = [".local", ".localhost"];

export function normalizeHttpUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;

  return parsed.href;
}

const defaultResolve: DnsResolver = async (hostname: string) => {
  const results: string[] = [];
  try {
    const v4 = await lookup(hostname, { family: 4, all: true });
    results.push(...v4.map((r) => r.address));
  } catch {
    /* may not have v4 */
  }
  try {
    const v6 = await lookup(hostname, { family: 6, all: true });
    results.push(...v6.map((r) => r.address));
  } catch {
    /* may not have v6 */
  }
  if (results.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }
  return results;
};

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true;
  const octets = parts.map(Number);
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true;

  const [a, b] = octets as [number, number];

  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true; // unspecified/current-network
  if (a >= 224) return true; // multicast + reserved + broadcast
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10

  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalized === "::1") return true;
  if (normalized === "::") return true;

  // fc00::/7 (unique-local)
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;

  // fe80::/10 (link-local)
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;

  // ::ffff:x.x.x.x (IPv4-mapped IPv6 — dotted-decimal form)
  const v4mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isBlockedIpv4(v4mapped[1]!);

  // ::ffff:HHHH:HHHH (IPv4-mapped IPv6 — hex form, e.g. ::ffff:c0a8:101)
  const v4hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4hex) {
    const hi = parseInt(v4hex[1]!, 16);
    const lo = parseInt(v4hex[2]!, 16);
    const mapped = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isBlockedIpv4(mapped);
  }

  // multicast ff00::/8
  if (normalized.startsWith("ff")) return true;

  return false;
}

function tryParseObfuscatedIp(hostname: string): string | null {
  // Decimal IP: 2130706433 = 127.0.0.1
  if (/^\d{8,10}$/.test(hostname)) {
    const num = Number(hostname);
    if (num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(".");
    }
  }

  // Hex IP: 0x7f000001 = 127.0.0.1
  if (/^0x[0-9a-f]{1,8}$/i.test(hostname)) {
    const num = parseInt(hostname, 16);
    if (num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(".");
    }
  }

  // Octal full form: 017700000001 = 127.0.0.1
  if (/^0[0-7]{9,11}$/.test(hostname)) {
    const num = parseInt(hostname, 8);
    if (num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(".");
    }
  }

  // Dotted octal/hex: 0177.0.0.1  or  0x7f.0.0.1
  const dotParts = hostname.split(".");
  if (dotParts.length === 4) {
    const parsed = dotParts.map((p) => {
      if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p, 16);
      if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
      if (/^\d+$/.test(p)) return parseInt(p, 10);
      return NaN;
    });
    if (parsed.every((n) => !Number.isNaN(n) && n >= 0 && n <= 255)) {
      return parsed.join(".");
    }
  }

  return null;
}

export async function validatePublicHttpUrl(
  value: string,
  options?: ValidateUrlOptions,
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail("invalid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return fail("scheme must be http or https");
  }

  if (parsed.username || parsed.password) {
    return fail("URL must not contain credentials");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "localhost" || hostname === "host.localhost") {
    return fail("localhost is blocked");
  }

  for (const suffix of LOCAL_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return fail(`hostname with ${suffix} suffix is blocked`);
    }
  }

  // Check for bracket-stripped IPv6
  const rawHost = hostname.replace(/^\[|\]$/g, "");

  if (isIPv6(rawHost) || rawHost.startsWith("::")) {
    if (isBlockedIpv6(rawHost)) return fail("blocked IPv6 address");
    return { ok: true, url: parsed.href };
  }

  if (isIPv4(rawHost)) {
    if (isBlockedIpv4(rawHost)) return fail("blocked IPv4 address");
    return { ok: true, url: parsed.href };
  }

  // Obfuscated IP detection
  const obfuscated = tryParseObfuscatedIp(hostname);
  if (obfuscated !== null) {
    if (isBlockedIpv4(obfuscated)) return fail("blocked obfuscated IP address");
    return { ok: true, url: parsed.href };
  }

  // DNS resolution
  const resolve = options?.resolve ?? defaultResolve;
  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch {
    return fail("DNS resolution failed");
  }

  for (const addr of addresses) {
    if (isIPv4(addr) && isBlockedIpv4(addr)) {
      return fail("hostname resolves to blocked address");
    }
    if (isIPv6(addr) && isBlockedIpv6(addr)) {
      return fail("hostname resolves to blocked IPv6 address");
    }
  }

  return { ok: true, url: parsed.href };
}
