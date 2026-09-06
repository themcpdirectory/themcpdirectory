import {
  confirm as inquirerConfirm,
  input as inquirerInput,
  password as inquirerPassword,
  rawlist as inquirerRawList,
  select as inquirerSelect,
} from "@inquirer/prompts";
import type { PromptIO } from "../dependencies.js";

export type PromptMode = "select" | "numbered";

const PROMPT_MODE_ENV_VAR = "MCPDIR_PROMPT_MODE";

/** Stable cancellation signal for Ctrl+C/EOF, independent of the underlying prompt implementation. */
export class PromptCancelledError extends Error {
  constructor(message = "The prompt was cancelled.") {
    super(message);
    this.name = "PromptCancelledError";
  }
}

export interface InquirerPromptIOOptions {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly isInteractive: boolean;
  readonly mode?: PromptMode;
}

export function resolvePromptMode(environment: Readonly<NodeJS.ProcessEnv>): PromptMode {
  return environment[PROMPT_MODE_ENV_VAR] === "numbered" ? "numbered" : "select";
}

export function createInquirerPromptIO(options: InquirerPromptIOOptions): PromptIO {
  const { isInteractive } = options;
  const mode = options.mode ?? "select";

  return {
    isInteractive,

    async select<T extends string>(message: string, values: readonly T[]): Promise<T> {
      assertInteractive(isInteractive);
      const choices = values.map((value) => ({ name: value, value }));

      return await runPrompt(options, (signal) =>
        mode === "numbered"
          ? inquirerRawList<T>({ message, choices }, { ...options, signal })
          : inquirerSelect<T>({ message, choices }, { ...options, signal }),
      );
    },

    async input(message: string): Promise<string> {
      assertInteractive(isInteractive);
      return await runPrompt(options, (signal) =>
        inquirerInput({ message }, { ...options, signal }),
      );
    },

    async secretInput(message: string): Promise<string> {
      assertInteractive(isInteractive);
      return await runPrompt(options, (signal) =>
        inquirerPassword({ message, mask: true }, { ...options, signal }),
      );
    },

    async confirm(message: string): Promise<boolean> {
      assertInteractive(isInteractive);
      return await runPrompt(options, (signal) =>
        inquirerConfirm({ message, default: false }, { ...options, signal }),
      );
    },
  };
}

async function runPrompt<T>(
  options: InquirerPromptIOOptions,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.input.once("end", cancel);
  options.input.once("close", cancel);
  options.input.once("finish", cancel);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (isPromptCancellation(error)) {
      throw new PromptCancelledError();
    }

    throw error;
  } finally {
    options.input.removeListener("end", cancel);
    options.input.removeListener("close", cancel);
    options.input.removeListener("finish", cancel);
  }
}

function isPromptCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ExitPromptError" ||
      error.name === "AbortPromptError" ||
      error.name === "CancelPromptError")
  );
}

function assertInteractive(isInteractive: boolean): void {
  if (!isInteractive) {
    throw new Error("Interactive prompting is unavailable in non-interactive mode");
  }
}
