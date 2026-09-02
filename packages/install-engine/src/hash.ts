import { createHash } from "node:crypto";
import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import type { InstallPlan, JsonValue, ResolvedInstallIntent } from "./types.js";

function compareOrdinal(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function canonicalError(message: string): TypeError {
  return new TypeError(message);
}

function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalizeJsonArray(
  value: readonly unknown[],
  path: readonly string[],
  stack: Set<object>,
): JsonValue {
  const items: JsonValue[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw canonicalError(`Canonical JSON does not support sparse arrays at ${path.join(".")}`);
    }

    items.push(canonicalizeJsonValue(value[index], [...path, String(index)], stack));
  }

  return items;
}

function canonicalizeJsonObject(
  value: Record<string, unknown>,
  path: readonly string[],
  stack: Set<object>,
): JsonValue {
  if (!isPlainJsonObject(value)) {
    throw canonicalError(`Canonical JSON requires plain objects at ${path.join(".") || "<root>"}`);
  }

  const symbolKeys = Object.getOwnPropertySymbols(value);
  if (symbolKeys.length > 0) {
    throw canonicalError(
      `Canonical JSON does not support symbol keys at ${path.join(".") || "<root>"}`,
    );
  }

  const out: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort(compareOrdinal)) {
    out[key] = canonicalizeJsonValue(value[key], [...path, key], stack);
  }

  return out;
}

export function canonicalizeJsonValue(
  value: unknown,
  path: readonly string[] = [],
  stack: Set<object> = new Set<object>(),
): JsonValue {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number": {
      if (!Number.isFinite(value)) {
        throw canonicalError(
          `Canonical JSON requires finite numbers at ${path.join(".") || "<root>"}`,
        );
      }

      return value;
    }
    case "undefined":
      throw canonicalError(`Canonical JSON does not support undefined at ${path.join(".")}`);
    case "function":
      throw canonicalError(`Canonical JSON does not support functions at ${path.join(".")}`);
    case "symbol":
      throw canonicalError(`Canonical JSON does not support symbols at ${path.join(".")}`);
    case "bigint":
      throw canonicalError(`Canonical JSON does not support bigint at ${path.join(".")}`);
    case "object": {
      if (stack.has(value)) {
        throw canonicalError(
          `Canonical JSON does not support cycles at ${path.join(".") || "<root>"}`,
        );
      }

      stack.add(value);
      try {
        if (Array.isArray(value)) {
          return canonicalizeJsonArray(value, path, stack);
        }

        return canonicalizeJsonObject(value as Record<string, unknown>, path, stack);
      } finally {
        stack.delete(value);
      }
    }
    default:
      throw canonicalError(`Canonical JSON does not support ${typeof value} at ${path.join(".")}`);
  }
}

export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

function hashCanonicalJson(value: unknown): string {
  return createHash("sha256").update(serializeCanonicalJson(value)).digest("hex");
}

export function hashInstallManifest(manifest: InstallManifestV1): string {
  return hashCanonicalJson(manifest);
}

export function hashResolvedInstallIntent(intent: ResolvedInstallIntent): string {
  return hashCanonicalJson(intent);
}

export function serializeInstallPlan(plan: InstallPlan): string {
  return serializeCanonicalJson(plan);
}
