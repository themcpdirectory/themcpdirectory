import { describe, expect, it } from "vitest";
import { assertExactPinnedVersion, parseSemVer } from "../index.js";

describe("parseSemVer", () => {
  it("parses exact stable versions", () => {
    expect(parseSemVer("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: [],
    });
  });

  it("parses prerelease and build metadata without losing segments", () => {
    expect(parseSemVer("2.3.4-beta.5+build.7")).toEqual({
      major: 2,
      minor: 3,
      patch: 4,
      prerelease: ["beta", "5"],
      build: ["build", "7"],
    });
  });

  it.each(["^1.2.3", "latest", "", "1.2", "1.2.3.4"])(
    "rejects non-exact semver input %s",
    (value) => {
      expect(parseSemVer(value)).toBeNull();
    },
  );
});

describe("assertExactPinnedVersion", () => {
  it.each(["1.2.3", "1.2.3-beta.5", "1.2.3+build.7", "1.2.3-beta.5+build.7"])(
    "accepts exact pinned version %s",
    (value) => {
      expect(assertExactPinnedVersion(value)).toBe(value);
    },
  );

  it.each(["^1.2.3", "latest", "", "1.2", " 1.2.3 "])(
    "rejects mutable or malformed version %s",
    (value) => {
      expect(() => assertExactPinnedVersion(value)).toThrow();
    },
  );
});
