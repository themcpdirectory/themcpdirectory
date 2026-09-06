import {
  createAdapterRegistry,
  createClaudeCodeAdapter,
  createCodexAdapter,
  createCursorAdapter,
  createNodeAdapterRuntime,
  createVsCodeAdapter,
  type AdapterRegistry,
} from "@themcpdirectory/client-adapters";
import { readFile, writeFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { DirectoryClient } from "@themcpdirectory/directory-client";
import type { ReceiptStore } from "./config/receipt-store.js";
import { createReceiptStore } from "./config/receipt-store.js";
import { type CliRuntimeConfig, resolveCliRuntimeConfig } from "./config/runtime.js";
import { resolveCliStatePaths } from "./config/state-paths.js";
import { createInquirerPromptIO, resolvePromptMode } from "./prompts/inquirer.js";
import {
  createPinnedRegistryPublishTransport,
  type RegistryPublishTransport,
} from "./registry-publish-transport.js";
import type { TelemetryReporter } from "./telemetry.js";
import { createTelemetryReporter } from "./telemetry.js";

export interface PromptIO {
  readonly isInteractive: boolean;
  select<T extends string>(message: string, options: readonly T[]): Promise<T>;
  input(message: string): Promise<string>;
  secretInput(message: string): Promise<string>;
  confirm(message: string): Promise<boolean>;
}

export interface OutputWriter {
  writeStdout(line: string): void;
  writeStderr(line: string): void;
}

export interface MaintainerFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(
    path: string,
    contents: string,
    options?: { readonly flag?: "w" | "wx" },
  ): Promise<void>;
}

export interface CliDependencies {
  readonly directoryClient: DirectoryClient;
  readonly adapterRegistry: AdapterRegistry;
  readonly receiptStore: ReceiptStore;
  readonly promptIO: PromptIO;
  readonly output: OutputWriter;
  readonly runtime: CliRuntimeConfig;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly clock: () => Date;
  readonly telemetryReporter?: TelemetryReporter;
  readonly maintainerFileSystem?: MaintainerFileSystem;
  readonly fetchImpl?: typeof fetch;
  readonly dnsLookup?: (hostname: string) => Promise<readonly string[]>;
  readonly registryPublishTransport?: RegistryPublishTransport;
}

export type { RegistryPublishTransport } from "./registry-publish-transport.js";

export interface DefaultCliDependenciesOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly stderr?: NodeJS.WriteStream;
  readonly clock?: () => Date;
  readonly fetchImpl?: typeof fetch;
}

export function createDefaultCliDependencies(
  options: DefaultCliDependenciesOptions = {},
): CliDependencies {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const homeDirectory =
    options.homeDirectory ?? env.HOME ?? env.USERPROFILE ?? process.env.HOME ?? cwd;
  const clock = options.clock ?? (() => new Date());
  const runtime = resolveCliRuntimeConfig({ env, cwd, platform, homeDirectory });
  const statePaths = resolveCliStatePaths({ env, cwd, platform, homeDirectory });
  const adapterRuntime = createNodeAdapterRuntime({ env, cwd, platform, homeDirectory });
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const stdin = options.stdin ?? process.stdin;

  return {
    directoryClient: new DirectoryClient({
      baseUrl: runtime.apiBaseUrl,
      timeoutMs: runtime.requestTimeoutMs,
      userAgent: "mcpdir-cli/0.1.0",
    }),
    adapterRegistry: createAdapterRegistry([
      createCodexAdapter(adapterRuntime),
      createClaudeCodeAdapter(adapterRuntime),
      createCursorAdapter(adapterRuntime),
      createVsCodeAdapter(adapterRuntime),
    ]),
    receiptStore: createReceiptStore(statePaths, { now: clock }),
    promptIO: createPromptIO(stdin, stdout, { environment: env }),
    output: createOutputWriter(stdout, stderr),
    runtime,
    environment: env,
    clock,
    ...(env.DO_NOT_TRACK === "1" || env.MCPDIR_DISABLE_TELEMETRY === "1"
      ? {}
      : {
          telemetryReporter: createTelemetryReporter({
            apiBaseUrl: runtime.apiBaseUrl,
            ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          }),
        }),
    maintainerFileSystem: {
      readFile: (path) => readFile(path, "utf8"),
      writeFile: (path, contents, writeOptions) => writeFile(path, contents, writeOptions),
    },
    fetchImpl: options.fetchImpl ?? fetch,
    dnsLookup: async (hostname) =>
      (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address),
    registryPublishTransport: createPinnedRegistryPublishTransport(),
  };
}

export function createOutputWriter(
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
): OutputWriter {
  return {
    writeStdout(line: string): void {
      stdout.write(line);
    },
    writeStderr(line: string): void {
      stderr.write(line);
    },
  };
}

export function createPromptIO(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  options: { readonly environment?: Readonly<NodeJS.ProcessEnv> } = {},
): PromptIO {
  return createInquirerPromptIO({
    input: stdin,
    output: stdout,
    isInteractive: Boolean(stdin.isTTY && stdout.isTTY),
    mode: resolvePromptMode(options.environment ?? process.env),
  });
}
