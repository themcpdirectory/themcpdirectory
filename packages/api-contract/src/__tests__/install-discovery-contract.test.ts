import { describe, expect, it } from "vitest";
import {
  UnsupportedManifestVersionError,
  categoriesCollectionResponseSchema,
  categoryDetailResponseSchema,
  clientDetailResponseSchema,
  clientsCollectionResponseSchema,
  installManifestQuerySchema,
  installManifestResponseSchema,
  parseInstallManifestResponse,
  publisherDetailResponseSchema,
} from "../index.js";

const serverSummaryExample = {
  id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
  slug: "github",
  title: "GitHub",
  description: "Access GitHub repositories.",
  publisher: {
    slug: "github",
    name: "GitHub",
    verified: true,
  },
  version: "1.2.3",
  repository: { url: "https://github.com/modelcontextprotocol/servers" },
  listingStatus: "active",
  signals: {
    officialRegistry: true,
    publisherVerified: true,
    sourceAvailable: true,
    openSource: true,
  },
};

const installManifestResponseExample = {
  data: {
    schemaVersion: 1,
    server: {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "github",
      title: "GitHub",
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
      {
        id: "37c5eb45-5cb9-4f4a-85da-a51bd25d8cf1",
        kind: "remote",
        transport: "streamable-http",
        urlTemplate: "https://api.example.com/mcp/{workspaceId}",
        headers: [{ name: "Authorization", value: "Bearer {token}" }],
        variables: [
          {
            name: "workspaceId",
            description: "Workspace identifier.",
            required: true,
            defaultValue: null,
          },
        ],
      },
    ],
    compatibility: {
      "claude-code": "supported",
      codex: "supported_with_configuration",
      cursor: "unknown",
    },
  },
  meta: { requestId: "req_phase_d_021" },
};

describe("installManifestQuerySchema", () => {
  it("accepts only approved client identifiers", () => {
    expect(installManifestQuerySchema.parse({ client: "cursor" })).toEqual({
      client: "cursor",
    });

    expect(() => installManifestQuerySchema.parse({ client: "vscode" })).toThrow();
  });
});

describe("installManifestResponseSchema", () => {
  it("keeps install manifests declarative and strict on server surfaces", () => {
    expect(installManifestResponseSchema.parse(installManifestResponseExample)).toEqual(
      installManifestResponseExample,
    );

    for (const unsafeField of ["command", "script", "expression", "hook", "postinstall"] as const) {
      expect(() =>
        installManifestResponseSchema.parse({
          ...installManifestResponseExample,
          data: {
            ...installManifestResponseExample.data,
            variants: [
              {
                ...installManifestResponseExample.data.variants[0],
                [unsafeField]: "unsafe",
              },
            ],
          },
        }),
      ).toThrow(/unrecognized key/i);
    }
  });

  it("rejects unsupported package registry metadata and command-like runtime hints", () => {
    const sourcePackageVariant = installManifestResponseExample.data.variants[0];
    if (!sourcePackageVariant || sourcePackageVariant.kind !== "package") {
      throw new Error("Expected a package variant in the install manifest example");
    }

    expect(() =>
      installManifestResponseSchema.parse({
        ...installManifestResponseExample,
        data: {
          ...installManifestResponseExample.data,
          variants: [{ ...sourcePackageVariant, registryType: "rubygems" }],
        },
      }),
    ).toThrow();

    expect(() =>
      installManifestResponseSchema.parse({
        ...installManifestResponseExample,
        data: {
          ...installManifestResponseExample.data,
          variants: [{ ...sourcePackageVariant, version: "latest" }],
        },
      }),
    ).toThrow();

    expect(() =>
      installManifestResponseSchema.parse({
        ...installManifestResponseExample,
        data: {
          ...installManifestResponseExample.data,
          variants: [{ ...sourcePackageVariant, version: "^1.2.3" }],
        },
      }),
    ).toThrow();

    expect(() =>
      installManifestResponseSchema.parse({
        ...installManifestResponseExample,
        data: {
          ...installManifestResponseExample.data,
          variants: [{ ...sourcePackageVariant, runtimeHint: "npx --yes" }],
        },
      }),
    ).toThrow();

    expect(() =>
      installManifestResponseSchema.parse({
        ...installManifestResponseExample,
        data: {
          ...installManifestResponseExample.data,
          variants: [{ ...sourcePackageVariant, transport: "streamable-http" }],
        },
      }),
    ).toThrow();

    expect(
      installManifestResponseSchema.parse({
        ...installManifestResponseExample,
        data: {
          ...installManifestResponseExample.data,
          variants: [{ ...sourcePackageVariant, runtimeHint: null }],
        },
      }),
    ).toEqual({
      ...installManifestResponseExample,
      data: {
        ...installManifestResponseExample.data,
        variants: [{ ...sourcePackageVariant, runtimeHint: null }],
      },
    });
  });
});

describe("parseInstallManifestResponse", () => {
  it("fails fast on unsupported schema versions", () => {
    expect(() =>
      parseInstallManifestResponse({
        data: { schemaVersion: 2, server: { slug: "github" } },
        meta: { requestId: "req_phase_d_020" },
      }),
    ).toThrow(UnsupportedManifestVersionError);
  });

  it.each([
    ["runtimeArguments", "name", 123],
    ["runtimeArguments", "valueHint", 123],
    ["runtimeArguments", "description", true],
    ["runtimeArguments", "required", "yes"],
    ["packageArguments", "name", 123],
    ["packageArguments", "valueHint", 123],
    ["packageArguments", "description", true],
    ["packageArguments", "required", "yes"],
  ] as const)(
    "rejects malformed known %s.%s fields while remaining additive for unknown keys",
    (argumentCollection, field, invalidValue) => {
      const sourcePackageVariant = installManifestResponseExample.data.variants[0];
      if (!sourcePackageVariant || sourcePackageVariant.kind !== "package") {
        throw new Error("Expected a package variant in the install manifest example");
      }

      const sourceArguments = sourcePackageVariant[argumentCollection] ?? [];
      const sourceArgument = sourceArguments[0];
      if (!sourceArgument) {
        throw new Error(`Expected ${argumentCollection} in the install manifest example`);
      }

      expect(() =>
        parseInstallManifestResponse({
          ...installManifestResponseExample,
          data: {
            ...installManifestResponseExample.data,
            variants: [
              {
                ...sourcePackageVariant,
                [argumentCollection]: [
                  {
                    ...sourceArgument,
                    [field]: invalidValue,
                    futureArgumentField: "preserved",
                  },
                ],
              },
              installManifestResponseExample.data.variants[1],
            ],
          },
        }),
      ).toThrow();
    },
  );

  it("keeps additive client fields while validating known install fields", () => {
    const sourcePackageVariant = installManifestResponseExample.data.variants[0];
    if (!sourcePackageVariant || sourcePackageVariant.kind !== "package") {
      throw new Error("Expected a package variant in the install manifest example");
    }

    const sourceRuntimeArguments = sourcePackageVariant.runtimeArguments;
    if (!sourceRuntimeArguments) {
      throw new Error("Expected runtime arguments in the install manifest example");
    }

    const sourceRuntimeArgument = sourceRuntimeArguments[0];
    if (!sourceRuntimeArgument) {
      throw new Error("Expected a runtime argument in the install manifest example");
    }

    const parsed = parseInstallManifestResponse({
      ...installManifestResponseExample,
      data: {
        ...installManifestResponseExample.data,
        futureTopLevelField: "preserved",
        variants: [
          {
            ...sourcePackageVariant,
            futureVariantField: { safe: true },
            runtimeArguments: [
              {
                ...sourceRuntimeArgument,
                futureArgumentField: "preserved",
              },
            ],
          },
          installManifestResponseExample.data.variants[1],
        ],
      },
    });

    expect((parsed.data as Record<string, unknown>).futureTopLevelField).toBe("preserved");

    const packageVariant = parsed.data.variants.find((variant) => variant.kind === "package");
    if (!packageVariant) {
      throw new Error("Expected a package variant in the additive-field test");
    }

    expect((packageVariant as Record<string, unknown>).futureVariantField).toEqual({
      safe: true,
    });

    const packageRuntimeArgument = packageVariant.runtimeArguments[0];
    if (!packageRuntimeArgument) {
      throw new Error("Expected a runtime argument in the additive-field test");
    }

    expect(
      (packageRuntimeArgument as Record<string, unknown>).futureArgumentField,
    ).toBe("preserved");
  });
});

describe("discovery response schemas", () => {
  it("validate the approved category, publisher, and client shapes", () => {
    expect(
      categoriesCollectionResponseSchema.parse({
        data: [
          {
            slug: "developer-tools",
            name: "Developer Tools",
            description: "Build and debugging tools.",
            serverCount: 12,
          },
        ],
        meta: { requestId: "req_phase_d_022", nextCursor: null },
      }),
    ).toEqual({
      data: [
        {
          slug: "developer-tools",
          name: "Developer Tools",
          description: "Build and debugging tools.",
          serverCount: 12,
        },
      ],
      meta: { requestId: "req_phase_d_022", nextCursor: null },
    });

    expect(
      categoryDetailResponseSchema.parse({
        data: {
          category: {
            slug: "developer-tools",
            name: "Developer Tools",
            description: "Build and debugging tools.",
          },
          servers: [serverSummaryExample],
          nextCursor: null,
        },
        meta: { requestId: "req_phase_d_023" },
      }),
    ).toEqual({
      data: {
        category: {
          slug: "developer-tools",
          name: "Developer Tools",
          description: "Build and debugging tools.",
        },
        servers: [serverSummaryExample],
        nextCursor: null,
      },
      meta: { requestId: "req_phase_d_023" },
    });

    expect(
      publisherDetailResponseSchema.parse({
        data: {
          publisher: {
            slug: "github",
            name: "GitHub",
            verified: true,
            websiteUrl: "https://github.com",
          },
          servers: [serverSummaryExample],
          nextCursor: null,
        },
        meta: { requestId: "req_phase_d_024" },
      }),
    ).toEqual({
      data: {
        publisher: {
          slug: "github",
          name: "GitHub",
          verified: true,
          websiteUrl: "https://github.com",
        },
        servers: [serverSummaryExample],
        nextCursor: null,
      },
      meta: { requestId: "req_phase_d_024" },
    });

    expect(
      clientsCollectionResponseSchema.parse({
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
            serverCount: 12,
          },
        ],
        meta: { requestId: "req_phase_d_025", nextCursor: null },
      }),
    ).toEqual({
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
          serverCount: 12,
        },
      ],
      meta: { requestId: "req_phase_d_025", nextCursor: null },
    });

    expect(
      clientDetailResponseSchema.parse({
        data: {
          client: {
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
          },
          servers: [serverSummaryExample],
          nextCursor: null,
        },
        meta: { requestId: "req_phase_d_026" },
      }),
    ).toEqual({
      data: {
        client: {
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
        },
        servers: [serverSummaryExample],
        nextCursor: null,
      },
      meta: { requestId: "req_phase_d_026" },
    });
  });

  it("rejects publisher fields beyond the approved contract", () => {
    expect(() =>
      publisherDetailResponseSchema.parse({
        data: {
          publisher: {
            slug: "github",
            name: "GitHub",
            verified: true,
            websiteUrl: "https://github.com",
            description: "Not part of the Phase D publisher contract.",
          },
          servers: [serverSummaryExample],
          nextCursor: null,
        },
        meta: { requestId: "req_phase_d_027" },
      }),
    ).toThrow(/unrecognized key/i);
  });
});