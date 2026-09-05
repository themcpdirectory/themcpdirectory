import { SUPPORTED_CLIENTS } from "@themcpdirectory/client-adapters";

export const CLI_EXECUTABLE_NAME = "mcpdir";
export const CLI_REPOSITORY_INVOCATION = "node packages/cli/dist/index.js";

export interface CliOptionMetadata {
  readonly syntax: string;
  readonly description: string;
}

export interface CliCommandMetadata {
  readonly name: string;
  readonly aliases: readonly string[];
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
  aliases: readonly string[] = [],
): CliCommandMetadata {
  return Object.freeze({
    name,
    aliases: Object.freeze(aliases),
    synopsis,
    summary,
    usage: `Usage: ${CLI_EXECUTABLE_NAME} ${usageSynopsis}`,
    options: Object.freeze(options),
  });
}

const JSON_OPTION = {
  syntax: "--json",
  description: "Write a versioned JSON envelope to standard output.",
} as const;

export const CLI_COMMANDS = Object.freeze([
  command("help", "help", "Show this help", [], "help", ["--help", "-h"]),
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
  SUPPORTED_CLIENTS.map(({ id, name, scopeSupport }) =>
    Object.freeze({
      id,
      name,
      scopeSupport:
        scopeSupport.mode === "runtime-probed"
          ? Object.freeze({ mode: "runtime-probed" as const })
          : Object.freeze({
              mode: "static" as const,
              scopes: Object.freeze([...scopeSupport.scopes]),
            }),
    }),
  ),
);

export const CLI_DOCUMENTATION = Object.freeze({
  invocation: CLI_REPOSITORY_INVOCATION,
  commands: CLI_COMMANDS,
  clients: CLI_SUPPORTED_CLIENTS,
  install: Object.freeze([
    "Run from the repository root with Node.js 24 and pnpm 11.",
    "Install workspace dependencies: pnpm install",
    "Build the repository-local executable: pnpm --filter @themcpdirectory/cli build",
  ] as const),
  distribution: Object.freeze([
    "The @themcpdirectory/cli package is private and is not published to a package registry.",
    `Invoke the repository-local executable with: ${CLI_REPOSITORY_INVOCATION}`,
  ] as const),
  receipts: Object.freeze({
    fields:
      "Receipts store non-secret install state: server slug, client, scope, exact server version, variant, manifest hash, install time, and adapter fingerprint.",
    guarantees: Object.freeze([
      "Receipt writes are locked and atomic; receipt reads are also locked.",
      "Backups preserve corrupt receipt state before it is reset; ordinary receipt replacements do not create backups.",
      "Set MCPDIR_STATE_DIR to override the platform-specific state directory.",
    ] as const),
  }),
  secrets: Object.freeze([
    "Secrets are never written to receipts.",
    "When a client supports environment references, the CLI records the environment variable name rather than its value.",
    "A sensitive value is persisted only when the client advertises persisted-secret support and the user explicitly approves it interactively.",
    "Non-interactive installation fails when required secure input is unavailable.",
  ] as const),
  safety: Object.freeze([
    "Install plans are validated and reviewed before mutation.",
    "Unsupported clients and ambiguous servers fail clearly.",
    "Dry runs validate and preview plans without mutating client configuration or receipts.",
  ] as const),
  exitCodes: Object.freeze([
    Object.freeze({
      code: 0,
      meaning:
        "The command completed successfully, including a valid dry run or an update with nothing to change.",
    }),
    Object.freeze({
      code: 1,
      meaning: "Operational failure, failed doctor check, cancellation, or unknown command.",
    }),
    Object.freeze({
      code: 2,
      meaning: "Invalid command usage, including unsupported options or missing arguments.",
    }),
  ]),
  uninstall: Object.freeze([
    "Remove managed servers with the repository-local remove command before deleting the checkout if they should no longer remain configured.",
    "Delete packages/cli/dist to remove the built repository-local executable, or delete the repository checkout after removing any managed servers you no longer want configured.",
    "Deleting the executable does not remove client configuration or receipt state.",
  ] as const),
});

export function getCliCommandMetadata(name: string): CliCommandMetadata | undefined {
  return CLI_COMMANDS.find(
    (candidate) => candidate.name === name || candidate.aliases.includes(name),
  );
}

export function renderCliHelp(): string {
  const commandLines = CLI_COMMANDS.map(
    ({ synopsis, summary }) => `  ${synopsis.padEnd(36)} ${summary}`,
  );
  return [
    `Usage: ${CLI_EXECUTABLE_NAME} <command> [options]`,
    "",
    "Commands:",
    ...commandLines,
  ].join("\n");
}
