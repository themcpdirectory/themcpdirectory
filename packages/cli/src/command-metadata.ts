import { SUPPORTED_CLIENTS } from "@themcpdirectory/client-adapters";

export interface CliOptionMetadata {
  readonly syntax: string;
  readonly description: string;
}

export interface CliCommandMetadata {
  readonly name: string;
  readonly synopsis: string;
  readonly summary: string;
  readonly usage: string;
  readonly options: readonly CliOptionMetadata[];
}

function command(
  name: string,
  synopsis: string,
  summary: string,
  options: readonly CliOptionMetadata[],
  usageSynopsis = synopsis,
): CliCommandMetadata {
  return Object.freeze({
    name,
    synopsis,
    summary,
    usage: `Usage: mcpdir ${usageSynopsis}`,
    options: Object.freeze(options),
  });
}

const JSON_OPTION = {
  syntax: "--json",
  description: "Write a versioned JSON envelope to standard output.",
} as const;

export const CLI_COMMANDS = Object.freeze([
  command("doctor", "doctor [--json]", "Diagnose Directory and client health", [JSON_OPTION]),
  command(
    "search",
    "search <query> [--client <id>] [--category <slug>] [--cursor <value>] [--limit <n>] [--sort <recent|name|relevance>] [--json]",
    "Search directory listings",
    [
      { syntax: "--client <id>", description: "Filter by a supported client identifier." },
      { syntax: "--category <slug>", description: "Filter by category slug." },
      { syntax: "--cursor <value>", description: "Continue from an opaque result cursor." },
      { syntax: "--limit <n>", description: "Request a positive integer result limit." },
      {
        syntax: "--sort <recent|name|relevance>",
        description: "Choose the result order.",
      },
      JSON_OPTION,
    ],
  ),
  command("info", "info <slug> [--json]", "Show directory details for one server", [JSON_OPTION]),
  command(
    "add",
    "add <slug-or-alias> [options]",
    "Install an MCP server",
    [
      {
        syntax: "--to <client[,client]|all>",
        description: "Target one or more supported clients, or every detected client.",
      },
      {
        syntax: "--scope <user|project|global>",
        description: "Request a client configuration scope; the default is user.",
      },
      { syntax: "--variant <id>", description: "Select one install-manifest variant." },
      { syntax: "--yes, -y", description: "Approve the reviewed plan without prompting." },
      { syntax: "--dry-run", description: "Preview the validated plan without mutating files." },
      JSON_OPTION,
    ],
    "add <slug-or-alias> [--to <client[,client]|all>] [--scope <user|project|global>] [--variant <id>] [--yes] [--dry-run] [--json]",
  ),
  command("list", "list [--json]", "List installed MCP servers", [JSON_OPTION]),
  command(
    "remove",
    "remove <slug> [options]",
    "Remove an installed MCP server",
    [
      { syntax: "--to <client>", description: "Limit removal to one supported client." },
      {
        syntax: "--scope <user|project|global>",
        description: "Limit removal to one client configuration scope.",
      },
      { syntax: "--yes", description: "Approve the reviewed removal plan without prompting." },
      { syntax: "--dry-run", description: "Preview the validated plan without mutating files." },
      JSON_OPTION,
    ],
    "remove <slug> [--to <client>] [--scope <user|project|global>] [--yes] [--dry-run] [--json]",
  ),
  command(
    "update",
    "update [server] [options]",
    "Update Directory-managed installations",
    [
      {
        syntax: "--to <client>",
        description: "Limit updates to a client; repeat the option for multiple clients.",
      },
      { syntax: "--yes", description: "Approve the reviewed update plans without prompting." },
      {
        syntax: "--dry-run",
        description: "Preview version and manifest changes without mutation.",
      },
      JSON_OPTION,
    ],
    "update [server] [--to <client>] [--yes] [--dry-run] [--json]",
  ),
] as const);

export const CLI_SUPPORTED_CLIENTS = Object.freeze(
  SUPPORTED_CLIENTS.map(({ id, name }) => Object.freeze({ id, name })),
);

export function getCliCommandMetadata(name: string): CliCommandMetadata | undefined {
  return CLI_COMMANDS.find((candidate) => candidate.name === name);
}

export function renderCliHelp(): string {
  const commandLines = CLI_COMMANDS.map(
    ({ synopsis, summary }) => `  ${synopsis.padEnd(36)} ${summary}`,
  );
  return [
    "Usage: mcpdir <command> [options]",
    "",
    "Commands:",
    "  help".padEnd(38) + " Show this help",
    ...commandLines,
  ].join("\n");
}
