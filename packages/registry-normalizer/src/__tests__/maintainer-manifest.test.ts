import { describe, expect, it } from "vitest";
import {
  MCPDIR_MANIFEST_SCHEMA_URL,
  parseMcpdirManifest,
  toRegistryPublishArtifact,
} from "../index.js";

const packageManifest = {
  schemaVersion: 1,
  server: {
    $schema: MCPDIR_MANIFEST_SCHEMA_URL,
    name: "io.github.example/test-server",
    description: "A test MCP server",
    version: "1.2.3",
    packages: [
      {
        registryType: "npm",
        identifier: "@example/test-server",
        version: "1.2.3",
        transport: { type: "stdio" },
        environmentVariables: [
          {
            name: "TEST_API_KEY",
            description: "API key used by the server",
            isRequired: true,
            isSecret: true,
          },
        ],
      },
    ],
  },
} as const;

const remoteManifest = {
  schemaVersion: 1,
  server: {
    $schema: MCPDIR_MANIFEST_SCHEMA_URL,
    name: "io.github.example/remote-server",
    description: "A remotely hosted MCP server",
    version: "1.0.0",
    remotes: [
      {
        type: "streamable-http",
        url: "https://mcp.example.com/v1",
        variables: {
          TENANT_ID: {
            description: "Tenant identifier",
            isRequired: true,
          },
        },
      },
    ],
  },
} as const;

describe("mcpdir.json maintainer manifest", () => {
  it("accepts a strict package manifest and maps it to the Official Registry server artifact", () => {
    const parsed = parseMcpdirManifest(packageManifest);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected package manifest to be valid");
    expect(toRegistryPublishArtifact(parsed.data)).toEqual(packageManifest.server);
  });

  it("accepts a strict HTTPS remote manifest", () => {
    const parsed = parseMcpdirManifest(remoteManifest);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected remote manifest to be valid");
    expect(toRegistryPublishArtifact(parsed.data)).toEqual(remoteManifest.server);
  });

  it("accepts Official Registry package HTTP transport metadata", () => {
    const parsed = parseMcpdirManifest({
      ...packageManifest,
      server: {
        ...packageManifest.server,
        packages: [
          {
            ...packageManifest.server.packages[0],
            transport: {
              type: "streamable-http",
              url: "https://mcp.example.com/{TENANT_ID}",
            },
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts declarative remote header templates without embedded secrets", () => {
    const parsed = parseMcpdirManifest({
      ...remoteManifest,
      server: {
        ...remoteManifest.server,
        remotes: [
          {
            ...remoteManifest.server.remotes[0],
            headers: [
              {
                name: "Authorization",
                value: "Bearer {ACCESS_TOKEN}",
                variables: {
                  ACCESS_TOKEN: {
                    description: "Registry access token",
                    isRequired: true,
                    isSecret: true,
                  },
                },
              },
            ],
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
  });

  it.each([
    ["root unknown field", { ...packageManifest, unexpected: true }, "unexpected"],
    [
      "server command field",
      { ...packageManifest, server: { ...packageManifest.server, command: "node server.js" } },
      "server.command",
    ],
    [
      "embedded environment value",
      {
        ...packageManifest,
        server: {
          ...packageManifest.server,
          packages: [
            {
              ...packageManifest.server.packages[0],
              environmentVariables: [{ name: "TOKEN", isSecret: true, value: "secret" }],
            },
          ],
        },
      },
      "server.packages.0.environmentVariables.0.value",
    ],
    [
      "floating package version",
      {
        ...packageManifest,
        server: {
          ...packageManifest.server,
          packages: [{ ...packageManifest.server.packages[0], version: "^1.2.3" }],
        },
      },
      "server.packages.0.version",
    ],
    [
      "package tag",
      {
        ...packageManifest,
        server: {
          ...packageManifest.server,
          packages: [{ ...packageManifest.server.packages[0], version: "latest" }],
        },
      },
      "server.packages.0.version",
    ],
    [
      "unsupported package transport",
      {
        ...packageManifest,
        server: {
          ...packageManifest.server,
          packages: [{ ...packageManifest.server.packages[0], transport: { type: "websocket" } }],
        },
      },
      "server.packages.0.transport.type",
    ],
    [
      "non-HTTPS remote",
      {
        ...remoteManifest,
        server: {
          ...remoteManifest.server,
          remotes: [{ ...remoteManifest.server.remotes[0], url: "http://mcp.example.com" }],
        },
      },
      "server.remotes.0.url",
    ],
    [
      "private remote host",
      {
        ...remoteManifest,
        server: {
          ...remoteManifest.server,
          remotes: [{ ...remoteManifest.server.remotes[0], url: "https://127.0.0.1/mcp" }],
        },
      },
      "server.remotes.0.url",
    ],
    [
      "private IPv6 remote host",
      {
        ...remoteManifest,
        server: {
          ...remoteManifest.server,
          remotes: [{ ...remoteManifest.server.remotes[0], url: "https://[fd00::1]/mcp" }],
        },
      },
      "server.remotes.0.url",
    ],
    [
      "unsupported remote transport",
      {
        ...remoteManifest,
        server: {
          ...remoteManifest.server,
          remotes: [{ ...remoteManifest.server.remotes[0], type: "websocket" }],
        },
      },
      "server.remotes.0.type",
    ],
    [
      "malformed environment name",
      {
        ...packageManifest,
        server: {
          ...packageManifest.server,
          packages: [
            {
              ...packageManifest.server.packages[0],
              environmentVariables: [{ name: "api-key", isSecret: true }],
            },
          ],
        },
      },
      "server.packages.0.environmentVariables.0.name",
    ],
  ])("rejects %s with a field-specific issue", (_name, input, expectedPath) => {
    const parsed = parseMcpdirManifest(input);

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected manifest to be invalid");
    expect(parsed.issues.map((issue) => issue.path)).toContain(expectedPath);
  });

  it("requires at least one package or remote declaration", () => {
    const parsed = parseMcpdirManifest({
      schemaVersion: 1,
      server: {
        $schema: MCPDIR_MANIFEST_SCHEMA_URL,
        name: "io.github.example/empty",
        description: "Missing publication target",
        version: "1.0.0",
      },
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected manifest to be invalid");
    expect(parsed.issues).toContainEqual({
      path: "server",
      message: "Declare at least one package or remote server.",
    });
  });
});
