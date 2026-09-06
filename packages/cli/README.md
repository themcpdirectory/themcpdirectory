# mcpdir CLI

The command-line client for The MCP Directory.

```sh
npx @themcpdirectory/cli@0.2.1 add github
```

The one-shot `npx` command is the primary installation path. To install the canonical scoped package globally instead:

```sh
npm install --global @themcpdirectory/cli
mcpdir add github
```

The CLI requires Node.js 24 and supports Claude Code, Codex, Cursor, and Visual Studio Code.

## Commands

```sh
npx @themcpdirectory/cli@0.2.1 search github
npx @themcpdirectory/cli@0.2.1 info github
npx @themcpdirectory/cli@0.2.1 add github --to cursor
npx @themcpdirectory/cli@0.2.1 list
npx @themcpdirectory/cli@0.2.1 update github
npx @themcpdirectory/cli@0.2.1 doctor
npx @themcpdirectory/cli@0.2.1 remove github --to cursor
```

Use `--dry-run` to review a validated add, update, or remove plan without changing client configuration or receipts. Mutating commands ask for confirmation unless `--yes` is provided. Use `--json` for the versioned machine-readable envelope.

`add` accepts a canonical Directory slug or alias, an Official MCP Registry or package identifier, a validated GitHub `owner/repository` identifier, or a validated `https://github.com/owner/repository` URL. Resolution uses normalized Directory and validated repository metadata only. The CLI never scrapes a README for installation commands and never executes README content.

Each install response includes a canonical SHA-256 manifest hash. The CLI verifies that hash before planning a change and stores it in the installation receipt. The API advertises a hash-addressed snapshot URL whose response is immutable for that manifest.

## Maintainer workflow

Create and validate an `mcpdir.json` file that conforms to the Official MCP Registry ServerJSON schema, then publish its validated `server` object:

```sh
npx @themcpdirectory/cli@0.2.1 init \
	--package @example/mcp-server \
	--name io.github.example/mcp-server \
	--description "An MCP server" \
	--version 1.2.3
npx @themcpdirectory/cli@0.2.1 validate
MCP_REGISTRY_TOKEN=... npx @themcpdirectory/cli@0.2.1 publish
```

For a remote server, use `mcpdir init --remote https://mcp.example.com/v1` instead of `--package`. `publish` validates locally before network access, requires `MCP_REGISTRY_TOKEN`, and sends `POST /v0/publish` to the Official MCP Registry. `MCP_REGISTRY_BASE_URL` may override the Registry origin only with a public HTTPS URL that has no embedded credentials.

## Telemetry and configuration

Privacy-minimal CLI telemetry is enabled by default and is best-effort: reporting failures do not change command output or exit status. Set either `DO_NOT_TRACK=1` or `MCPDIR_DISABLE_TELEMETRY=1` for a hard opt-out before an event is constructed.

The CLI event payload contains the event, canonical server slug when known, exact CLI version, supported target client when applicable, success, and package or remote variant when applicable. The service retains only CLI major/minor in storage and adds the server receipt time. It does not persist the search query, raw identifier, command arguments, paths, configuration or project content, error text, secrets, IP address, user agent, cookie, request ID, or a persistent device, installation, or person identifier. Network infrastructure necessarily processes source addresses and HTTP metadata transiently to deliver requests and limit abuse; the telemetry route is excluded from application request logs.

Raw event retention is seven days; daily aggregate retention is thirteen months. Public server pages and badges expose anonymous, CLI-reported successful add totals and supported-client totals only, not success, CLI-version, or install-variant breakdowns. These counts are abuse-limited reports, not verified unique users or installations.

The CLI connects to `https://api.themcpdirectory.org/api/v1` by default. Set `MCPDIR_STATE_DIR` to isolate receipt state or `MCPDIR_API_BASE_URL` to select a different Directory API endpoint. Install badges use `https://api.themcpdirectory.org/b/<slug>.svg`.
