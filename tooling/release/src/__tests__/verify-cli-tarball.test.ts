import { describe, expect, it } from "vitest";
import { CLI_TARBALL_SMOKE_STEPS } from "../verify-cli-tarball.js";
import { RELEASE_CHECKS } from "../verify-release.js";

describe("cli tarball smoke", () => {
  it("covers deterministic pack, published bin, JSON, adapters, and receipt migration", () => {
    expect(CLI_TARBALL_SMOKE_STEPS).toEqual([
      "npm-pack-dry-run",
      "pnpm-pack",
      "inspect-tarball-allowlist",
      "hash-tarball-sha256",
      "install-into-temporary-prefix",
      "start-fake-directory-api",
      "published-bin-help",
      "published-bin-version",
      "search-json-schema",
      "info-json-schema",
      "list-json-schema",
      "doctor-json-schema",
      "add-dry-run-json-schema",
      "add-codex-dry-run-json-schema",
      "add-claude-code-dry-run-json-schema",
      "add-cursor-dry-run-json-schema",
      "codex-adapter-sandbox",
      "claude-code-adapter-sandbox",
      "cursor-adapter-sandbox",
      "receipt-migration",
    ]);
  });
});

describe("verify:release composition", () => {
  it("runs prerequisite, integrity, database, browser, security, and tarball gates", () => {
    expect(RELEASE_CHECKS).toEqual([
      "release:prerequisites",
      "format:check",
      "release:lockfile-integrity",
      "lint",
      "typecheck",
      "test",
      "test:integration",
      "test:cli",
      "release:database",
      "build",
      "test:e2e",
      "web:accessibility-release",
      "web:security-release",
      "test:lighthouse",
      "release:secret-scan",
      "release:dependency-audit",
      "release:cli-tarball",
    ]);
  });
});
