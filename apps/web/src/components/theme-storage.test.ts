import { describe, expect, it } from "vitest";
import { readThemePreference, writeThemePreference } from "./theme-provider";

describe("theme preference storage", () => {
  it("falls back to system when storage access throws", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    } as unknown as Storage;

    expect(readThemePreference(storage)).toBe("system");
    expect(() => writeThemePreference(storage, "dark")).not.toThrow();
  });
});
