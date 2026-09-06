# mcpdir

The short npm entry point for [The MCP Directory](https://themcpdirectory.org) CLI.

```sh
npx @themcpdirectory/cli@0.2.1 add github
```

The shorter `npx mcpdir add github` command is pending npm approval of the unscoped package name. Once approved, this wrapper delegates to the canonical [`@themcpdirectory/cli`](https://www.npmjs.com/package/@themcpdirectory/cli) implementation at the same exact version.

For repeated use, the canonical package can be installed globally:

```sh
npm install --global @themcpdirectory/cli
mcpdir add github
```
