import { describe, expect, it } from "vitest";
import { assertExactPinnedVersion, parseSemVer } from "../index.js";

const exactVersionCases = [
  {
    name: "stable",
    value: "1.2.3",
    expected: {
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: [],
    },
  },
  {
    name: "prerelease",
    value: "2.3.4-beta.5",
    expected: {
      major: 2,
      minor: 3,
      patch: 4,
      prerelease: ["beta", "5"],
      build: [],
    },
  },
  {
    name: "build metadata",
    value: "3.4.5+build.7",
    expected: {
      major: 3,
      minor: 4,
      patch: 5,
      prerelease: [],
      build: ["build", "7"],
    },
  },
  {
    name: "prerelease with build metadata",
    value: "4.5.6-rc.1+build.9",
    expected: {
      major: 4,
      minor: 5,
      patch: 6,
      prerelease: ["rc", "1"],
      build: ["build", "9"],
    },
  },
] as const;

const invalidVersionCases = [
  "v1.2.3",
  " 1.2.3",
  "1.2.3 ",
  "^1.2.3",
  "~1.2.3",
  "latest",
  "",
  "1.2",
  "1.2.3.4",
] as const;

describe("parseSemVer", () => {
  it.each(exactVersionCases)("parses exact $name versions", ({ value, expected }) => {
    expect(parseSemVer(value)).toEqual(expected);
  });

  it.each(invalidVersionCases)("rejects malformed or mutable semver input %s", (value) => {
    expect(parseSemVer(value)).toBeNull();
  });
});

describe("assertExactPinnedVersion", () => {
  it.each(exactVersionCases)("accepts exact pinned $name versions", ({ value }) => {
    expect(assertExactPinnedVersion(value)).toBe(value);
  });

  it.each(invalidVersionCases)("rejects malformed or mutable version %s", (value) => {
    expect(() => assertExactPinnedVersion(value)).toThrow(
      "Version must be an exact immutable npm version",
    );
  });
});
