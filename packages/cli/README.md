# mcpdir CLI

The command-line client for The MCP Directory.

```sh
npm install --global @themcpdirectory/cli
```

```sh
mcpdir --help
mcpdir search github --json
mcpdir info github-server --json
mcpdir add github-server --to cursor --dry-run --json
```

The CLI requires Node.js 24. It supports Codex, Claude Code, Cursor, and Visual Studio Code. It connects to `https://api.themcpdirectory.org/api/v1` by default. Set `MCPDIR_STATE_DIR` to isolate receipt state or `MCPDIR_API_BASE_URL` to select a different Directory API endpoint.
