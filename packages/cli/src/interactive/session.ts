import type { CliDependencies } from "../dependencies.js";
import { dispatchCommand } from "../command-dispatch.js";
import { sanitizeTerminalText } from "../output/render.js";
import { PromptCancelledError } from "../prompts/inquirer.js";

const MAIN_ACTIONS = [
  "Discover servers",
  "Inspect a server",
  "Install a server",
  "Installed servers",
  "Update installations",
  "Remove a server",
  "Run diagnostics",
  "Quit",
] as const;

type MainAction = (typeof MAIN_ACTIONS)[number];

export async function runInteractiveSession(deps: CliDependencies): Promise<number> {
  deps.output.writeStdout("\nMCP Directory\nFind, inspect, and manage MCP servers.\n\n");

  try {
    while (true) {
      const action = await deps.promptIO.select<MainAction>(
        "What would you like to do?",
        MAIN_ACTIONS,
      );
      if (action === "Quit") {
        deps.output.writeStdout("Goodbye.\n");
        return 0;
      }

      if (action === "Discover servers") {
        await runDiscoverFlow(deps);
        continue;
      }

      const request = await buildCommandRequest(action, deps);
      if (!request) {
        continue;
      }

      deps.output.writeStdout("\n");
      await dispatchCommand(request.command, request.args, deps);
      deps.output.writeStdout("\n");
    }
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      deps.output.writeStdout("\nSession closed.\n");
      return 0;
    }

    throw error;
  }
}

interface CommandRequest {
  readonly command: string;
  readonly args: readonly string[];
}

async function buildCommandRequest(
  action: MainAction,
  deps: CliDependencies,
): Promise<CommandRequest | null> {
  switch (action) {
    case "Discover servers":
      return null;
    case "Inspect a server": {
      const slug = await requiredInput("Server slug", deps);
      return slug ? { command: "info", args: [slug] } : null;
    }
    case "Install a server": {
      const slug = await requiredInput("Server slug or alias", deps);
      return slug ? { command: "add", args: [slug] } : null;
    }
    case "Installed servers":
      return { command: "list", args: [] };
    case "Update installations": {
      const target = await deps.promptIO.select("What should be updated?", [
        "All managed servers",
        "One server",
        "Back",
      ] as const);
      if (target === "Back") return null;
      if (target === "All managed servers") return { command: "update", args: [] };
      const slug = await requiredInput("Server slug", deps);
      return slug ? { command: "update", args: [slug] } : null;
    }
    case "Remove a server": {
      const slug = await requiredInput("Server slug", deps);
      return slug ? { command: "remove", args: [slug] } : null;
    }
    case "Run diagnostics":
      return { command: "doctor", args: [] };
    case "Quit":
      return null;
  }
}

async function runDiscoverFlow(deps: CliDependencies): Promise<void> {
  const query = await requiredInput("What are you looking for?", deps);
  if (!query) return;

  try {
    const response = await deps.directoryClient.searchServers({ q: query, limit: 12 });
    if (response.data.length === 0) {
      deps.output.writeStdout("\nNo matching servers. Try another search.\n\n");
      return;
    }

    const labels = response.data.map(
      (server) => `${sanitizeTerminalText(server.title)} — ${server.slug}`,
    );
    const backLabel = "Back to main menu";
    const selectedLabel = await deps.promptIO.select("Choose a server", [...labels, backLabel]);
    if (selectedLabel === backLabel) return;

    const selected = response.data[labels.indexOf(selectedLabel)];
    if (!selected) return;

    const nextAction = await deps.promptIO.select("What next?", [
      "View details",
      "Install this server",
      "Back to main menu",
    ] as const);
    if (nextAction === "View details") {
      deps.output.writeStdout("\n");
      await dispatchCommand("info", [selected.slug], deps);
      deps.output.writeStdout("\n");
    } else if (nextAction === "Install this server") {
      deps.output.writeStdout("\n");
      await dispatchCommand("add", [selected.slug], deps);
      deps.output.writeStdout("\n");
    }
  } catch (error) {
    deps.output.writeStderr(
      `${sanitizeTerminalText(error instanceof Error ? error.message : "Search failed")}\n`,
    );
  }
}

async function requiredInput(message: string, deps: CliDependencies): Promise<string | null> {
  const value = (await deps.promptIO.input(message)).trim();
  if (value) return value;

  deps.output.writeStderr("A value is required. Returning to the main menu.\n");
  return null;
}
