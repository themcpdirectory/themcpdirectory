import { isSafePublicHttpsUrl } from "@themcpdirectory/registry-normalizer";
import { isIP } from "node:net";
import { getCliCommandMetadata } from "../command-metadata.js";
import type { CliDependencies } from "../dependencies.js";
import { readMaintainerManifest } from "./manifest-file.js";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";
import { parsePathArgs } from "./validate.js";

const COMMAND_NAME = "publish";
const DEFAULT_REGISTRY_BASE_URL = "https://registry.modelcontextprotocol.io";
export const PUBLISH_USAGE = getCliCommandMetadata(COMMAND_NAME)!.usage;

export async function runPublishCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult> {
  const parsed = parsePathArgs(COMMAND_NAME, argv);
  if (!parsed.ok) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 2,
      code: "USAGE_ERROR",
      message: parsed.message,
      stderrLines: [PUBLISH_USAGE],
    });
  }

  const local = await readMaintainerManifest(parsed.path, deps);
  if (!local.ok) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: local.code,
      message: local.message,
    });
  }

  const endpoint = resolveRegistryEndpoint(deps.environment.MCP_REGISTRY_BASE_URL);
  if (!endpoint) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "UNSAFE_REGISTRY_ENDPOINT",
      message: "MCP_REGISTRY_BASE_URL must be a public HTTPS URL without credentials.",
    });
  }

  const token = deps.environment.MCP_REGISTRY_TOKEN?.trim();
  if (!token) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "REGISTRY_TOKEN_MISSING",
      message: "Set MCP_REGISTRY_TOKEN before publishing.",
    });
  }

  let addresses: readonly string[];
  try {
    addresses = await (deps.dnsLookup ?? missingDnsLookup)(endpoint.hostname);
  } catch {
    return unsafeEndpoint();
  }
  if (addresses.length === 0 || addresses.some((address) => !isPublicIpAddress(address))) {
    return unsafeEndpoint();
  }
  const pinnedAddress = addresses[0]!;
  const pinnedAddressFamily = isIP(pinnedAddress);
  if (pinnedAddressFamily !== 4 && pinnedAddressFamily !== 6) {
    return unsafeEndpoint();
  }

  let response: { readonly status: number; readonly body: string };
  try {
    const transport = deps.registryPublishTransport;
    if (!transport) throw new Error("Registry publish transport is unavailable");
    response = await transport({
      endpoint,
      hostname: endpoint.hostname,
      resolvedAddresses: addresses,
      pinnedAddress,
      pinnedAddressFamily,
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(local.artifact),
      timeoutMs: deps.runtime.requestTimeoutMs,
    });
  } catch {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "REGISTRY_NETWORK_ERROR",
      message: "The Official MCP Registry could not be reached.",
    });
  }

  if (response.status >= 300 && response.status < 400) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "REGISTRY_REDIRECT_REJECTED",
      message: "The Official MCP Registry returned an unsafe redirect.",
    });
  }

  if (response.status < 200 || response.status >= 300) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "REGISTRY_HTTP_ERROR",
      message: `The Official MCP Registry rejected the publication with HTTP ${response.status}.`,
    });
  }

  let responseBody: unknown;
  try {
    responseBody = JSON.parse(response.body);
  } catch {
    return invalidResponse();
  }
  if (!isValidPublishResponse(responseBody)) return invalidResponse();

  return createSuccessResult(COMMAND_NAME, {
    path: local.path,
    registryUrl: endpoint.origin,
    name: responseBody.server.name,
    version: responseBody.server.version,
  });
}

async function missingDnsLookup(): Promise<readonly string[]> {
  return [];
}

function unsafeEndpoint(): CommandResult {
  return createFailureResult(COMMAND_NAME, {
    exitCode: 1,
    code: "UNSAFE_REGISTRY_ENDPOINT",
    message: "MCP_REGISTRY_BASE_URL must resolve only to public HTTPS addresses.",
  });
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  const [first, second, third] = octets as [number, number, number, number];
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isPublicIpv6(address: string): boolean {
  const bytes = parseIpv6Bytes(address);
  if (!bytes) return false;

  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPublicIpv4(bytes.slice(12).join("."));
  }

  const isUnspecified = bytes.every((byte) => byte === 0);
  const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const isDiscardOnly = bytes[0] === 0x01 && bytes.slice(1, 8).every((byte) => byte === 0);
  const isLocal = (bytes[0]! & 0xfe) === 0xfc;
  const isLinkLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80;
  const isMulticast = bytes[0] === 0xff;
  const isProtocolAssignment = bytes[0] === 0x20 && bytes[1] === 0x01 && (bytes[2]! & 0xfe) === 0;
  const isDocumentation =
    bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8;
  const isLocalTranslation =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes[4] === 0x00 &&
    bytes[5] === 0x01;

  return !(
    isUnspecified ||
    isLoopback ||
    isDiscardOnly ||
    isLocal ||
    isLinkLocal ||
    isMulticast ||
    isProtocolAssignment ||
    isDocumentation ||
    isLocalTranslation
  );
}

function parseIpv6Bytes(address: string): number[] | null {
  const normalized = address.toLowerCase().split("%")[0]!;
  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const words: number[] = [];
    for (const part of half.split(":")) {
      if (!/^[0-9a-f]{1,4}$/u.test(part)) return null;
      words.push(Number.parseInt(part, 16));
    }
    return words;
  };

  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (omitted < 0 || (halves.length === 1 && left.length !== 8)) return null;
  const words = [...left, ...Array.from({ length: omitted }, () => 0), ...right];
  if (words.length !== 8) return null;
  return words.flatMap((word) => [word >> 8, word & 0xff]);
}

function resolveRegistryEndpoint(value: string | undefined): URL | null {
  try {
    const base = new URL(value?.trim() || DEFAULT_REGISTRY_BASE_URL);
    if (!isSafePublicHttpsUrl(base.href)) {
      return null;
    }
    return new URL("/v0/publish", base);
  } catch {
    return null;
  }
}

function isValidPublishResponse(
  value: unknown,
): value is { readonly server: { readonly name: string; readonly version: string } } {
  if (typeof value !== "object" || value === null || !("server" in value)) return false;
  const server = (value as { readonly server?: unknown }).server;
  if (typeof server !== "object" || server === null) return false;
  const fields = server as { readonly name?: unknown; readonly version?: unknown };
  return (
    typeof fields.name === "string" &&
    fields.name.trim().length > 0 &&
    typeof fields.version === "string" &&
    fields.version.trim().length > 0
  );
}

function invalidResponse(): CommandResult {
  return createFailureResult(COMMAND_NAME, {
    exitCode: 1,
    code: "REGISTRY_RESPONSE_INVALID",
    message: "The Official MCP Registry returned an invalid publication response.",
  });
}
