import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_TARBALL_ALLOWLIST, CLI_TARBALL_SMOKE_STEPS } from "../verify-cli-tarball.js";
import {
  MCPDIR_WRAPPER_TARBALL_ALLOWLIST,
  MCPDIR_WRAPPER_TARBALL_SMOKE_STEPS,
} from "../verify-mcpdir-wrapper-tarball.js";
import * as wrapperVerifier from "../verify-mcpdir-wrapper-tarball.js";
import { RELEASE_CHECKS } from "../verify-release.js";

const CLI_PACKAGE_JSON = new URL("../../../../packages/cli/package.json", import.meta.url);
const MCPDIR_PACKAGE_JSON = new URL("../../../../packages/mcpdir/package.json", import.meta.url);
const RELEASE_TOOLS_PACKAGE_JSON = new URL("../../package.json", import.meta.url);

async function readPackageJson(url: URL): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(url, "utf8")) as Record<string, unknown>;
}

describe("mcpdir wrapper package", () => {
  it("delegates the unscoped binary to the exact canonical CLI version", async () => {
    const cliPackage = await readPackageJson(CLI_PACKAGE_JSON);
    const wrapperPackage = await readPackageJson(MCPDIR_PACKAGE_JSON);

    expect(wrapperPackage.name).toBe("mcpdir");
    expect(wrapperPackage.version).toBe(cliPackage.version);
    expect(wrapperPackage.bin).toEqual({ mcpdir: "bin/mcpdir.js" });
    expect(wrapperPackage.dependencies).toEqual({
      "@themcpdirectory/cli": `workspace:${String(cliPackage.version)}`,
    });
  });

  it("verifies the packed wrapper and its local canonical CLI dependency", () => {
    expect(MCPDIR_WRAPPER_TARBALL_ALLOWLIST).toEqual([
      "LICENSE",
      "README.md",
      "bin/mcpdir.js",
      "package.json",
    ]);
    expect(MCPDIR_WRAPPER_TARBALL_SMOKE_STEPS).toEqual([
      "verify-package-contract",
      "npm-pack-dry-run",
      "pnpm-pack-cli",
      "pnpm-pack-wrapper",
      "inspect-wrapper-tarball-allowlist",
      "verify-packed-cli-dependency",
      "hash-wrapper-tarball-sha256",
      "install-local-tarballs",
      "wrapper-bin-help",
      "wrapper-bin-version",
    ]);
  });

  it("runs both artifact verifiers from the existing release gate", async () => {
    const releaseToolsPackage = await readPackageJson(RELEASE_TOOLS_PACKAGE_JSON);

    expect(releaseToolsPackage.scripts).toMatchObject({
      "verify:cli-tarball":
        "tsx src/verify-cli-tarball.ts && tsx src/verify-mcpdir-wrapper-tarball.ts",
    });
  });

  it("smoke-tests the installed wrapper entry instead of the shared npm bin shim", () => {
    const verifierExports = wrapperVerifier as unknown as Record<string, unknown>;

    expect(typeof verifierExports.resolveInstalledWrapperEntryPath).toBe("function");
    const resolveInstalledWrapperEntryPath = verifierExports.resolveInstalledWrapperEntryPath as (
      installPrefix: string,
    ) => string;
    expect(resolveInstalledWrapperEntryPath("install-prefix")).toBe(
      path.join("install-prefix", "node_modules", "mcpdir", "bin", "mcpdir.js"),
    );
  });
});

describe("cli tarball smoke", () => {
  it("includes the package license", () => {
    expect(CLI_TARBALL_ALLOWLIST).toContain("LICENSE");
  });

  it("allows the public JavaScript entry point and generated TypeScript declarations", () => {
    expect(CLI_TARBALL_ALLOWLIST).toContain("dist/index.js");
    expect(CLI_TARBALL_ALLOWLIST).toContain("dist/index.d.ts");
    expect(CLI_TARBALL_ALLOWLIST).not.toContain("dist/commands/add.d.ts");
  });

  it("covers deterministic pack, published bin, JSON, adapters, and receipt migration", () => {
    expect(CLI_TARBALL_SMOKE_STEPS).toEqual([
      "npm-pack-dry-run",
      "pnpm-pack",
      "inspect-tarball-allowlist",
      "hash-tarball-sha256",
      "install-into-temporary-prefix",
      "typescript-consumer",
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
