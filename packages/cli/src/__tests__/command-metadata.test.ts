import { describe, expect, it } from "vitest";
import {
  CLI_COMMANDS,
  CLI_DOCUMENTATION,
  CLI_HELP_TEXT,
  CLI_REPOSITORY_INVOCATION,
  CLI_SUPPORTED_CLIENTS,
} from "../index.js";

describe("CLI command metadata", () => {
  it("is the complete exported source for command help and supported clients", () => {
    expect(
      CLI_COMMANDS.map(({ name, aliases, options }) => ({
        name,
        aliases,
        options: options.map((option) => option.syntax),
      })),
    ).toEqual([
      { name: "help", aliases: ["--help", "-h"], options: [] },
      { name: "doctor", aliases: [], options: ["--json"] },
      {
        name: "search",
        aliases: [],
        options: [
          "--client <id>",
          "--category <slug>",
          "--cursor <value>",
          "--limit <n>",
          "--sort <recent|name|relevance>",
          "--json",
        ],
      },
      { name: "info", aliases: [], options: ["--json"] },
      {
        name: "add",
        aliases: [],
        options: [
          "--to <client[,client]|all>",
          "--scope <user|project|global>",
          "--variant <id>",
          "--yes, -y",
          "--dry-run",
          "--json",
        ],
      },
      { name: "list", aliases: [], options: ["--json"] },
      {
        name: "remove",
        aliases: [],
        options: ["--to <client>", "--scope <user|project|global>", "--yes", "--dry-run", "--json"],
      },
      {
        name: "update",
        aliases: [],
        options: ["--to <client>", "--yes", "--dry-run", "--json"],
      },
    ]);
    expect(CLI_COMMANDS.map((command) => command.usage)).toEqual([
      "Usage: mcpdir help",
      "Usage: mcpdir doctor [--json]",
      "Usage: mcpdir search <query> [--client <id>] [--category <slug>] [--cursor <value>] [--limit <n>] [--sort <recent|name|relevance>] [--json]",
      "Usage: mcpdir info <slug> [--json]",
      "Usage: mcpdir add <slug-or-alias> [--to <client[,client]|all>] [--scope <user|project|global>] [--variant <id>] [--yes] [--dry-run] [--json]",
      "Usage: mcpdir list [--json]",
      "Usage: mcpdir remove <slug> [--to <client>] [--scope <user|project|global>] [--yes] [--dry-run] [--json]",
      "Usage: mcpdir update [server] [--to <client>] [--yes] [--dry-run] [--json]",
    ]);
    expect(CLI_HELP_TEXT).toMatch(/help\s+Show this help/u);
    expect(CLI_HELP_TEXT).toMatch(/add <slug-or-alias> \[options\]\s+Install an MCP server/u);
    expect(CLI_SUPPORTED_CLIENTS).toEqual([
      {
        id: "claude-code",
        name: "Claude Code",
        scopeSupport: { mode: "runtime-probed" },
      },
      { id: "codex", name: "Codex", scopeSupport: { mode: "static", scopes: ["user"] } },
      {
        id: "cursor",
        name: "Cursor",
        scopeSupport: { mode: "static", scopes: ["user", "project"] },
      },
      {
        id: "vscode",
        name: "VS Code",
        scopeSupport: { mode: "static", scopes: ["user", "project"] },
      },
    ]);
    expect(CLI_REPOSITORY_INVOCATION).toBe("node packages/cli/dist/index.js");
    expect(CLI_DOCUMENTATION).toMatchObject({
      exitCodes: [
        { code: 0, meaning: expect.stringContaining("success") },
        { code: 1, meaning: expect.stringContaining("Operational") },
        { code: 2, meaning: expect.stringContaining("Invalid command usage") },
      ],
      receipts: {
        guarantees: expect.arrayContaining([
          expect.stringMatching(/locked and atomic/i),
          expect.stringMatching(/corrupt receipt state/i),
        ]),
      },
      secrets: expect.arrayContaining([expect.stringMatching(/never written to receipts/i)]),
      distribution: expect.arrayContaining([
        expect.stringMatching(/private.*not published to a package registry/i),
        expect.stringMatching(/repository-local/i),
      ]),
    });
  });
});
