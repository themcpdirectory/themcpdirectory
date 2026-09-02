import { parse as parseSemver, valid as validSemver } from "semver";
import { isExactPackageVersionForRegistry } from "@themcpdirectory/api-contract";

export interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
  readonly build: readonly string[];
}

export function parseSemVer(value: string): ParsedSemVer | null {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    value.startsWith("v") ||
    value.startsWith("V")
  ) {
    return null;
  }

  if (validSemver(value, { loose: false }) === null) {
    return null;
  }

  const parsed = parseSemver(value, { loose: false });
  if (!parsed) return null;

  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease.map(String),
    build: parsed.build.map(String),
  };
}

export function assertExactPinnedVersion(value: string): string {
  if (parseSemVer(value) === null || !isExactPackageVersionForRegistry("npm", value)) {
    throw new Error("Version must be an exact immutable npm version");
  }

  return value;
}
