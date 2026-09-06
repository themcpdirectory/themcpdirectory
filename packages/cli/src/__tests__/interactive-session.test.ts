import { createInProcessCliHarness } from "@themcpdirectory/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDependencies } from "../dependencies.js";
import type * as SessionModule from "../interactive/session.js";

const mocks = vi.hoisted(() => ({
  runInteractiveSession: vi.fn(),
  dispatchCommand: vi.fn(),
}));

vi.mock("../interactive/session.js", () => ({
  runInteractiveSession: mocks.runInteractiveSession,
}));

vi.mock("../command-dispatch.js", () => ({
  dispatchCommand: mocks.dispatchCommand,
}));

import { CLI_HELP_TEXT, runCli } from "../cli.js";

function createInteractivePromptDouble(): CliDependencies["promptIO"] {
  const unavailable = (): Promise<never> => {
    throw new Error("interactive session entry test never exercises prompt methods");
  };
  return {
    isInteractive: true,
    select: unavailable,
    input: unavailable,
    secretInput: unavailable,
    confirm: unavailable,
  };
}

beforeEach(() => {
  mocks.runInteractiveSession.mockReset();
  mocks.dispatchCommand.mockReset();
});

describe("interactive session entry boundary", () => {
  it("prints the existing help exactly for empty argv when non-interactive", async () => {
    const harness = createInProcessCliHarness<CliDependencies>();

    const exitCode = await runCli([], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("")).toBe(`${CLI_HELP_TEXT}\n`);
    expect(harness.stderr.join("")).toBe("");
    expect(mocks.runInteractiveSession).not.toHaveBeenCalled();
  });

  it("enters the interactive session for empty argv when interactive and returns its exit code", async () => {
    mocks.runInteractiveSession.mockResolvedValue(3);
    const harness = createInProcessCliHarness<CliDependencies>({
      promptIO: createInteractivePromptDouble(),
    });

    const exitCode = await runCli([], harness.deps);

    expect(exitCode).toBe(3);
    expect(mocks.runInteractiveSession).toHaveBeenCalledTimes(1);
    expect(mocks.runInteractiveSession.mock.calls[0]?.[0]).toBe(harness.deps);
    expect(harness.stdout.join("")).toBe("");
  });

  it("never enters the session for explicit commands even when interactive", async () => {
    mocks.runInteractiveSession.mockResolvedValue(0);
    const harness = createInProcessCliHarness<CliDependencies>({
      promptIO: createInteractivePromptDouble(),
      adapterRegistry: { list: () => [] } as unknown as CliDependencies["adapterRegistry"],
    });

    await runCli(["help"], harness.deps);
    await runCli(["--help"], harness.deps);
    await runCli(["-h"], harness.deps);
    await runCli(["--version"], harness.deps);
    await runCli(["-v"], harness.deps);
    await runCli(["list"], harness.deps);

    expect(mocks.runInteractiveSession).not.toHaveBeenCalled();
  });
});

describe("runInteractiveSession real implementation", () => {
  it("routes menu choices through existing command handlers until quit", async () => {
    const { runInteractiveSession } = await vi.importActual<typeof SessionModule>(
      "../interactive/session.js",
    );
    const choices = ["Run diagnostics", "Quit"];
    const harness = createInProcessCliHarness<CliDependencies>({
      promptIO: {
        isInteractive: true,
        select: vi.fn(async () => choices.shift() as never),
        input: vi.fn(),
        secretInput: vi.fn(),
        confirm: vi.fn(),
      },
    });
    mocks.dispatchCommand.mockResolvedValue(0);

    const exitCode = await runInteractiveSession(harness.deps);

    expect(exitCode).toBe(0);
    const [command, args, dependencies] = mocks.dispatchCommand.mock.calls[0] ?? [];
    expect(command).toBe("doctor");
    expect(args).toEqual([]);
    expect(dependencies === harness.deps).toBe(true);
    expect(harness.stdout.join("")).toContain("MCP Directory");
    expect(harness.stdout.join("")).toContain("Goodbye.");
    expect(harness.stderr.join("")).toBe("");
  });

  it("guides discovery from search result to an existing command handler", async () => {
    const { runInteractiveSession } = await vi.importActual<typeof SessionModule>(
      "../interactive/session.js",
    );
    const choices = ["Discover servers", "GitHub MCP — github", "View details", "Quit"];
    const harness = createInProcessCliHarness<CliDependencies>({
      directoryClient: {
        searchServers: vi.fn(async () => ({
          data: [{ title: "GitHub MCP", slug: "github" }],
          meta: { nextCursor: null },
        })),
      } as unknown as CliDependencies["directoryClient"],
      promptIO: {
        isInteractive: true,
        select: vi.fn(async () => choices.shift() as never),
        input: vi.fn(async () => "github tools"),
        secretInput: vi.fn(),
        confirm: vi.fn(),
      },
    });
    mocks.dispatchCommand.mockResolvedValue(0);

    await runInteractiveSession(harness.deps);

    expect(harness.deps.directoryClient.searchServers).toHaveBeenCalledWith({
      q: "github tools",
      limit: 12,
    });
    expect(mocks.dispatchCommand).toHaveBeenCalledWith("info", ["github"], harness.deps);
  });

  it("returns to the menu when required input is empty", async () => {
    const { runInteractiveSession } = await vi.importActual<typeof SessionModule>(
      "../interactive/session.js",
    );
    const choices = ["Install a server", "Quit"];
    const harness = createInProcessCliHarness<CliDependencies>({
      promptIO: {
        isInteractive: true,
        select: vi.fn(async () => choices.shift() as never),
        input: vi.fn(async () => "  "),
        secretInput: vi.fn(),
        confirm: vi.fn(),
      },
    });

    await runInteractiveSession(harness.deps);

    expect(mocks.dispatchCommand.mock.calls).toHaveLength(0);
    expect(harness.stderr.join("")).toContain("A value is required");
  });
});
