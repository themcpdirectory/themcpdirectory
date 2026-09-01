import { describe, expect, it } from "vitest";
import { UnsupportedManifestVersionError } from "../index.js";

describe("UnsupportedManifestVersionError", () => {
  it("exposes the expected name, schemaVersion, and message", () => {
    const error = new UnsupportedManifestVersionError(0);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnsupportedManifestVersionError");
    expect(error.schemaVersion).toBe(0);
    expect(error.message).toBe("Unsupported install manifest schema version: 0");
  });
});
