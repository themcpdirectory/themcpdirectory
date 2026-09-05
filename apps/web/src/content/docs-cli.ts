import { CLI_COMMANDS, CLI_SUPPORTED_CLIENTS } from "@themcpdirectory/cli/command-metadata";
import type { ReleaseDocument } from "@/content/document-model";

const commandFacts = CLI_COMMANDS.flatMap((command) => [
  command.usage,
  command.summary,
  ...(command.options.length === 0
    ? ["Options: none."]
    : command.options.map((option) => `${option.syntax}: ${option.description}`)),
]);

const supportedClientFacts = CLI_SUPPORTED_CLIENTS.map((client) => `${client.name} (${client.id})`);

export function getCliReferenceDocument(): ReleaseDocument {
  return {
    title: "CLI Reference",
    description:
      "Installation, discovery, configuration scopes, dry runs, receipts, secret references, troubleshooting, removal, and uninstall.",
    sections: [
      {
        id: "installation",
        heading: "Installation",
        body: [
          "The @themcpdirectory/cli package is private and is not published to a package registry.",
          "Current use is repository-local and requires Node.js 24: pnpm install",
          "Build the executable: pnpm --filter @themcpdirectory/cli build",
          "Run it from the repository root: node packages/cli/dist/index.js --help",
        ],
      },
      {
        id: "quick-start",
        heading: "Quick start",
        body: [
          "mcpdir search github-server",
          "mcpdir info github-server",
          "mcpdir add github-server",
          "mcpdir add github-server --to codex",
          "mcpdir add github-server --to claude-code",
          "mcpdir add github-server --to cursor",
          "mcpdir add github-server --to vscode",
          "mcpdir list",
          "mcpdir update github-server",
          "mcpdir doctor",
        ],
      },
      {
        id: "supported-clients",
        heading: "Supported clients",
        body: supportedClientFacts,
      },
      {
        id: "commands-and-options",
        heading: "Commands and options",
        body: [
          "mcpdir help, mcpdir --help, and mcpdir -h print the command list.",
          ...commandFacts,
        ],
      },
      {
        id: "scopes",
        heading: "Configuration scopes",
        body: [
          "Use --scope user, --scope project, or --scope global when adding or removing a server.",
          "The default add scope is user. The selected client must support the requested scope.",
          "Use --to with a supported client identifier. add accepts a comma-separated list or all; remove accepts one client; update accepts repeated --to options.",
        ],
      },
      {
        id: "dry-runs",
        heading: "Dry runs and confirmation",
        body: [
          "mcpdir add github-server --to codex --scope user --dry-run",
          "mcpdir update github-server --to codex --dry-run",
          "mcpdir remove github-server --to codex --scope user --dry-run",
          "--dry-run validates and previews a plan without mutating client configuration or receipts.",
          "Without --dry-run, mutating commands ask for confirmation unless --yes is provided.",
        ],
      },
      {
        id: "receipts",
        heading: "Receipts",
        body: [
          "Receipts store non-secret install state: server slug, client, scope, exact server version, variant, manifest hash, install time, and adapter fingerprint.",
          "Secrets are never written to receipts.",
          "Receipt writes are locked and atomic, and replaced state is backed up before mutation.",
          "Set MCPDIR_STATE_DIR to override the platform-specific state directory.",
        ],
      },
      {
        id: "secret-references",
        heading: "Secret references",
        body: [
          "When a client supports environment references, the CLI records the environment variable name rather than its value.",
          "A sensitive value is persisted in client configuration only when that client supports persisted secrets and the user explicitly approves it.",
          "Non-interactive installation fails when required secure input is unavailable.",
        ],
      },
      {
        id: "safety",
        heading: "Safety",
        body: [
          "Install plans are validated and reviewed before mutation.",
          "Unsupported clients and ambiguous servers fail clearly.",
          "Use --json for a versioned machine-readable envelope; terminal output is sanitized before display.",
        ],
      },
      {
        id: "exit-codes",
        heading: "Exit codes",
        body: [
          "0 means the command completed successfully, including a valid dry run or an update with nothing to change.",
          "1 means an operational failure, a failed doctor check, or an unknown command.",
          "2 means invalid command usage, such as unsupported options or missing required arguments.",
        ],
      },
      {
        id: "troubleshooting",
        heading: "Troubleshooting",
        body: [
          "Run mcpdir doctor to inspect Directory access, detected clients, receipt state, installed entries, and manifest drift.",
          "Run mcpdir doctor --json for automation. A non-zero result includes an error code, message, and recovery guidance where available.",
          "If a receipt reports drift, inspect the named client and scope before updating or removing the entry.",
          "If a required environment variable is missing, set it in the current environment and retry.",
        ],
      },
      {
        id: "removal-and-uninstall",
        heading: "Removal and uninstall",
        body: [
          "Preview a targeted removal: mcpdir remove github-server --to codex --scope user --dry-run",
          "Apply it after review: mcpdir remove github-server --to codex --scope user",
          "Removal verifies the client configuration change before deleting the matching receipt.",
          "To uninstall the repository-local CLI, remove the built packages/cli/dist output or delete the repository checkout after removing any managed servers you no longer want configured.",
        ],
      },
    ],
  };
}
