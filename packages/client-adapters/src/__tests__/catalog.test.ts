import { describe, expect, it } from "vitest";
import { getSupportedClientById, SUPPORTED_CLIENTS } from "../index.js";

describe("SUPPORTED_CLIENTS", () => {
  it("pins the approved Phase D client identifiers and factual capabilities", () => {
    expect(SUPPORTED_CLIENTS.map((client) => client.id)).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "vscode",
    ]);
    expect(getSupportedClientById("cursor")).toMatchObject({
      name: "Cursor",
      capabilities: {
        deeplink: true,
        stdio: true,
        streamableHttp: true,
        headers: true,
        environmentVariables: true,
        remoteVariables: true,
      },
    });
    expect(getSupportedClientById("vscode")).toMatchObject({
      name: "VS Code",
      capabilities: {
        deeplink: false,
        stdio: true,
        streamableHttp: true,
        headers: true,
        environmentVariables: true,
        remoteVariables: true,
      },
    });
  });

  it("returns null for clients outside the supported catalogue", () => {
    expect(getSupportedClientById("unknown-client")).toBeNull();
  });
});
