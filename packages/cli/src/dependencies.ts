import { createInterface } from "node:readline/promises";
import {
  createAdapterRegistry,
  createClaudeCodeAdapter,
  createCodexAdapter,
  createCursorAdapter,
  createNodeAdapterRuntime,
  createVsCodeAdapter,
  type AdapterRegistry,
} from "@themcpdirectory/client-adapters";
import { DirectoryClient } from "@themcpdirectory/directory-client";
import type { ReceiptStore } from "./config/receipt-store.js";
import { createReceiptStore } from "./config/receipt-store.js";
import { type CliRuntimeConfig, resolveCliRuntimeConfig } from "./config/runtime.js";
import { resolveCliStatePaths } from "./config/state-paths.js";

export interface PromptIO {
  readonly isInteractive: boolean;
  select<T extends string>(message: string, options: readonly T[]): Promise<T>;
  input(message: string): Promise<string>;
  confirm(message: string): Promise<boolean>;
}

export interface OutputWriter {
  writeStdout(line: string): void;
  writeStderr(line: string): void;
}

export interface CliDependencies {
  readonly directoryClient: DirectoryClient;
  readonly adapterRegistry: AdapterRegistry;
  readonly receiptStore: ReceiptStore;
  readonly promptIO: PromptIO;
  readonly output: OutputWriter;
  readonly runtime: CliRuntimeConfig;
  readonly clock: () => Date;
}

export interface DefaultCliDependenciesOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly stderr?: NodeJS.WriteStream;
  readonly clock?: () => Date;
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
    promptIO: createPromptIO(stdin, stdout),
    output: createOutputWriter(stdout, stderr),
    runtime,
    clock,
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
): PromptIO {
  const isInteractive = Boolean(stdin.isTTY && stdout.isTTY);

  return {
    isInteractive,
    async select<T extends string>(message: string, options: readonly T[]): Promise<T> {
      assertInteractive(isInteractive);
      const optionLines = options.map((option, index) => `${index + 1}. ${option}`).join("\n");

      while (true) {
        const answer = await ask(stdin, stdout, `${message}\n${optionLines}\nSelect an option: `);
        const byNumber = Number(answer.trim());
        if (Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= options.length) {
          return options[byNumber - 1]!;
        }

        const byValue = options.find((option) => option === answer.trim());
        if (byValue) {
          return byValue;
        }

        stdout.write("Please choose one of the listed options.\n");
      }
    },

    async input(message: string): Promise<string> {
      assertInteractive(isInteractive);
      return await ask(stdin, stdout, `${message}: `);
    },

    async confirm(message: string): Promise<boolean> {
      assertInteractive(isInteractive);

      while (true) {
        const answer = (await ask(stdin, stdout, `${message} [y/N]: `)).trim().toLowerCase();
        if (answer === "y" || answer === "yes") {
          return true;
        }

        if (answer === "" || answer === "n" || answer === "no") {
          return false;
        }

        stdout.write("Please answer yes or no.\n");
      }
    },
  };
}

async function ask(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  message: string,
): Promise<string> {
  const readline = createInterface({ input: stdin, output: stdout });

  try {
    return await readline.question(message);
  } finally {
    readline.close();
  }
}

function assertInteractive(isInteractive: boolean): void {
  if (!isInteractive) {
    throw new Error("Interactive prompting is unavailable in non-interactive mode");
  }
}