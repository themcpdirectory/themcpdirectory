import type {
  AdapterRegistry,
  ClientDetection,
  DiagnosticResult,
  InstalledMcpServer,
  McpClientAdapter,
} from "@themcpdirectory/client-adapters";
import type { ClientId } from "@themcpdirectory/install-engine";
import { describe, expect, it, vi } from "vitest";
import type { InstallationReceipt } from "../config/receipt-store.js";
import type { CliDependencies } from "../dependencies.js";
import { runDoctorCommand } from "../commands/doctor.js";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";

function receipt(slug: string, client: ClientId): InstallationReceipt {
  return {
    schemaVersion: 1,
    slug,
    client,
    scope: "user",
    serverVersion: "1.0.0-beta.1+old",
    variantId: VARIANT_ID,
    manifestHash: "a".repeat(64),
    installedAt: "2026-09-01T12:00:00.000Z",
    adapterFingerprint: `${client}@1.0.0`,
  };
}

function forbidden(): never {
  throw new Error("doctor attempted a mutating or executable adapter operation");
}

function adapter(options: {
  id: ClientId;
  installed: boolean;
  inspectionSafety?: McpClientAdapter["inspectionSafety"];
  entries?: readonly InstalledMcpServer[];
  diagnostic?: DiagnosticResult;
  inspectError?: Error;
}): McpClientAdapter {
  const detection: ClientDetection = {
    id: options.id,
    installed: options.installed,
    capabilities: [],
  };
  return {
    id: options.id,
    inspectionSafety: options.inspectionSafety ?? "configuration-only",
    async detect() {
      return detection;
    },
    async inspect() {
      if (options.inspectionSafety === "may-connect") forbidden();
      if (options.inspectError) throw options.inspectError;
      return options.entries ?? [];
    },
    async diagnose() {
      if (!options.installed) forbidden();
      return (
        options.diagnostic ?? {
          client: options.id,
          ok: true,
          issues: [],
        }
      );
    },
    planInstall: forbidden,
    executePlan: forbidden,
    verifyInstall: forbidden,
    planRemove: forbidden,
    executeRemove: forbidden,
    verifyRemove: forbidden,
    getSafetyDescriptor: forbidden,
  };
}

function registry(adapters: readonly McpClientAdapter[]): AdapterRegistry {
  return {
    list() {
      return adapters;
    },
    get(id) {
      const match = adapters.find((candidate) => candidate.id === id);
      if (!match) throw new Error(`Missing adapter ${id}`);
      return match;
    },
    async detectAll() {
      return Promise.all(adapters.map(async (candidate) => candidate.detect()));
    },
  };
}

describe("runDoctorCommand", () => {
  it("reports read-only API, client, config, receipt, package, drift, deletion, env, and Directory checks", async () => {
    const executePackage = vi.fn(forbidden);
    const adapters = [
      adapter({
        id: "codex",
        installed: true,
        inspectError: new Error("invalid config"),
      }),
      adapter({
        id: "cursor",
        installed: true,
        entries: [
          {
            name: "github",
            slug: "github",
            client: "cursor",
            scope: "user",
            transport: "stdio",
            managedBy: "external",
            environmentReferences: ["CI_GITHUB_TOKEN"],
            adapterMetadata: {},
          },
        ],
      }),
      adapter({ id: "claude-code", installed: true, inspectionSafety: "may-connect" }),
      adapter({ id: "vscode", installed: false }),
    ];
    const receipts = [receipt("github", "cursor"), receipt("deleted", "codex")];
    const deps = {
      adapterRegistry: registry(adapters),
      receiptStore: {
        async list() {
          return receipts;
        },
        async write() {
          forbidden();
        },
        async remove() {
          forbidden();
        },
        async find() {
          return null;
        },
      },
      directoryClient: {
        async listClients() {
          return { data: [], meta: { requestId: "req_clients" } };
        },
        async getServer(slug: string) {
          return {
            data: {
              slug,
              listingStatus: slug === "deleted" ? "deleted_upstream" : "deprecated",
              trustProfile: {
                signals:
                  slug === "github"
                    ? [
                        {
                          key: "package-maintenance",
                          status: "warning",
                          summary: "Package maintenance is uncertain.",
                          checkedAt: null,
                        },
                      ]
                    : [],
              },
            },
            meta: { requestId: `req_${slug}` },
          };
        },
        async resolveInstall(slug: string) {
          if (slug === "deleted") {
            const error = new Error("HTTP 410");
            Object.assign(error, { code: "DIRECTORY_INSTALL_UNAVAILABLE" });
            throw error;
          }
          return {
            data: {
              schemaVersion: 1,
              server: { slug, title: "GitHub", version: "1.1.0-rc.1+build.7" },
              provenance: {
                registry: "registry.modelcontextprotocol.io",
                registryName: "MCP Registry",
                observedAt: "2026-09-03T00:00:00Z",
              },
              variants: [
                {
                  id: VARIANT_ID,
                  kind: "package",
                  registryType: "npm",
                  identifier: "@example/github",
                  version: "1.1.0-rc.1+build.7",
                  runtimeHint: "npx",
                  transport: "stdio",
                  runtimeArguments: [],
                  packageArguments: [],
                  environmentVariables: [
                    {
                      name: "GITHUB_TOKEN",
                      description: "GitHub token",
                      required: true,
                      defaultValue: null,
                      valueSource: "environment",
                    },
                  ],
                  integrity: null,
                },
              ],
              compatibility: { cursor: "supported" },
            },
            meta: { requestId: "req_install" },
          };
        },
        executePackage,
      },
      environment: {},
    } as unknown as CliDependencies;

    const result = await runDoctorCommand([], deps);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatchObject({
      command: "doctor",
      ok: false,
      data: { exitCode: 1 },
    });
    expect(result.stdout?.data?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Directory API", status: "ok" }),
        expect.objectContaining({ name: "Client: cursor", status: "ok" }),
        expect.objectContaining({ name: "Config: claude-code", status: "warning" }),
        expect.objectContaining({ name: "Client: vscode", status: "warning" }),
        expect.objectContaining({
          name: "Config: codex",
          status: "error",
          recoveryHint: "Repair the codex configuration and run doctor again.",
        }),
        expect.objectContaining({ name: "Entry: github (cursor, user)", status: "ok" }),
        expect.objectContaining({ name: "Entry: deleted (codex, user)", status: "error" }),
        expect.objectContaining({
          name: "Environment: github/CI_GITHUB_TOKEN",
          status: "warning",
        }),
        expect.objectContaining({ name: "Package: github", status: "ok" }),
        expect.objectContaining({ name: "Package: deleted", status: "error" }),
        expect.objectContaining({
          name: "Version: github",
          status: "warning",
          message: expect.stringContaining("1.0.0-beta.1+old -> 1.1.0-rc.1+build.7"),
        }),
        expect.objectContaining({ name: "Upstream: deleted", status: "error" }),
        expect.objectContaining({
          name: "Directory warning: github/package-maintenance",
          status: "warning",
        }),
      ]),
    );
    expect(executePackage).not.toHaveBeenCalled();
    expect(
      result.stdout?.data?.checks.every((check) => !check.message.includes("secret-value")),
    ).toBe(true);
  });
});
