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
  createNodeAdapterRuntime,
  type ClientDetection,
  type DiagnosticResult,
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
});

describe("createFakeProcessRuntime", () => {
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
