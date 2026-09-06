import { describe, expect, it, vi } from "vitest";
import { getCopyButtonPresentation, performCopy } from "./copy-button";

describe("CopyButton", () => {
  it("uses Copy then Copied labels when the clipboard write succeeds", async () => {
    const command = "npx @themcpdirectory/cli add example-server";
    const writeText = vi.fn(async () => undefined);

    expect(getCopyButtonPresentation("idle")).toMatchObject({
      label: "Copy",
      statusMessage: "Ready to copy.",
    });

    const nextState = await performCopy(writeText, command);

    expect(writeText).toHaveBeenCalledWith(command);
    expect(nextState).toBe("copied");
    expect(getCopyButtonPresentation(nextState)).toMatchObject({
      label: "Copied",
      statusMessage: "Command copied.",
    });
  });

  it("surfaces a failure label when the clipboard write rejects", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("clipboard unavailable");
    });

    const nextState = await performCopy(writeText, "npx @themcpdirectory/cli add broken-server");

    expect(nextState).toBe("error");
    expect(getCopyButtonPresentation(nextState)).toMatchObject({
      label: "Copy failed",
      statusMessage: "Copy failed. Select the command text manually.",
    });
  });
});
