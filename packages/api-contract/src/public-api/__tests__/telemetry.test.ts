import { describe, expect, it } from "vitest";
import { cliTelemetryEventV1Schema } from "../../index.js";

describe("cliTelemetryEventV1Schema", () => {
  it("accepts one valid event and rejects a client timestamp", () => {
    const validEvent = {
      schemaVersion: 1,
      event: "add",
      slug: "github",
      cliVersion: "1.2.3",
      client: "vscode",
      success: true,
      installVariant: "package",
    };

    expect(cliTelemetryEventV1Schema.parse(validEvent)).toEqual(validEvent);
    expect(
      cliTelemetryEventV1Schema.safeParse({
        ...validEvent,
        timestamp: "2026-09-06T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["free-form error", { error: "secret failure detail" }],
    ["query", { query: "private search" }],
    ["path", { path: "/Users/person/project" }],
    ["token", { token: "secret" }],
    ["unknown property", { futureField: true }],
    ["unsupported client", { client: "other-client" }],
    ["noncanonical slug", { slug: "GitHub" }],
    ["invalid semver", { cliVersion: "1.2" }],
    ["oversized semver", { cliVersion: `1.2.3-${"x".repeat(64)}` }],
  ])("rejects %s", (_name, override) => {
    expect(
      cliTelemetryEventV1Schema.safeParse({
        schemaVersion: 1,
        event: "add",
        slug: "github",
        cliVersion: "1.2.3",
        client: "vscode",
        success: false,
        installVariant: "package",
        ...override,
      }).success,
    ).toBe(false);
  });
});
