import { MCPDIR_MANIFEST_SCHEMA_URL } from "@themcpdirectory/registry-normalizer";
import { createInProcessCliHarness } from "@themcpdirectory/test-utils";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../cli.js";
import type { CliDependencies, RegistryPublishTransport } from "../dependencies.js";

const PACKAGE_MANIFEST = {
  schemaVersion: 1,
  server: {
    $schema: MCPDIR_MANIFEST_SCHEMA_URL,
    name: "io.github.example/test-server",
    description: "A test MCP server",
    version: "1.2.3",
    packages: [
      {
        registryType: "npm",
        identifier: "@example/test-server",
        version: "1.2.3",
        transport: { type: "stdio" },
      },
    ],
  },
} as const;

describe("maintainer workflow", () => {
  it("initializes a deterministic package manifest without overwriting", async () => {
    const fileSystem = createMemoryFileSystem();
    const harness = createHarness({ fileSystem });

    const created = await runCaptured(
      [
        "init",
        "--package",
        "@example/test-server",
        "--name",
        "io.github.example/test-server",
        "--description",
        "A test MCP server",
        "--version",
        "1.2.3",
        "--json",
      ],
      harness,
    );
    const firstContents = fileSystem.files.get("/workspace/mcpdir.json");
    const refused = await runCaptured(
      [
        "init",
        "--package",
        "@other/server",
        "--name",
        "io.github.example/other-server",
        "--description",
        "Another MCP server",
        "--version",
        "1.0.0",
      ],
      harness,
    );

    expect(created).toMatchObject({ exitCode: 0, stderr: "" });
    expect(JSON.parse(created.stdout)).toMatchObject({
      command: "init",
      ok: true,
      data: { path: "/workspace/mcpdir.json", kind: "package", overwritten: false },
    });
    expect(JSON.parse(firstContents ?? "null")).toEqual(PACKAGE_MANIFEST);
    expect(refused).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("already exists"),
    });
    expect(fileSystem.files.get("/workspace/mcpdir.json")).toBe(firstContents);
  });

  it("overwrites only with --force and can initialize a remote manifest", async () => {
    const fileSystem = createMemoryFileSystem({
      "/workspace/mcpdir.json": "existing\n",
    });
    const harness = createHarness({ fileSystem });

    const result = await runCaptured(
      [
        "init",
        "--remote",
        "https://mcp.example.com/v1",
        "--remote-type",
        "streamable-http",
        "--name",
        "io.github.example/remote-server",
        "--description",
        "A remote MCP server",
        "--version",
        "2.0.0",
        "--force",
        "--json",
      ],
      harness,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data).toMatchObject({ kind: "remote", overwritten: true });
    expect(JSON.parse(fileSystem.files.get("/workspace/mcpdir.json") ?? "null")).toEqual({
      schemaVersion: 1,
      server: {
        $schema: MCPDIR_MANIFEST_SCHEMA_URL,
        name: "io.github.example/remote-server",
        description: "A remote MCP server",
        version: "2.0.0",
        remotes: [{ type: "streamable-http", url: "https://mcp.example.com/v1" }],
      },
    });
  });

  it("fails noninteractive init with REQUIRED_INPUT and writes no placeholders", async () => {
    const fileSystem = createMemoryFileSystem();
    const harness = createHarness({ fileSystem });

    const result = await runCaptured(
      ["init", "--package", "@example/test-server", "--json"],
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "init",
      ok: false,
      error: {
        code: "REQUIRED_INPUT",
        message: expect.stringContaining("--name"),
      },
    });
    expect(fileSystem.files.size).toBe(0);
  });

  it("prompts interactively for required package manifest fields", async () => {
    const fileSystem = createMemoryFileSystem();
    const promptIO = createPromptDouble({
      selectResponses: ["package"],
      inputResponses: [
        "io.github.example/prompted-package",
        "Prompted package server",
        "3.2.1",
        "@example/prompted-package",
      ],
    });
    const harness = createHarness({ fileSystem, promptIO });

    const result = await runCaptured(["init", "--json"], harness);

    expect(result.exitCode).toBe(0);
    expect(promptIO.select).toHaveBeenCalledWith("How is the server distributed?", [
      "package",
      "remote",
    ]);
    expect(JSON.parse(fileSystem.files.get("/workspace/mcpdir.json") ?? "null")).toMatchObject({
      server: {
        name: "io.github.example/prompted-package",
        description: "Prompted package server",
        version: "3.2.1",
        packages: [{ identifier: "@example/prompted-package", version: "3.2.1" }],
      },
    });
  });

  it("prompts interactively for a remote URL and transport type", async () => {
    const fileSystem = createMemoryFileSystem();
    const promptIO = createPromptDouble({
      selectResponses: ["remote", "sse"],
      inputResponses: [
        "io.github.example/prompted-remote",
        "Prompted remote server",
        "4.0.0",
        "https://mcp.example.com/sse",
      ],
    });
    const harness = createHarness({ fileSystem, promptIO });

    const result = await runCaptured(["init", "--json"], harness);

    expect(result.exitCode).toBe(0);
    expect(promptIO.select).toHaveBeenNthCalledWith(2, "Which remote transport type?", [
      "streamable-http",
      "sse",
    ]);
    expect(JSON.parse(fileSystem.files.get("/workspace/mcpdir.json") ?? "null")).toMatchObject({
      server: {
        name: "io.github.example/prompted-remote",
        description: "Prompted remote server",
        version: "4.0.0",
        remotes: [{ type: "sse", url: "https://mcp.example.com/sse" }],
      },
    });
  });

  it("validates the default file and returns stable JSON for CI", async () => {
    const fileSystem = createMemoryFileSystem({
      "/workspace/mcpdir.json": `${JSON.stringify(PACKAGE_MANIFEST)}\n`,
    });
    const harness = createHarness({ fileSystem });

    const result = await runCaptured(["validate", "--json"], harness);

    expect(result).toEqual({
      exitCode: 0,
      stdout: `${JSON.stringify({
        schemaVersion: 1,
        command: "validate",
        ok: true,
        data: {
          path: "/workspace/mcpdir.json",
          valid: true,
          artifact: PACKAGE_MANIFEST.server,
        },
        warnings: [],
      })}\n`,
      stderr: "",
    });
  });

  it.each([
    ["missing file", undefined, "MANIFEST_NOT_FOUND", "mcpdir.json was not found"],
    ["malformed JSON", "{", "MANIFEST_JSON_INVALID", "valid JSON"],
    [
      "invalid field",
      JSON.stringify({
        ...PACKAGE_MANIFEST,
        server: {
          ...PACKAGE_MANIFEST.server,
          packages: [{ ...PACKAGE_MANIFEST.server.packages[0], version: "latest" }],
        },
      }),
      "MANIFEST_INVALID",
      "server.packages.0.version",
    ],
  ])("reports actionable validation errors for %s", async (_name, contents, code, message) => {
    const fileSystem = createMemoryFileSystem(
      contents === undefined ? {} : { "/workspace/custom.json": contents },
    );
    const harness = createHarness({ fileSystem });

    const result = await runCaptured(
      ["validate", ...(contents === undefined ? [] : ["custom.json"]), "--json"],
      harness,
    );
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(output).toMatchObject({ command: "validate", ok: false, error: { code } });
    expect(output.error.message).toContain(message);
  });

  it("validates before network access and submits the exact Registry artifact with bearer auth", async () => {
    const fileSystem = createMemoryFileSystem({
      "/workspace/mcpdir.json": `${JSON.stringify(PACKAGE_MANIFEST)}\n`,
    });
    const fetchImpl = vi.fn<typeof fetch>(() => {
      throw new Error("publish must not use fetch");
    });
    const registryPublishTransport = createRegistryPublishTransport({
      status: 200,
      body: JSON.stringify({ server: PACKAGE_MANIFEST.server }),
    });
    const harness = createHarness({
      fileSystem,
      fetchImpl,
      registryPublishTransport,
      dnsLookup: async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
      environment: { MCP_REGISTRY_TOKEN: "registry-secret" },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(result.exitCode).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(registryPublishTransport).toHaveBeenCalledExactlyOnceWith({
      endpoint: new URL("https://registry.modelcontextprotocol.io/v0/publish"),
      hostname: "registry.modelcontextprotocol.io",
      resolvedAddresses: ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
      pinnedAddress: "93.184.216.34",
      pinnedAddressFamily: 4,
      method: "POST",
      headers: {
        authorization: "Bearer registry-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify(PACKAGE_MANIFEST.server),
      timeoutMs: 100,
    });
    expect(result.stdout).not.toContain("registry-secret");
    expect(result.stderr).not.toContain("registry-secret");
  });

  it("does not access the network when local validation fails", async () => {
    const registryPublishTransport = createRegistryPublishTransport();
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({ "/workspace/mcpdir.json": "{}" }),
      registryPublishTransport,
      environment: { MCP_REGISTRY_TOKEN: "registry-secret" },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(result.exitCode).toBe(1);
    expect(registryPublishTransport).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "publish",
      ok: false,
      error: { code: "MANIFEST_INVALID" },
    });
  });

  it.each([
    "http://registry.example.test",
    "https://[fd00::1]",
    "https://user:password@registry.example.test",
  ])("rejects unsafe Registry endpoint %s before network access", async (registryBaseUrl) => {
    const registryPublishTransport = createRegistryPublishTransport();
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({
        "/workspace/mcpdir.json": JSON.stringify(PACKAGE_MANIFEST),
      }),
      registryPublishTransport,
      environment: {
        MCP_REGISTRY_TOKEN: "registry-secret",
        MCP_REGISTRY_BASE_URL: registryBaseUrl,
      },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(result.exitCode).toBe(1);
    expect(registryPublishTransport).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "UNSAFE_REGISTRY_ENDPOINT" },
    });
  });

  it("rejects private or rebinding DNS answers before transport access", async () => {
    const registryPublishTransport = createRegistryPublishTransport();
    const dnsLookup = vi.fn(async () => ["93.184.216.34", "127.0.0.1"]);
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({
        "/workspace/mcpdir.json": JSON.stringify(PACKAGE_MANIFEST),
      }),
      registryPublishTransport,
      dnsLookup,
      environment: {
        MCP_REGISTRY_TOKEN: "registry-secret",
        MCP_REGISTRY_BASE_URL: "https://registry.example.test",
      },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(result.exitCode).toBe(1);
    expect(dnsLookup).toHaveBeenCalledWith("registry.example.test");
    expect(registryPublishTransport).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "UNSAFE_REGISTRY_ENDPOINT" },
    });
  });

  it("does not follow Registry redirects with the bearer token", async () => {
    const registryPublishTransport = createRegistryPublishTransport({ status: 302, body: "" });
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({
        "/workspace/mcpdir.json": JSON.stringify(PACKAGE_MANIFEST),
      }),
      registryPublishTransport,
      environment: { MCP_REGISTRY_TOKEN: "registry-secret" },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(registryPublishTransport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "REGISTRY_REDIRECT_REJECTED" },
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain("redirect.example.test");
    expect(`${result.stdout}${result.stderr}`).not.toContain("registry-secret");
  });

  it("accepts additive fields in the Official Registry ServerResponse", async () => {
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({
        "/workspace/mcpdir.json": JSON.stringify(PACKAGE_MANIFEST),
      }),
      registryPublishTransport: createRegistryPublishTransport({
        status: 200,
        body: JSON.stringify({
          server: {
            name: PACKAGE_MANIFEST.server.name,
            version: PACKAGE_MANIFEST.server.version,
            registryMetadata: { status: "active" },
          },
          meta: { requestId: "registry-request" },
        }),
      }),
      environment: { MCP_REGISTRY_TOKEN: "registry-secret" },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "publish",
      ok: true,
      data: {
        name: PACKAGE_MANIFEST.server.name,
        version: PACKAGE_MANIFEST.server.version,
      },
    });
  });

  it.each([
    ["name", { server: { version: PACKAGE_MANIFEST.server.version } }],
    ["version", { server: { name: PACKAGE_MANIFEST.server.name } }],
  ])("rejects a ServerResponse missing required server.%s", async (_field, body) => {
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({
        "/workspace/mcpdir.json": JSON.stringify(PACKAGE_MANIFEST),
      }),
      registryPublishTransport: createRegistryPublishTransport({
        status: 200,
        body: JSON.stringify(body),
      }),
      environment: { MCP_REGISTRY_TOKEN: "registry-secret" },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "REGISTRY_RESPONSE_INVALID" },
    });
  });

  it.each([
    [
      "network failure",
      async () => {
        throw new Error("request failed with registry-secret");
      },
      "REGISTRY_NETWORK_ERROR",
    ],
    [
      "status failure",
      async () => ({ status: 401, body: "registry-secret upstream detail" }),
      "REGISTRY_HTTP_ERROR",
    ],
    [
      "response schema failure",
      async () => ({ status: 200, body: JSON.stringify({ token: "registry-secret" }) }),
      "REGISTRY_RESPONSE_INVALID",
    ],
  ])("sanitizes %s output", async (_name, implementation, expectedCode) => {
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({
        "/workspace/mcpdir.json": JSON.stringify(PACKAGE_MANIFEST),
      }),
      registryPublishTransport: vi.fn(implementation) as RegistryPublishTransport,
      environment: { MCP_REGISTRY_TOKEN: "registry-secret" },
    });

    const result = await runCaptured(["publish", "--json"], harness);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: expectedCode } });
    expect(`${result.stdout}${result.stderr}`).not.toContain("registry-secret");
  });

  it("does not emit behavioral telemetry for maintainer commands", async () => {
    const telemetryReporter = { report: vi.fn(async () => undefined) };
    const harness = createHarness({
      fileSystem: createMemoryFileSystem({
        "/workspace/mcpdir.json": JSON.stringify(PACKAGE_MANIFEST),
      }),
      telemetryReporter,
    });

    await runCli(["validate"], harness.deps);

    expect(telemetryReporter.report).not.toHaveBeenCalled();
  });

  it("keeps unknown-command behavior stable", async () => {
    const harness = createHarness({ fileSystem: createMemoryFileSystem() });

    const exitCode = await runCli(["not-a-command"], harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join("")).toBe(
      "Unknown command: not-a-command\nRun mcpdir --help for available commands.\n",
    );
  });
});

interface MemoryFileSystem {
  readonly files: Map<string, string>;
  readFile(path: string): Promise<string>;
  writeFile(
    path: string,
    contents: string,
    options?: { readonly flag?: "w" | "wx" },
  ): Promise<void>;
}

function createMemoryFileSystem(initial: Readonly<Record<string, string>> = {}): MemoryFileSystem {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async readFile(path) {
      const value = files.get(path);
      if (value === undefined) throw fileError("ENOENT");
      return value;
    },
    async writeFile(path, contents, options) {
      if (options?.flag === "wx" && files.has(path)) throw fileError("EEXIST");
      files.set(path, contents);
    },
  };
}

function fileError(code: "ENOENT" | "EEXIST"): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function createHarness(options: {
  readonly fileSystem: MemoryFileSystem;
  readonly fetchImpl?: typeof fetch;
  readonly dnsLookup?: (hostname: string) => Promise<readonly string[]>;
  readonly registryPublishTransport?: RegistryPublishTransport;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
  readonly telemetryReporter?: CliDependencies["telemetryReporter"];
  readonly promptIO?: CliDependencies["promptIO"];
}) {
  return createInProcessCliHarness<CliDependencies>({
    environment: options.environment ?? {},
    runtime: {
      apiBaseUrl: "https://directory.example/api/v1",
      requestTimeoutMs: 100,
      workingDirectory: "/workspace",
    },
    maintainerFileSystem: options.fileSystem,
    fetchImpl: options.fetchImpl ?? (vi.fn<typeof fetch>() as typeof fetch),
    dnsLookup: options.dnsLookup ?? (async () => ["93.184.216.34"]),
    registryPublishTransport: options.registryPublishTransport ?? createRegistryPublishTransport(),
    telemetryReporter: options.telemetryReporter,
    ...(options.promptIO ? { promptIO: options.promptIO } : {}),
  } as unknown as Partial<CliDependencies>);
}

function createRegistryPublishTransport(
  response: { readonly status: number; readonly body: string } = {
    status: 200,
    body: JSON.stringify({ server: PACKAGE_MANIFEST.server }),
  },
): RegistryPublishTransport {
  return vi.fn(async () => response);
}

function createPromptDouble(options: {
  readonly selectResponses: readonly string[];
  readonly inputResponses: readonly string[];
}): CliDependencies["promptIO"] {
  const selectResponses = [...options.selectResponses];
  const inputResponses = [...options.inputResponses];
  return {
    isInteractive: true,
    select: vi.fn(
      async () => selectResponses.shift() ?? "",
    ) as unknown as CliDependencies["promptIO"]["select"],
    input: vi.fn(async () => inputResponses.shift() ?? ""),
    secretInput: vi.fn(async () => ""),
    confirm: vi.fn(async () => false),
  };
}

async function runCaptured(
  argv: readonly string[],
  harness: ReturnType<typeof createHarness>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdoutStart = harness.stdout.length;
  const stderrStart = harness.stderr.length;
  const exitCode = await runCli(argv, harness.deps);
  return {
    exitCode,
    stdout: harness.stdout.slice(stdoutStart).join(""),
    stderr: harness.stderr.slice(stderrStart).join(""),
  };
}
