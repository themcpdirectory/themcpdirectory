import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createInquirerPromptIO,
  PromptCancelledError,
  resolvePromptMode,
} from "../prompts/inquirer.js";

function createStreams(): {
  readonly input: PassThrough;
  readonly output: PassThrough;
  readonly getWritten: () => string;
} {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = "";
  output.on("data", (chunk: Buffer) => {
    written += chunk.toString("utf8");
  });
  return { input, output, getWritten: () => written };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("resolvePromptMode", () => {
  it("defaults to select mode when MCPDIR_PROMPT_MODE is unset", () => {
    expect(resolvePromptMode({})).toBe("select");
  });

  it("resolves numbered mode explicitly", () => {
    expect(resolvePromptMode({ MCPDIR_PROMPT_MODE: "numbered" })).toBe("numbered");
  });

  it("falls back to select for unrecognized values", () => {
    expect(resolvePromptMode({ MCPDIR_PROMPT_MODE: "bogus" })).toBe("select");
  });
});

describe("createInquirerPromptIO", () => {
  it("rejects prompting attempts while non-interactive", async () => {
    const { input, output } = createStreams();
    const promptIO = createInquirerPromptIO({ input, output, isInteractive: false });

    await expect(promptIO.input("Name")).rejects.toThrow(
      "Interactive prompting is unavailable in non-interactive mode",
    );
    await expect(promptIO.select("Name", ["a", "b"])).rejects.toThrow(
      "Interactive prompting is unavailable in non-interactive mode",
    );
    await expect(promptIO.secretInput("Name")).rejects.toThrow(
      "Interactive prompting is unavailable in non-interactive mode",
    );
    await expect(promptIO.confirm("Name")).rejects.toThrow(
      "Interactive prompting is unavailable in non-interactive mode",
    );
  });

  describe("select (arrow-key mode)", () => {
    it("resolves the highlighted choice using only the injected streams", async () => {
      const { input, output, getWritten } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      try {
        const resultPromise = promptIO.select("Pick a client", ["cursor", "vscode", "codex"]);
        await flush();
        input.write("\r");
        await expect(resultPromise).resolves.toBe("cursor");
      } finally {
        stdoutSpy.mockRestore();
      }

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(getWritten()).toContain("cursor");
    });

    it("moves the highlighted choice with the down arrow before accepting", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.select("Pick a client", ["cursor", "vscode", "codex"]);
      await flush();
      input.write("\u001B[B");
      await flush();
      input.write("\r");

      await expect(resultPromise).resolves.toBe("vscode");
    });
  });

  describe("numbered fallback mode", () => {
    it("resolves the choice matching the typed number", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({
        input,
        output,
        isInteractive: true,
        mode: "numbered",
      });

      const resultPromise = promptIO.select("Pick a client", ["cursor", "vscode", "codex"]);
      await flush();
      input.write("2");
      await flush();
      input.write("\r");

      await expect(resultPromise).resolves.toBe("vscode");
    });

    it("never enables arrow-key navigation output for the numbered choice list", async () => {
      const { input, output, getWritten } = createStreams();
      const promptIO = createInquirerPromptIO({
        input,
        output,
        isInteractive: true,
        mode: "numbered",
      });

      const resultPromise = promptIO.select("Pick a client", ["cursor", "vscode"]);
      await flush();
      input.write("1");
      await flush();
      input.write("\r");

      await expect(resultPromise).resolves.toBe("cursor");
      expect(getWritten()).toContain("1) cursor");
    });
  });

  describe("cancellation normalization", () => {
    it("normalizes EOF during a prompt into a stable PromptCancelledError", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.input("Server name");
      await flush();
      input.end();

      await expect(resultPromise).rejects.toBeInstanceOf(PromptCancelledError);
    });

    it("normalizes Ctrl+C during select into a stable PromptCancelledError", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.select("Pick a client", ["cursor", "vscode"]);
      await flush();
      input.write("\x03");

      await expect(resultPromise).rejects.toBeInstanceOf(PromptCancelledError);
      await expect(resultPromise).rejects.toMatchObject({ name: "PromptCancelledError" });
    });

    it("normalizes Ctrl+C during a text input prompt", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.input("Server name");
      await flush();
      input.write("\x03");

      await expect(resultPromise).rejects.toBeInstanceOf(PromptCancelledError);
    });

    it("normalizes Ctrl+C during a confirm prompt without leaking the inquirer error name", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.confirm("Proceed?");
      await flush();
      input.write("\x03");

      const error: unknown = await resultPromise.catch((rejection: unknown) => rejection);
      expect(error).toBeInstanceOf(PromptCancelledError);
      expect((error as Error).name).not.toBe("ExitPromptError");
    });

    it("normalizes Ctrl+C during masked secret input", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.secretInput("API key");
      await flush();
      input.write("\x03");

      await expect(resultPromise).rejects.toBeInstanceOf(PromptCancelledError);
    });
  });

  describe("input, secretInput, and confirm", () => {
    it("collects free text via the injected streams", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.input("Server name");
      await flush();
      input.write("my-server");
      await flush();
      input.write("\r");

      await expect(resultPromise).resolves.toBe("my-server");
    });

    it("masks secret input and never echoes the plaintext to the output stream", async () => {
      const { input, output, getWritten } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.secretInput("API key");
      await flush();
      input.write("super-secret-token");
      await flush();
      input.write("\r");

      await expect(resultPromise).resolves.toBe("super-secret-token");
      expect(getWritten()).not.toContain("super-secret-token");
      expect(getWritten()).toContain("*");
    });

    it("confirms false by default when Enter is pressed immediately", async () => {
      const { input, output } = createStreams();
      const promptIO = createInquirerPromptIO({ input, output, isInteractive: true });

      const resultPromise = promptIO.confirm("Proceed?");
      await flush();
      input.write("\r");

      await expect(resultPromise).resolves.toBe(false);
    });
  });
});
