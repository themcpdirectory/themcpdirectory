import { describe, expect, it } from "vitest";
import { PUBLIC_API_DOC_OPERATIONS } from "./docs-api";

describe("public API documentation operations", () => {
  it("documents accepted responses without requiring a JSON body", () => {
    const telemetry = PUBLIC_API_DOC_OPERATIONS.find(
      (operation) => operation.method === "POST" && operation.path === "/api/v1/telemetry/events",
    );

    expect(telemetry).toMatchObject({
      responseStatuses: ["202", "400", "429", "500"],
      successSchema: "No response body",
    });
  });
});
