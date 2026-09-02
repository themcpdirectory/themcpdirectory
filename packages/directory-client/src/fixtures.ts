export const resolveServerResponseFixture = {
  data: {
    id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
    slug: "github-server",
    title: "GitHub Server",
    version: "1.2.3",
    canonicalUrl: "https://themcpdirectory.test/github-server",
    matchedBy: "alias",
    matchedValue: "github/server",
    needsRedirect: true,
  },
  meta: { requestId: "req_directory_client_001" },
} as const;

export const serverDetailResponseFixture = {
  data: {
    id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
    slug: "github-server",
    title: "GitHub Server",
    shortDescription: "Access GitHub repositories.",
    longDescription: null,
    listingStatus: "active",
    aliases: ["github/server"],
    publisher: {
      slug: "github",
      name: "GitHub",
      verified: true,
    },
    repository: { url: "https://github.com/modelcontextprotocol/servers" },
    version: "1.2.3",
    categories: [{ slug: "developer-tools", name: "Developer Tools" }],
    packages: [],
    remotes: [],
    compatibility: {
      codex: "supported",
      "claude-code": "supported_with_configuration",
      cursor: "unknown",
    },
    trustProfile: {
      officialRegistry: true,
      publisherVerified: true,
      sourceAvailable: true,
      openSource: true,
      signals: [],
    },
    timestamps: {
      firstSeenAt: "2026-09-01T12:00:00Z",
      lastSeenAt: "2026-09-01T12:00:00Z",
      publishedAt: null,
      updatedAt: null,
    },
  },
  meta: { requestId: "req_directory_client_002" },
} as const;

export const searchServersResponseFixture = {
  data: [
    {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "github-server",
      title: "GitHub Server",
      description: "Access GitHub repositories.",
      publisher: { slug: "github", name: "GitHub", verified: true },
      version: "1.2.3",
      repository: { url: "https://github.com/modelcontextprotocol/servers" },
      listingStatus: "active",
      signals: {
        officialRegistry: true,
        publisherVerified: true,
        sourceAvailable: true,
        openSource: true,
      },
    },
  ],
  meta: { requestId: "req_directory_client_003", nextCursor: null },
} as const;

export const clientsResponseFixture = {
  data: [
    {
      id: "cursor",
      name: "Cursor",
      capabilities: {
        deeplink: true,
        stdio: true,
        streamableHttp: true,
        headers: true,
        environmentVariables: true,
        remoteVariables: true,
      },
      serverCount: 1,
    },
  ],
  meta: { requestId: "req_directory_client_004", nextCursor: null },
} as const;

export const resolveInstallResponseFixture = {
  data: {
    schemaVersion: 1,
    server: {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "github-server",
      title: "GitHub Server",
      version: "1.2.3",
    },
    provenance: {
      registry: "https://github.com/modelcontextprotocol/servers",
      registryName: "Model Context Protocol Registry",
      observedAt: "2026-09-01T12:00:00Z",
    },
    variants: [
      {
        id: "8f6c5ae7-c883-4c12-b4c1-f528d6a3c4e5",
        kind: "package",
        registryType: "npm",
        identifier: "@modelcontextprotocol/server-github",
        version: "1.2.3",
        runtimeHint: "npx",
        transport: "stdio",
        runtimeArguments: [
          {
            type: "named",
            name: "config",
            valueHint: "path",
            description: "Config file path.",
            required: true,
          },
        ],
        packageArguments: [
          {
            type: "positional",
            valueHint: "repository",
            description: "Repository slug.",
            required: false,
          },
        ],
        environmentVariables: [
          {
            name: "GITHUB_TOKEN",
            description: "GitHub access token.",
            required: true,
            defaultValue: null,
            valueSource: "environment",
          },
        ],
        integrity: {
          algorithm: "sha256",
          digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
    ],
    compatibility: {
      codex: "supported",
      "claude-code": "supported_with_configuration",
      cursor: "unknown",
    },
  },
  meta: { requestId: "req_directory_client_005" },
} as const;
