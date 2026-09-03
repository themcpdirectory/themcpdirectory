import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeProcessRuntime } from "@themcpdirectory/test-utils";
import type {
  AdapterCapability,
  AdapterSafetyDescriptor,
  ClientId,
  ClientScope,
  InstallPlan,
  RemovalPlan,
} from "@themcpdirectory/install-engine";
import { describe, expect, it } from "vitest";
import {
  AdapterRegistryError,
  type AdapterRuntime,
  AdapterRuntimeError,
  createAdapterRegistry,
  createCursorAdapter,
  createNodeAdapterRuntime,
  createVsCodeAdapter,
  type ClientDetection,
  type DiagnosticResult,
  type ExecFileOptions,
  type InstallVerificationResult,
  type InstalledMcpServer,
  type McpClientAdapter,
  type RemoveVerificationResult,
} from "../index.js";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const MANIFEST_HASH = "a".repeat(64);
const INTENT_HASH = "b".repeat(64);

function createInstallPlan(client: ClientId, scope: ClientScope = "user"): InstallPlan {
  return {
    schemaVersion: 1,
    serverSlug: "github",
    client,
    scope,
    variantId: VARIANT_ID,
    manifestHash: MANIFEST_HASH,
    intentHash: INTENT_HASH,
    operations: [],
    previewLines: ["Install GitHub into the selected client."],
  };
}

function createRemovalPlan(client: ClientId, scope: ClientScope = "user"): RemovalPlan {
  return {
    schemaVersion: 1,
    serverSlug: "github",
    client,
    scope,
    operations: [],
    previewLines: ["Remove GitHub from the selected client."],
  };
}

function createInstalledServer(client: ClientId, scope: ClientScope = "user"): InstalledMcpServer {
  return {
    name: "GitHub",
    slug: "github",
    client,
    scope,
    transport: "stdio",
    managedBy: "external",
    adapterMetadata: {
      observed: true,
    },
  };
}

function createSafetyDescriptor(
  client: ClientId,
  capabilities: readonly AdapterCapability[] = ["native-list"],
): AdapterSafetyDescriptor {
  return {
    client,
    executableAllowList: ["/usr/bin/probe"],
    configRoots: ["/tmp"],
    supportedCapabilities: capabilities,
  };
}

function createStaticAdapter(
  id: ClientId,
  detectionOverrides: Partial<ClientDetection> = {},
): McpClientAdapter {
  const detection: ClientDetection = {
    id,
    installed: true,
    executable: `${id}-bin`,
    version: "1.0.0",
    capabilities: ["native-list"],
    ...detectionOverrides,
  };

  const inspectedEntry = createInstalledServer(id);
  const diagnostic: DiagnosticResult = {
    client: id,
    ok: true,
    issues: [],
  };

  return {
    id,
    detect: async () => detection,
    inspect: async () => [inspectedEntry],
    planInstall: async () => createInstallPlan(id),
    executePlan: async () => {},
    verifyInstall: async (plan: InstallPlan): Promise<InstallVerificationResult> => ({
      ok: true,
      installedEntry: {
        ...inspectedEntry,
        variantId: plan.variantId,
        manifestHash: plan.manifestHash,
      },
      message: "verified",
    }),
    planRemove: async (): Promise<RemovalPlan> => createRemovalPlan(id),
    executeRemove: async () => {},
    verifyRemove: async (): Promise<RemoveVerificationResult> => ({
      ok: true,
      message: "removed",
    }),
    diagnose: async () => diagnostic,
    getSafetyDescriptor: () => createSafetyDescriptor(id),
  };
}

function createProbeAdapter(id: ClientId, runtime: AdapterRuntime): McpClientAdapter {
  return {
    ...createStaticAdapter(id),
    detect: async () => {
      const result = await runtime.execFile("/usr/bin/probe", ["--version"], {
        timeoutMs: 2_500,
        maxStdoutBytes: 256,
        maxStderrBytes: 128,
        shell: false,
        stdin: "ignore",
      });

      return {
        id,
        installed: result.exitCode === 0,
        executable: "/usr/bin/probe",
        version: result.stdout.trim(),
        capabilities: ["native-list"],
      } satisfies ClientDetection;
    },
  };
}

describe("createAdapterRegistry", () => {
  it("detects Cursor and VS Code from runtime installation paths", async () => {
    const absent = createFakeProcessRuntime({ env: { PATH: "" } });
    await expect(createCursorAdapter(absent.runtime).detect()).resolves.toMatchObject({
      installed: false,
      capabilities: [],
    });
    await expect(createVsCodeAdapter(absent.runtime).detect()).resolves.toMatchObject({
      installed: false,
      capabilities: [],
    });

    const present = createFakeProcessRuntime({
      env: { PATH: "" },
      entries: {
        "/Applications/Cursor.app": { type: "directory", mode: 0o755 },
        "/Applications/Visual Studio Code.app": { type: "directory", mode: 0o755 },
      },
    });
    await expect(createCursorAdapter(present.runtime).detect()).resolves.toMatchObject({
      installed: true,
      executable: "/Applications/Cursor.app",
    });
    await expect(createVsCodeAdapter(present.runtime).detect()).resolves.toMatchObject({
      installed: true,
      executable: "/Applications/Visual Studio Code.app",
    });

    const windows = createFakeProcessRuntime({
      platform: "win32",
      env: { Path: "C:\\Tools", PATHEXT: ".EXE;.CMD" },
      entries: {
        "C:\\Tools\\cursor.cmd": { type: "file", content: "", mode: 0o644 },
        "C:\\Tools\\code.cmd": { type: "file", content: "", mode: 0o644 },
      },
    });
    await expect(createCursorAdapter(windows.runtime).detect()).resolves.toMatchObject({
      installed: true,
      executable: "C:\\Tools\\cursor.cmd",
    });
    await expect(createVsCodeAdapter(windows.runtime).detect()).resolves.toMatchObject({
      installed: true,
      executable: "C:\\Tools\\code.cmd",
    });
  });

  it("preserves insertion order and returns copy-safe list and detection arrays", async () => {
    const cursor = createStaticAdapter("cursor", { executable: "/Applications/Cursor.app" });
    const codex = createStaticAdapter("codex", { executable: "/usr/local/bin/codex" });
    const registry = createAdapterRegistry([cursor, codex]);

    const firstList = registry.list();
    const secondList = registry.list();

    expect(firstList.map((adapter) => adapter.id)).toEqual(["cursor", "codex"]);
    expect(secondList).toEqual(firstList);
    expect(secondList).not.toBe(firstList);
    expect(registry.get("codex")).toBe(codex);

    const firstDetections = await registry.detectAll();
    const secondDetections = await registry.detectAll();

    expect(firstDetections.map((detection) => detection.id)).toEqual(["cursor", "codex"]);
    expect(secondDetections).toEqual(firstDetections);
    expect(secondDetections).not.toBe(firstDetections);
    expect((await codex.inspect())[0]?.managedBy).toBe("external");
  });

  it("rejects duplicate ids and missing lookups with clear registry errors", () => {
    expect(() =>
      createAdapterRegistry([createStaticAdapter("codex"), createStaticAdapter("codex")]),
    ).toThrowError(AdapterRegistryError);

    try {
      createAdapterRegistry([createStaticAdapter("codex"), createStaticAdapter("codex")]);
      throw new Error("Expected duplicate adapter registration to throw");
    } catch (error) {
      expect(error).toMatchObject({
        name: "AdapterRegistryError",
        code: "ADAPTER_DUPLICATE_ID",
      });
    }

    const registry = createAdapterRegistry([createStaticAdapter("codex")]);

    expect(() => registry.get("cursor")).toThrowError(AdapterRegistryError);
    try {
      registry.get("cursor");
      throw new Error("Expected missing adapter lookup to throw");
    } catch (error) {
      expect(error).toMatchObject({
        name: "AdapterRegistryError",
        code: "ADAPTER_NOT_FOUND",
      });
      expect(String(error)).toContain("cursor");
    }
  });

  it("propagates adapter detection failures without reordering successful adapters", async () => {
    const expected = new Error("probe failed");
    const registry = createAdapterRegistry([
      createStaticAdapter("codex"),
      {
        ...createStaticAdapter("cursor"),
        id: "cursor",
        detect: async () => {
          throw expected;
        },
      },
    ]);

    await expect(registry.detectAll()).rejects.toBe(expected);
  });

  it("uses injected runtimes and captures exact exec options via the fake runtime", async () => {
    const fakeRuntime = createFakeProcessRuntime({
      execResults: [{ exitCode: 0, stdout: "1.2.3\n", stderr: "" }],
    });
    const registry = createAdapterRegistry([createProbeAdapter("codex", fakeRuntime.runtime)]);

    await expect(registry.detectAll()).resolves.toEqual([
      {
        id: "codex",
        installed: true,
        executable: "/usr/bin/probe",
        version: "1.2.3",
        capabilities: ["native-list"],
      },
    ]);

    expect(fakeRuntime.spawnCalls).toEqual([
      {
        executable: "/usr/bin/probe",
        args: ["--version"],
        options: {
          timeoutMs: 2_500,
          maxStdoutBytes: 256,
          maxStderrBytes: 128,
          shell: false,
          stdin: "ignore",
        },
      },
    ]);
  });
});

describe("createNodeAdapterRuntime", () => {
  it("captures a frozen environment snapshot instead of exposing later mutations", () => {
    const env = {
      HOME: "/Users/tester",
      SECRET_TOKEN: "before",
    };
    const runtime = createNodeAdapterRuntime({
      cwd: "/workspace/project",
      homeDirectory: "/Users/tester",
      env,
    });

    env.SECRET_TOKEN = "after";

    expect(runtime.cwd).toBe("/workspace/project");
    expect(runtime.homeDirectory).toBe("/Users/tester");
    expect(runtime.env.SECRET_TOKEN).toBe("before");
    expect(Object.isFrozen(runtime.env)).toBe(true);
  });

  it("fails with a typed timeout error without leaking secrets", async () => {
    const runtime = createNodeAdapterRuntime({
      cwd: process.cwd(),
      homeDirectory: process.env.HOME ?? process.cwd(),
      env: {
        HOME: process.env.HOME,
        SECRET_TOKEN: "super-secret-timeout-value",
      },
    });

    try {
      await runtime.execFile(process.execPath, ["-e", "setInterval(() => {}, 1_000)"], {
        timeoutMs: 100,
        maxStdoutBytes: 128,
        maxStderrBytes: 128,
        shell: false,
        stdin: "ignore",
      });
      throw new Error("Expected execFile to time out");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterRuntimeError);
      expect(error).toMatchObject({ code: "EXEC_TIMEOUT", operation: "execFile" });
      expect(String(error)).not.toContain("super-secret-timeout-value");
    }
  });

  it("fails with a typed output-limit error without echoing captured secrets", async () => {
    const runtime = createNodeAdapterRuntime({
      cwd: process.cwd(),
      homeDirectory: process.env.HOME ?? process.cwd(),
      env: {
        HOME: process.env.HOME,
        SECRET_TOKEN: "super-secret-output-value",
      },
    });

    try {
      await runtime.execFile(
        process.execPath,
        [
          "-e",
          "process.stdout.write(process.env.SECRET_TOKEN ?? ''); setInterval(() => {}, 1_000)",
        ],
        {
          timeoutMs: 1_000,
          maxStdoutBytes: 8,
          maxStderrBytes: 128,
          shell: false,
          stdin: "ignore",
        },
      );
      throw new Error("Expected execFile to exceed the stdout limit");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterRuntimeError);
      expect(error).toMatchObject({ code: "EXEC_OUTPUT_LIMIT", operation: "execFile" });
      expect(String(error)).not.toContain("super-secret-output-value");
    }
  });

  it("enforces stderr limits and preserves bounded nonzero results", async () => {
    const runtime = createNodeAdapterRuntime();

    await expect(
      runtime.execFile(process.execPath, ["-e", "process.stderr.write('too much stderr')"], {
        timeoutMs: 1_000,
        maxStdoutBytes: 128,
        maxStderrBytes: 4,
        shell: false,
        stdin: "ignore",
      }),
    ).rejects.toMatchObject({ code: "EXEC_OUTPUT_LIMIT", operation: "execFile" });

    await expect(
      runtime.execFile(
        process.execPath,
        ["-e", "process.stdout.write('ok'); process.stderr.write('bad'); process.exit(7)"],
        {
          timeoutMs: 1_000,
          maxStdoutBytes: 8,
          maxStderrBytes: 8,
          shell: false,
          stdin: "ignore",
        },
      ),
    ).resolves.toEqual({ exitCode: 7, stdout: "ok", stderr: "bad" });
  });

  it("preserves the forced output-limit error when the process exits immediately", async () => {
    const runtime = createNodeAdapterRuntime();

    await expect(
      runtime.execFile(
        process.execPath,
        ["-e", "process.stdout.write('over-limit'); process.exit(0)"],
        {
          timeoutMs: 1_000,
          maxStdoutBytes: 4,
          maxStderrBytes: 128,
          shell: false,
          stdin: "ignore",
        },
      ),
    ).rejects.toMatchObject({ code: "EXEC_OUTPUT_LIMIT", operation: "execFile" });
  });

  it("rejects shell-enabled and inherited-stdin execution options at runtime", async () => {
    const runtime = createNodeAdapterRuntime();
    const shellOptions = {
      timeoutMs: 1_000,
      maxStdoutBytes: 128,
      maxStderrBytes: 128,
      shell: true,
      stdin: "ignore",
    } as unknown as ExecFileOptions;
    const stdinOptions = {
      timeoutMs: 1_000,
      maxStdoutBytes: 128,
      maxStderrBytes: 128,
      shell: false,
      stdin: "inherit",
    } as unknown as ExecFileOptions;

    await expect(
      runtime.execFile(process.execPath, ["-e", ""], shellOptions),
    ).rejects.toMatchObject({
      code: "EXEC_INVALID_OPTIONS",
      operation: "execFile",
    });
    await expect(
      runtime.execFile(process.execPath, ["-e", ""], stdinOptions),
    ).rejects.toMatchObject({
      code: "EXEC_INVALID_OPTIONS",
      operation: "execFile",
    });
  });
});

describe("createFakeProcessRuntime", () => {
  it("enforces configured execution output and timeout bounds deterministically", async () => {
    const outputLimited = createFakeProcessRuntime({
      execResults: [{ exitCode: 0, stdout: "too much output", stderr: "" }],
    });

    await expect(
      outputLimited.runtime.execFile("probe", [], {
        timeoutMs: 1_000,
        maxStdoutBytes: 4,
        maxStderrBytes: 4,
        shell: false,
        stdin: "ignore",
      }),
    ).rejects.toMatchObject({ code: "EXEC_OUTPUT_LIMIT" });

    const timedOut = createFakeProcessRuntime({
      execResults: [{ exitCode: 0, stdout: "", stderr: "" }],
      execDelaysMs: [1_001],
    });

    await expect(
      timedOut.runtime.execFile("probe", [], {
        timeoutMs: 1_000,
        maxStdoutBytes: 4,
        maxStderrBytes: 4,
        shell: false,
        stdin: "ignore",
      }),
    ).rejects.toMatchObject({ code: "EXEC_TIMEOUT" });
  });

  it("mirrors real filesystem failures and follows symlinks on writes", async () => {
    const fakeRuntime = createFakeProcessRuntime({
      entries: {
        "/repo": { type: "directory", mode: 0o755 },
        "/repo/config.json": { type: "file", content: "before", mode: 0o640 },
        "/repo/config-link.json": {
          type: "symlink",
          target: "/repo/config.json",
          mode: 0o777,
        },
        "/repo/not-a-directory": { type: "file", content: "file", mode: 0o600 },
      },
    });

    await expect(fakeRuntime.runtime.writeFile("/repo", "invalid")).rejects.toMatchObject({
      code: "EISDIR",
    });
    await expect(
      fakeRuntime.runtime.mkdir("/repo/not-a-directory", { recursive: true }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(
      fakeRuntime.runtime.copyFile("/repo/config.json", "/missing/config.json"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fakeRuntime.runtime.unlink("/repo")).rejects.toMatchObject({
      code: "EISDIR",
    });
    await expect(fakeRuntime.runtime.rename("/repo/config.json", "/repo")).rejects.toMatchObject({
      code: "EISDIR",
    });

    await fakeRuntime.runtime.writeFile("/repo/config-link.json", "after");

    expect(await fakeRuntime.runtime.readFile("/repo/config.json")).toBe("after");
    expect((await fakeRuntime.runtime.lstat("/repo/config-link.json")).isSymbolicLink()).toBe(true);
  });

  it("moves directory descendants when renaming a directory", async () => {
    const fakeRuntime = createFakeProcessRuntime({
      entries: {
        "/repo": { type: "directory", mode: 0o755 },
        "/repo/source": { type: "directory", mode: 0o750 },
        "/repo/source/nested": { type: "directory", mode: 0o700 },
        "/repo/source/nested/config.json": {
          type: "file",
          content: "moved",
          mode: 0o640,
        },
      },
    });

    await fakeRuntime.runtime.rename("/repo/source", "/repo/moved");

    await expect(fakeRuntime.runtime.readFile("/repo/moved/nested/config.json")).resolves.toBe(
      "moved",
    );
    await expect(
      fakeRuntime.runtime.lstat("/repo/source/nested/config.json"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects inherited stdin in the fake runtime", async () => {
    const fakeRuntime = createFakeProcessRuntime();
    const stdinOptions = {
      timeoutMs: 1_000,
      maxStdoutBytes: 128,
      maxStderrBytes: 128,
      shell: false,
      stdin: "inherit",
    } as unknown as ExecFileOptions;

    await expect(fakeRuntime.runtime.execFile("probe", [], stdinOptions)).rejects.toMatchObject({
      code: "EXEC_INVALID_OPTIONS",
    });
  });

  it("tracks mutation primitives and symlink-aware file inspection deterministically", async () => {
    const fakeRuntime = createFakeProcessRuntime({
      cwd: join(tmpdir(), "mcpdir-fake-runtime"),
      homeDirectory: "/Users/tester",
      entries: {
        "/repo/config.json": {
          type: "file",
          content: '{"enabled":true}',
          mode: 0o640,
        },
        "/repo/link.json": {
          type: "symlink",
          target: "/repo/config.json",
          mode: 0o777,
        },
        "/repo/state": {
          type: "directory",
          mode: 0o755,
        },
      },
    });

    expect(await fakeRuntime.runtime.readFile("/repo/config.json")).toBe('{"enabled":true}');

    await fakeRuntime.runtime.mkdir("/repo/state/nested", { recursive: true, mode: 0o755 });
    await fakeRuntime.runtime.writeFile("/repo/state/nested/install.json", '{"ok":true}', {
      mode: 0o600,
      exclusive: true,
    });
    await fakeRuntime.runtime.chmod("/repo/state/nested/install.json", 0o644);
    await fakeRuntime.runtime.copyFile(
      "/repo/state/nested/install.json",
      "/repo/state/install-copy.json",
    );
    await fakeRuntime.runtime.fsyncFile("/repo/state/nested/install.json");
    await fakeRuntime.runtime.fsyncDirectory("/repo/state");
    await fakeRuntime.runtime.rename(
      "/repo/state/install-copy.json",
      "/repo/state/install-renamed.json",
    );
    expect((await fakeRuntime.runtime.lstat("/repo/link.json")).isSymbolicLink()).toBe(true);
    expect((await fakeRuntime.runtime.stat("/repo/link.json")).isFile()).toBe(true);
    expect(await fakeRuntime.runtime.realpath("/repo/link.json")).toBe("/repo/config.json");
    await fakeRuntime.runtime.unlink("/repo/state/install-renamed.json");
    await fakeRuntime.runtime.openUrl("https://example.com/install");

    expect(fakeRuntime.fileWrites).toEqual([
      {
        path: "/repo/state/nested/install.json",
        content: '{"ok":true}',
        options: {
          mode: 0o600,
          exclusive: true,
        },
      },
    ]);
    expect(fakeRuntime.mkdirCalls).toEqual([
      {
        path: "/repo/state/nested",
        options: {
          recursive: true,
          mode: 0o755,
        },
      },
    ]);
    expect(fakeRuntime.copyCalls).toEqual([
      {
        from: "/repo/state/nested/install.json",
        to: "/repo/state/install-copy.json",
        options: undefined,
      },
    ]);
    expect(fakeRuntime.chmodCalls).toEqual([
      {
        path: "/repo/state/nested/install.json",
        mode: 0o644,
      },
    ]);
    expect(fakeRuntime.renameCalls).toEqual([
      {
        from: "/repo/state/install-copy.json",
        to: "/repo/state/install-renamed.json",
      },
    ]);
    expect(fakeRuntime.fsyncFileCalls).toEqual(["/repo/state/nested/install.json"]);
    expect(fakeRuntime.fsyncDirectoryCalls).toEqual(["/repo/state"]);
    expect(fakeRuntime.unlinkCalls).toEqual(["/repo/state/install-renamed.json"]);
    expect(fakeRuntime.readCalls).toEqual(["/repo/config.json"]);
    expect(fakeRuntime.lstatCalls).toEqual(["/repo/link.json"]);
    expect(fakeRuntime.statCalls).toEqual(["/repo/link.json"]);
    expect(fakeRuntime.realpathCalls).toEqual(["/repo/link.json"]);
    expect(fakeRuntime.openCalls).toEqual(["https://example.com/install"]);
  });
});
