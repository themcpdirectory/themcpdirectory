import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export type DnsResolver = (hostname: string) => Promise<string[]>;

export type UrlValidationOk = { ok: true; url: string };
export type UrlValidationFail = { ok: false; reason: string };
export type UrlValidationResult = UrlValidationOk | UrlValidationFail;

export interface ValidateUrlOptions {
  resolve?: DnsResolver;
}

const fail = (reason: string): UrlValidationFail => ({ ok: false, reason });

const LOCAL_SUFFIXES = [".local", ".localhost"];
const GLOBAL_IPV6_UNICAST = ipaddr.parseCIDR("2000::/3");
const FORMER_6BONE = ipaddr.parseCIDR("3ffe::/16");

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

export function isPublicIpAddress(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!ipaddr.isValid(normalized)) return false;

  const address = ipaddr.parse(normalized);
  if (address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) {
    return isPublicIpAddress(address.toIPv4Address().toString());
  }
  if (address instanceof ipaddr.IPv6) {
    return (
      address.range() === "unicast" &&
      address.match(GLOBAL_IPV6_UNICAST) &&
      !address.match(FORMER_6BONE)
    );
  }
  return address.range() === "unicast";
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

  if (ipaddr.isValid(rawHost)) {
    if (!isPublicIpAddress(rawHost)) return fail("blocked IP address");
    return { ok: true, url: parsed.href };
  }

  // Obfuscated IP detection
  const obfuscated = tryParseObfuscatedIp(hostname);
  if (obfuscated !== null) {
    if (!isPublicIpAddress(obfuscated)) return fail("blocked obfuscated IP address");
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

  if (addresses.length === 0) return fail("DNS resolution returned no addresses");

  for (const addr of addresses) {
    if (!isPublicIpAddress(addr)) return fail("hostname resolves to blocked address");
  }

  return { ok: true, url: parsed.href };
}
