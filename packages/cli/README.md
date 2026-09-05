# mcpdir CLI

The command-line client for The MCP Directory.

```sh
mcpdir --help
mcpdir search github --json
mcpdir info github-server --json
mcpdir add github-server --to cursor --dry-run --json
```

The CLI requires Node.js 24. It supports Codex, Claude Code, Cursor, and Visual Studio Code. Set `MCPDIR_STATE_DIR` to isolate receipt state and `MCPDIR_API_BASE_URL` to select a Directory API endpoint.

This package is currently private and is not published to a package registry.
