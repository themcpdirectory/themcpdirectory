import { describe, expect, it } from "vitest";
import { resolveCliRuntimeConfig } from "../config/runtime.js";

describe("resolveCliRuntimeConfig", () => {
  it("uses the hosted Directory API by default and preserves explicit overrides", () => {
    expect(resolveCliRuntimeConfig({ env: {} }).apiBaseUrl).toBe(
      "https://api.themcpdirectory.org/api/v1",
    );

    expect(
      resolveCliRuntimeConfig({
        env: { MCPDIR_API_BASE_URL: "http://127.0.0.1:3001/api/v1" },
      }).apiBaseUrl,
    ).toBe("http://127.0.0.1:3001/api/v1");
  });
});
