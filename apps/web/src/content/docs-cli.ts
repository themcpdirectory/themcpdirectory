import { CLI_DOCUMENTATION } from "@themcpdirectory/cli/command-metadata";
import type { ReleaseDocument } from "@/content/document-model";

const PRIMARY_INVOCATION = "npx @themcpdirectory/cli@0.2.1";

const commandFacts = CLI_DOCUMENTATION.commands.flatMap((command) => [
  command.usage.replace("Usage: mcpdir", `Usage: ${PRIMARY_INVOCATION}`),
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
  return `${PRIMARY_INVOCATION} ${argumentsText}`;
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
        body: [
          "The primary one-shot command is: npx @themcpdirectory/cli@0.2.1 add github",
          "For repeated use, install the canonical package globally: npm install --global @themcpdirectory/cli",
          run("--help"),
        ],
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
        id: "source-resolution",
        heading: "Safe source resolution",
        body: [
          "add accepts a canonical slug or alias, an Official MCP Registry or package identifier, a validated GitHub owner/repository identifier, or a validated https://github.com/owner/repository URL.",
          "Resolution uses normalized Directory and validated repository metadata only. README text is never scraped or executed.",
        ],
      },
      {
        id: "manifest-integrity",
        heading: "Manifest integrity",
        body: [
          "Every install response includes a canonical SHA-256 manifest hash. The CLI verifies it before planning a change and stores it in the installation receipt.",
          "The API advertises a hash-addressed snapshot URL whose response is immutable for that manifest.",
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
        id: "telemetry",
        heading: "CLI telemetry",
        body: [
          "Privacy-minimal CLI telemetry is enabled by default and is best-effort. Reporting failures do not change command output or exit status.",
          "Set DO_NOT_TRACK=1 or MCPDIR_DISABLE_TELEMETRY=1 to disable telemetry before an event is constructed.",
          "The CLI sends the event, canonical slug when known, exact CLI version, supported target client when applicable, success, and package or remote variant when applicable. Storage retains CLI major/minor and adds the server receipt time.",
          "The event payload and stored event do not contain the search query, raw identifier, arguments, paths, configuration or project content, error text, secrets, IP address, user agent, cookie, request ID, or a persistent device, installation, or person identifier. Network infrastructure processes source addresses and HTTP metadata transiently to deliver requests and limit abuse; the telemetry route is excluded from application request logs.",
          "Raw events are retained for seven days and daily aggregates for thirteen months. Public display exposes anonymous, CLI-reported successful add totals and supported-client totals only. These are abuse-limited reports, not verified unique users or installations.",
        ],
      },
      {
        id: "badges",
        heading: "Install badges",
        body: ["Use https://api.themcpdirectory.org/b/<slug>.svg for a dynamic install badge."],
      },
      {
        id: "maintainers",
        heading: "Maintainer publishing",
        body: [
          run(
            'init --package @example/mcp-server --name io.github.example/mcp-server --description "An MCP server" --version 1.2.3',
          ),
          run("validate"),
          `MCP_REGISTRY_TOKEN=... ${run("publish")}`,
          "mcpdir.json validates to the Official MCP Registry ServerJSON schema. For a remote server, initialize with --remote and a public HTTPS URL instead of --package.",
          "publish validates locally, requires MCP_REGISTRY_TOKEN, and sends POST /v0/publish. MCP_REGISTRY_BASE_URL may override the Registry origin only with a public HTTPS URL without embedded credentials.",
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
          "Removing the CLI does not remove client configuration or receipt state. Remove managed servers first if they should no longer remain configured.",
        ],
      },
    ],
  };
}
