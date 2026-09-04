import { createAdapterRegistry } from "@themcpdirectory/client-adapters";
import type { ServerCollectionResponse, ServerDetailResponse } from "@themcpdirectory/api-contract";
import type { DirectoryClient } from "@themcpdirectory/directory-client";
import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import { runInfoCommand } from "../commands/info.js";
import { type CommandResult } from "../commands/result.js";
import { runSearchCommand } from "../commands/search.js";
import type { CliDependencies, OutputWriter, PromptIO } from "../dependencies.js";

const SEARCH_RESPONSE = {
  data: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "github-mcp",
      title: "GitHub MCP",
      description: "Sync GitHub issues and pull requests.",
      publisher: {
        slug: "github",
        name: "GitHub",
        verified: true,
      },
      version: "1.2.3",
      repository: {
        url: "https://github.com/github/github-mcp",
      },
      listingStatus: "active",
      signals: {
        officialRegistry: true,
        publisherVerified: true,
        sourceAvailable: true,
        openSource: true,
      },
    },
  ],
  meta: {
    requestId: "req_search_123",
    nextCursor: "cursor:next:github-mcp",
  },
} satisfies ServerCollectionResponse;

const INFO_RESPONSE = {
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "github-mcp",
    title: "GitHub MCP",
    shortDescription: "Sync GitHub issues and pull requests.",
    longDescription: "A maintained bridge for GitHub issues, pull requests, and automation.",
    listingStatus: "active",
    aliases: ["github"],
    publisher: {
      slug: "github",
      name: "GitHub",
      verified: true,
    },
    repository: {
      url: "https://github.com/github/github-mcp",
    },
    version: "1.2.3",
    categories: [
      {
        slug: "developer-tools",
        name: "Developer Tools",
      },
    ],
    packages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        registryType: "npm",
        identifier: "@github/mcp-server",
        version: "1.2.3",
        runtimeHint: "node",
        transport: "stdio",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
      },
    ],
    remotes: [],
    compatibility: {
      "claude-code": "supported",
      codex: "supported",
      cursor: "supported_with_configuration",
      vscode: "supported",
    },
    trustProfile: {
      officialRegistry: true,
      publisherVerified: true,
      sourceAvailable: true,
      openSource: true,
      signals: [
        {
          key: "official_registry",
          status: "positive",
          summary: "Listed in the official MCP registry.",
          checkedAt: "2026-09-03T12:00:00.000Z",
        },
      ],
    },
    latestHealth: {
      schemaVersion: 1,
      outcome: "degraded",
      checkedAt: "2026-09-03T11:55:00.000Z",
      durationMs: 840,
      httpStatus: 503,
      finalOrigin: "https://api.github.example",
      redirectCount: 1,
    },
    installAvailability: "available",
    timestamps: {
      firstSeenAt: "2026-08-01T00:00:00.000Z",
      lastSeenAt: "2026-09-03T10:00:00.000Z",
      publishedAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-09-02T18:00:00.000Z",
    },
  },
  meta: {
    requestId: "req_info_456",
  },
} satisfies ServerDetailResponse;

const _searchSignature: (argv: readonly string[], deps: CliDependencies) => Promise<CommandResult> =
  runSearchCommand;
const _infoSignature: (argv: readonly string[], deps: CliDependencies) => Promise<CommandResult> =
  runInfoCommand;
void _searchSignature;
void _infoSignature;

interface TestContext {
  readonly deps: CliDependencies;
  readonly stdout: string[];
  readonly stderr: string[];
  readonly calls: {
    readonly search: SearchCall[];
    readonly info: string[];
  };
}

interface SearchCall {
  readonly q?: string;
  readonly client?: "claude-code" | "codex" | "cursor" | "vscode";
  readonly category?: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: "recent" | "name" | "relevance";
}

function createPromptStub(): PromptIO {
  return {
    isInteractive: false,
    async select<T extends string>(): Promise<T> {
      throw new Error("Prompt should not be used in search/info tests");
    },
    async input(): Promise<string> {
      throw new Error("Prompt should not be used in search/info tests");
    },
    async secretInput(): Promise<string> {
      throw new Error("Prompt should not be used in search/info tests");
    },
    async confirm(): Promise<boolean> {
      throw new Error("Prompt should not be used in search/info tests");
    },
  };
}

function createOutputCapture(stdout: string[], stderr: string[]): OutputWriter {
  return {
    writeStdout(line: string): void {
      stdout.push(line);
    },
    writeStderr(line: string): void {
      stderr.push(line);
    },
  };
}

function createReceiptStoreStub() {
  return {
    async list() {
      return [];
    },
    async write() {
      throw new Error("Receipt store should not be used in search/info tests");
    },
    async remove() {
      throw new Error("Receipt store should not be used in search/info tests");
    },
    async find() {
      return null;
    },
  };
}

function createDependencies(options?: {
  readonly searchResponse?: ServerCollectionResponse;
  readonly infoResponse?: ServerDetailResponse;
  readonly searchError?: Error;
  readonly infoError?: Error;
}): TestContext {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const searchCalls: SearchCall[] = [];
  const infoCalls: string[] = [];

  const directoryClient = {
    async searchServers(params: SearchCall): Promise<ServerCollectionResponse> {
      searchCalls.push(params);

      if (options?.searchError) {
        throw options.searchError;
      }

      return options?.searchResponse ?? SEARCH_RESPONSE;
    },
    async getServer(identifier: string): Promise<ServerDetailResponse> {
      infoCalls.push(identifier);

      if (options?.infoError) {
        throw options.infoError;
      }

      return options?.infoResponse ?? INFO_RESPONSE;
    },
  } as unknown as DirectoryClient;

  return {
    deps: {
      directoryClient,
      adapterRegistry: createAdapterRegistry([]),
      receiptStore: createReceiptStoreStub(),
      promptIO: createPromptStub(),
      output: createOutputCapture(stdout, stderr),
      runtime: {
        apiBaseUrl: "https://directory.example/api/v1",
        requestTimeoutMs: 15_000,
      },
      environment: {},
      clock: () => new Date("2026-09-03T12:00:00.000Z"),
    },
    stdout,
    stderr,
    calls: {
      search: searchCalls,
      info: infoCalls,
    },
  };
}

describe("Task 10 search and info command runner", () => {
  it("returns a CommandResult for search with the exact Phase D envelope and no direct writes", async () => {
    const context = createDependencies();

    const result = await runSearchCommand(
      [
        "github",
        "--client",
        "codex",
        "--category",
        "developer-tools",
        "--limit",
        "5",
        "--sort",
        "name",
      ],
      context.deps,
    );

    expect(context.calls.search).toEqual([
      {
        q: "github",
        client: "codex",
        category: "developer-tools",
        limit: 5,
        sort: "name",
      },
    ]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: {
        schemaVersion: 1,
        command: "search",
        ok: true,
        data: SEARCH_RESPONSE,
        warnings: [],
      },
      stderrLines: [],
      warnings: [],
    });
    expect(context.stdout).toEqual([]);
    expect(context.stderr).toEqual([]);
  });

  it("returns a CommandResult for info with the exact Phase D envelope and no direct writes", async () => {
    const context = createDependencies();

    const result = await runInfoCommand(["github-mcp"], context.deps);

    expect(context.calls.info).toEqual(["github-mcp"]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: {
        schemaVersion: 1,
        command: "info",
        ok: true,
        data: INFO_RESPONSE,
        warnings: [],
      },
      stderrLines: [],
      warnings: [],
    });
    expect(context.stdout).toEqual([]);
    expect(context.stderr).toEqual([]);
  });

  it("serializes schema-versioned search JSON through runCli as the sole stdout writer", async () => {
    const context = createDependencies();

    const exitCode = await runCli(["search", "github", "--json"], context.deps);

    expect(exitCode).toBe(0);
    expect(context.stderr).toEqual([]);
    expect(context.stdout).toEqual([
      `${JSON.stringify({
        schemaVersion: 1,
        command: "search",
        ok: true,
        data: SEARCH_RESPONSE,
        warnings: [],
      })}\n`,
    ]);
  });

  it("renders concise human-readable search output through runCli", async () => {
    const context = createDependencies();

    const exitCode = await runCli(["search", "github"], context.deps);

    expect(exitCode).toBe(0);
    expect(context.stderr).toEqual([]);
    expect(context.stdout.join("")).toBe(
      [
        "GitHub MCP (github-mcp)\n",
        "  Sync GitHub issues and pull requests.\n",
        "  Publisher: GitHub (verified)\n",
        "  Version: 1.2.3\n",
        "Request ID: req_search_123\n",
        "Next cursor: cursor:next:github-mcp\n",
      ].join(""),
    );

    context.stdout.length = 0;
    expect(await runCli(["info", "github-mcp"], context.deps)).toBe(0);
    const infoOutput = context.stdout.join("");
    expect(infoOutput).toContain("Listing status: active");
    expect(infoOutput).toContain("Install availability: available");
    expect(infoOutput).toContain(
      "Trust signal: official_registry=positive - Listed in the official MCP registry.",
    );
    expect(infoOutput).toContain("Latest remote health: degraded");
    expect(infoOutput).toContain("HTTP 503");
    expect(infoOutput).not.toMatch(/\b(score|stars|grade|confidence)\b/i);
  });

  it("reports usage failures through runCli with machine-safe stderr and schema-versioned JSON", async () => {
    const context = createDependencies();

    const exitCode = await runCli(["info", "--json"], context.deps);

    expect(exitCode).toBe(2);
    expect(context.stderr).toEqual(["Usage: mcpdir info <slug>\n"]);
    expect(context.stdout).toEqual([
      `${JSON.stringify({
        schemaVersion: 1,
        command: "info",
        ok: false,
        error: {
          code: "USAGE_ERROR",
          message: "info requires exactly one server slug",
        },
        warnings: [],
      })}\n`,
    ]);
  });
});
