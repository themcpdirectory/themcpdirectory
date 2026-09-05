import {
  CLI_DOCUMENTATION,
  CLI_REPOSITORY_INVOCATION,
} from "@themcpdirectory/cli/command-metadata";
import type { ReleaseDocument } from "@/content/document-model";

const commandFacts = CLI_DOCUMENTATION.commands.flatMap((command) => [
  command.usage.replace("Usage: mcpdir", `Usage: ${CLI_REPOSITORY_INVOCATION}`),
  ...(command.aliases.length === 0 ? [] : [`Aliases: ${command.aliases.join(", ")}.`]),
  command.summary,
  ...(command.options.length === 0
    ? ["Options: none."]
    : command.options.map((option) => `${option.syntax}: ${option.description}`)),
]);

const supportedClientFacts = CLI_DOCUMENTATION.clients.map((client) =>
  client.scopeSupport.mode === "runtime-probed"
    ? `${client.name} (${client.id}): supported scopes are capability-probed from the installed CLI at runtime.`
    : `${client.name} (${client.id}): ${client.scopeSupport.scopes.join(", ")}.`,
);

function run(argumentsText: string): string {
  return `${CLI_REPOSITORY_INVOCATION} ${argumentsText}`;
}

export function getCliReferenceDocument(): ReleaseDocument {
  return {
    title: "CLI Reference",
    description:
      "Installation, discovery, configuration scopes, dry runs, receipts, secret references, troubleshooting, removal, and uninstall.",
    sections: [
      {
        id: "installation",
        heading: "Installation",
        body: [...CLI_DOCUMENTATION.distribution, ...CLI_DOCUMENTATION.install, run("--help")],
      },
      {
        id: "quick-start",
        heading: "Quick start",
        body: [
          run("search github-server"),
          run("info github-server"),
          run("add github-server"),
          run("add github-server --to codex"),
          run("add github-server --to claude-code"),
          run("add github-server --to cursor"),
          run("add github-server --to vscode"),
          run("list"),
          run("update github-server"),
          run("doctor"),
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
          `${run("help")}, ${run("--help")}, and ${run("-h")} print the command list.`,
          ...commandFacts,
        ],
      },
      {
        id: "scopes",
        heading: "Configuration scopes",
        body: [
          "Codex supports user scope only. Cursor and VS Code support user and project scopes; neither supports global scope.",
          "Claude Code scope support is capability-probed from the installed CLI at runtime.",
          "The default add scope is user. The selected client must prove support for the requested scope.",
          "Use --to with a supported client identifier. add accepts a comma-separated list or all; remove accepts one client; update accepts repeated --to options.",
        ],
      },
      {
        id: "dry-runs",
        heading: "Dry runs and confirmation",
        body: [
          run("add github-server --to codex --scope user --dry-run"),
          run("update github-server --to codex --dry-run"),
          run("remove github-server --to codex --scope user --dry-run"),
          CLI_DOCUMENTATION.safety[2],
          "Without --dry-run, mutating commands ask for confirmation unless --yes is provided.",
        ],
      },
      {
        id: "receipts",
        heading: "Receipts",
        body: [
          CLI_DOCUMENTATION.receipts.fields,
          CLI_DOCUMENTATION.secrets[0],
          ...CLI_DOCUMENTATION.receipts.guarantees,
        ],
      },
      {
        id: "secret-references",
        heading: "Secret references",
        body: CLI_DOCUMENTATION.secrets.slice(1),
      },
      {
        id: "safety",
        heading: "Safety",
        body: [
          ...CLI_DOCUMENTATION.safety.slice(0, 2),
          "Use --json for a versioned machine-readable envelope; terminal output is sanitized before display.",
        ],
      },
      {
        id: "exit-codes",
        heading: "Exit codes",
        body: CLI_DOCUMENTATION.exitCodes.map(
          ({ code, meaning }) =>
            `${code} means ${meaning.charAt(0).toLowerCase()}${meaning.slice(1)}`,
        ),
      },
      {
        id: "troubleshooting",
        heading: "Troubleshooting",
        body: [
          `Run ${run("doctor")} to inspect Directory access, detected clients, receipt state, installed entries, and manifest drift.`,
          `Run ${run("doctor --json")} for automation. A non-zero result includes an error code, message, and recovery guidance where available.`,
          "If a receipt reports drift, inspect the named client and scope before updating or removing the entry.",
          "If a required environment variable is missing, set it in the current environment and retry.",
        ],
      },
      {
        id: "removal-and-uninstall",
        heading: "Removal and uninstall",
        body: [
          `Preview a targeted removal: ${run("remove github-server --to codex --scope user --dry-run")}`,
          `Apply it after review: ${run("remove github-server --to codex --scope user")}`,
          "Removal verifies the client configuration change before deleting the matching receipt.",
          ...CLI_DOCUMENTATION.uninstall,
        ],
      },
    ],
  };
}
