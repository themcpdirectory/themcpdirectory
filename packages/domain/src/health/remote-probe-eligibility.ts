import type { HealthCheckOutcome } from "@themcpdirectory/api-contract";
import { validatePublicHttpUrl, type DnsResolver } from "@themcpdirectory/security";

const SUPPORTED_TRANSPORTS = new Set(["http", "sse", "streamable-http"]);
const AUTH_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "api-key",
]);

export interface RemoteProbeEligibilityInput {
  readonly listingStatus: string;
  readonly transportType: string;
  readonly urlTemplate: string;
  readonly headers: unknown;
  readonly variables: unknown;
}

export interface RemoteProbeEligibilityResult {
  readonly eligible: boolean;
  readonly outcome: HealthCheckOutcome;
  readonly reason: string | null;
  readonly normalizedUrl: string | null;
  readonly derivedAuthRequired: boolean;
  readonly derivedUnresolvedVariables: string[];
}

export interface RemoteProbeEligibilityOptions {
  readonly resolve?: DnsResolver;
}

function deriveAuthRequired(headers: unknown): boolean {
  if (!Array.isArray(headers)) return false;

  return headers.some((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? "")
      .trim()
      .toLowerCase();
    const value = String(record.value ?? "");
    return record.isSecret === true || AUTH_HEADER_NAMES.has(name) || /\$\{[^}]+\}/.test(value);
  });
}

function resolveUrlTemplate(
  urlTemplate: string,
  variables: unknown,
): { resolvedUrl: string; unresolvedRequiredVariables: string[] } {
  const variableMap =
    typeof variables === "object" && variables !== null && !Array.isArray(variables)
      ? (variables as Record<string, unknown>)
      : {};
  const placeholders = Array.from(
    new Set(Array.from(urlTemplate.matchAll(/\{([A-Za-z0-9_-]+)\}/g), (match) => match[1]!)),
  );
  const unresolvedRequiredVariables: string[] = [];
  let resolvedUrl = urlTemplate;

  for (const name of placeholders) {
    const candidate = variableMap[name];
    const entry =
      typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : undefined;
    const defaultValue =
      typeof entry?.default === "string" && entry.default.length > 0 ? entry.default : undefined;

    if (entry?.isSecret === true || (entry?.isRequired === true && defaultValue === undefined)) {
      unresolvedRequiredVariables.push(name);
      continue;
    }

    resolvedUrl = resolvedUrl.replaceAll(`{${name}}`, defaultValue ?? "");
  }

  return { resolvedUrl, unresolvedRequiredVariables };
}

function ineligible(
  outcome: "unsupported" | "unsafe_destination",
  reason: string,
  derivedAuthRequired: boolean,
  derivedUnresolvedVariables: string[],
): RemoteProbeEligibilityResult {
  return {
    eligible: false,
    outcome,
    reason,
    normalizedUrl: null,
    derivedAuthRequired,
    derivedUnresolvedVariables,
  };
}

export async function decideRemoteProbeEligibility(
  input: RemoteProbeEligibilityInput,
  options: RemoteProbeEligibilityOptions = {},
): Promise<RemoteProbeEligibilityResult> {
  const derivedAuthRequired = deriveAuthRequired(input.headers);
  const { resolvedUrl, unresolvedRequiredVariables: derivedUnresolvedVariables } =
    resolveUrlTemplate(input.urlTemplate, input.variables);

  if (input.listingStatus !== "active") {
    return ineligible(
      "unsupported",
      "listing is not active",
      derivedAuthRequired,
      derivedUnresolvedVariables,
    );
  }
  if (!SUPPORTED_TRANSPORTS.has(input.transportType)) {
    return ineligible(
      "unsupported",
      "remote transport is unsupported",
      derivedAuthRequired,
      derivedUnresolvedVariables,
    );
  }
  if (derivedAuthRequired) {
    return ineligible(
      "unsupported",
      "remote requires authentication",
      derivedAuthRequired,
      derivedUnresolvedVariables,
    );
  }
  if (derivedUnresolvedVariables.length > 0) {
    return ineligible(
      "unsupported",
      "remote has unresolved required URL variables",
      derivedAuthRequired,
      derivedUnresolvedVariables,
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(resolvedUrl);
  } catch {
    return ineligible(
      "unsafe_destination",
      "remote URL is invalid",
      derivedAuthRequired,
      derivedUnresolvedVariables,
    );
  }
  if (parsedUrl.protocol !== "https:") {
    return ineligible(
      "unsafe_destination",
      "remote URL must use HTTPS",
      derivedAuthRequired,
      derivedUnresolvedVariables,
    );
  }

  const validation = await validatePublicHttpUrl(
    parsedUrl.href,
    options.resolve ? { resolve: options.resolve } : undefined,
  );
  if (!validation.ok) {
    return ineligible(
      "unsafe_destination",
      validation.reason,
      derivedAuthRequired,
      derivedUnresolvedVariables,
    );
  }

  return {
    eligible: true,
    outcome: "unknown",
    reason: null,
    normalizedUrl: validation.url,
    derivedAuthRequired,
    derivedUnresolvedVariables,
  };
}
