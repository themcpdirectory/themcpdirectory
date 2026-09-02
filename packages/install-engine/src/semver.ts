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
  if (value.trim() !== value || value.length === 0) {
    throw new Error("Version must be an exact immutable npm version");
  }

  if (parseSemVer(value) === null || validSemver(value) === null) {
    throw new Error("Version must be an exact immutable npm version");
  }

  if (!isExactPackageVersionForRegistry("npm", value)) {
    throw new Error("Version must be an exact immutable npm version");
  }

  return value;
}
