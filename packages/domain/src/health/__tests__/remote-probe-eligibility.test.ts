import { describe, expect, it, vi } from "vitest";
import { decideRemoteProbeEligibility } from "../remote-probe-eligibility.js";

describe("remote probe eligibility", () => {
  it("derives authentication requirements from stored headers before DNS", async () => {
    const resolve = vi.fn(async () => ["93.184.216.34"]);

    await expect(
      decideRemoteProbeEligibility(
        {
          listingStatus: "active",
          transportType: "streamable-http",
          urlTemplate: "https://mcp.example.com/http/{tenant}",
          headers: [{ name: "Authorization", value: "Bearer ${TOKEN}" }],
          variables: { tenant: { description: "Tenant id", isRequired: true } },
        },
        { resolve },
      ),
    ).resolves.toMatchObject({
      eligible: false,
      outcome: "unsupported",
      reason: "remote requires authentication",
      derivedAuthRequired: true,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects unresolved required URL template variables before DNS", async () => {
    const resolve = vi.fn(async () => ["93.184.216.34"]);

    await expect(
      decideRemoteProbeEligibility(
        {
          listingStatus: "active",
          transportType: "sse",
          urlTemplate: "https://mcp.example.com/sse/{tenant}",
          headers: [],
          variables: { tenant: { isRequired: true } },
        },
        { resolve },
      ),
    ).resolves.toMatchObject({
      eligible: false,
      outcome: "unsupported",
      derivedUnresolvedVariables: ["tenant"],
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects explicitly secret headers and URL variables before DNS", async () => {
    const resolve = vi.fn(async () => ["93.184.216.34"]);
    const inputs = [
      {
        listingStatus: "active",
        transportType: "http",
        urlTemplate: "https://mcp.example.com/health",
        headers: [{ name: "X-Registry-Secret", value: "literal-secret", isSecret: true }],
        variables: {},
      },
      {
        listingStatus: "active",
        transportType: "http",
        urlTemplate: "https://mcp.example.com/{tenant}",
        headers: [],
        variables: {
          tenant: { isRequired: true, isSecret: true, default: "publisher-secret" },
        },
      },
    ];

    for (const input of inputs) {
      await expect(decideRemoteProbeEligibility(input, { resolve })).resolves.toMatchObject({
        eligible: false,
        outcome: "unsupported",
        normalizedUrl: null,
      });
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("accepts a concrete public HTTPS remote", async () => {
    await expect(
      decideRemoteProbeEligibility(
        {
          listingStatus: "active",
          transportType: "http",
          urlTemplate: "https://mcp.example.com/health",
          headers: [],
          variables: {},
        },
        { resolve: async () => ["93.184.216.34"] },
      ),
    ).resolves.toEqual({
      eligible: true,
      outcome: "unknown",
      reason: null,
      normalizedUrl: "https://mcp.example.com/health",
      derivedAuthRequired: false,
      derivedUnresolvedVariables: [],
    });
  });
});
