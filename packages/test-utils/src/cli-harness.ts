interface HarnessPromptIO {
  readonly isInteractive: boolean;
  select<T extends string>(message: string, options: readonly T[]): Promise<T>;
  input(message: string): Promise<string>;
  secretInput(message: string): Promise<string>;
  confirm(message: string): Promise<boolean>;
}

interface HarnessOutputWriter {
  writeStdout(value: string): void;
  writeStderr(value: string): void;
}

export interface CliHarnessDependencies {
  readonly directoryClient: unknown;
  readonly adapterRegistry: unknown;
  readonly receiptStore: unknown;
  readonly promptIO: HarnessPromptIO;
  readonly output: HarnessOutputWriter;
  readonly runtime: {
    readonly apiBaseUrl: string;
    readonly requestTimeoutMs: number;
    readonly stateDirOverride?: string;
  };
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly clock: () => Date;
}

export interface InProcessCliHarness<Dependencies extends CliHarnessDependencies> {
  readonly deps: Dependencies;
  readonly stdout: string[];
  readonly stderr: string[];
}

export function createInProcessCliHarness<Dependencies extends CliHarnessDependencies>(
  overrides: Partial<Dependencies> = {},
): InProcessCliHarness<Dependencies> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const forwardedOutput = overrides.output;
  const deps = {
    directoryClient: unavailableDependency("directoryClient"),
    adapterRegistry: unavailableDependency("adapterRegistry"),
    receiptStore: createMemoryReceiptStore(),
    promptIO: createNoninteractivePrompt(),
    runtime: { apiBaseUrl: "http://127.0.0.1:1/api/v1", requestTimeoutMs: 100 },
    environment: {},
    clock: () => new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
    output: {
      writeStdout(value: string) {
        stdout.push(value);
        forwardedOutput?.writeStdout(value);
      },
      writeStderr(value: string) {
        stderr.push(value);
        forwardedOutput?.writeStderr(value);
      },
    },
  } as Dependencies;

  return { deps, stdout, stderr };
}

function unavailableDependency(name: "directoryClient" | "adapterRegistry"): unknown {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`The in-process CLI harness requires a ${name} override.`);
      },
    },
  );
}

interface HarnessReceipt {
  readonly slug: string;
  readonly client: string;
  readonly scope: string;
}

type HarnessReceiptKey = Pick<HarnessReceipt, "slug" | "client" | "scope">;

function createMemoryReceiptStore() {
  let receipts: readonly HarnessReceipt[] = [];
  return {
    async list() {
      return receipts.map((receipt) => ({ ...receipt }));
    },
    async write(receipt: HarnessReceipt) {
      receipts = [
        ...receipts.filter(
          (candidate) =>
            candidate.slug !== receipt.slug ||
            candidate.client !== receipt.client ||
            candidate.scope !== receipt.scope,
        ),
        { ...receipt },
      ];
    },
    async remove(key: HarnessReceiptKey) {
      receipts = receipts.filter(
        (candidate) =>
          candidate.slug !== key.slug ||
          candidate.client !== key.client ||
          candidate.scope !== key.scope,
      );
    },
    async find(key: HarnessReceiptKey) {
      const receipt = receipts.find(
        (candidate) =>
          candidate.slug === key.slug &&
          candidate.client === key.client &&
          candidate.scope === key.scope,
      );
      return receipt ? { ...receipt } : null;
    },
  };
}

function createNoninteractivePrompt(): HarnessPromptIO {
  const reject = async (): Promise<never> => {
    throw new Error("The in-process CLI harness is noninteractive by default.");
  };
  return {
    isInteractive: false,
    select: reject,
    input: reject,
    secretInput: reject,
    confirm: reject,
  };
}
