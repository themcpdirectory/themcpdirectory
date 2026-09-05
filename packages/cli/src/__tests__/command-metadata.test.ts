import { describe, expect, it } from "vitest";
import { CLI_COMMANDS, CLI_HELP_TEXT, CLI_SUPPORTED_CLIENTS } from "../index.js";

describe("CLI command metadata", () => {
  it("is the complete exported source for command help and supported clients", () => {
    expect(CLI_COMMANDS.map((command) => command.name)).toEqual([
      "doctor",
      "search",
      "info",
      "add",
      "list",
      "remove",
      "update",
    ]);
    expect(CLI_COMMANDS.map((command) => command.usage)).toEqual([
      "Usage: mcpdir doctor [--json]",
      "Usage: mcpdir search <query> [--client <id>] [--category <slug>] [--cursor <value>] [--limit <n>] [--sort <recent|name|relevance>] [--json]",
      "Usage: mcpdir info <slug> [--json]",
      "Usage: mcpdir add <slug-or-alias> [--to <client[,client]|all>] [--scope <user|project|global>] [--variant <id>] [--yes] [--dry-run] [--json]",
      "Usage: mcpdir list [--json]",
      "Usage: mcpdir remove <slug> [--to <client>] [--scope <user|project|global>] [--yes] [--dry-run] [--json]",
      "Usage: mcpdir update [server] [--to <client>] [--yes] [--dry-run] [--json]",
    ]);
    expect(CLI_HELP_TEXT).toMatch(/add <slug-or-alias> \[options\]\s+Install an MCP server/u);
    expect(CLI_SUPPORTED_CLIENTS).toEqual([
      { id: "claude-code", name: "Claude Code" },
      { id: "codex", name: "Codex" },
      { id: "cursor", name: "Cursor" },
      { id: "vscode", name: "VS Code" },
    ]);
  });
});
