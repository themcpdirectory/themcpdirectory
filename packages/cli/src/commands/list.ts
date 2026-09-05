import type { InstalledMcpServer, McpClientAdapter } from "@themcpdirectory/client-adapters";
import type { ClientId, ClientScope } from "@themcpdirectory/install-engine";
import type { InstallationReceipt } from "../config/receipt-store.js";
import { getCliCommandMetadata } from "../command-metadata.js";
import type { CliDependencies } from "../dependencies.js";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";

export interface ListCommandEntry {
  readonly name: string;
  readonly slug?: string;
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly transport: "stdio" | "streamable-http" | "http";
  readonly managedBy: "mcpdir" | "external";
  readonly variantId?: string;
  readonly manifestHash?: string;
}

export async function runListCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult<readonly ListCommandEntry[]>> {
  const unsupported = argv.find((token) => token !== "--json");
  if (unsupported) {
    return createFailureResult("list", {
      exitCode: 2,
      code: "USAGE_ERROR",
      message: `list does not support argument ${unsupported}`,
      stderrLines: [getCliCommandMetadata("list")!.usage],
    }) as CommandResult<readonly ListCommandEntry[]>;
  }

  try {
    const [installed, receipts] = await Promise.all([
      inspectAdapters(deps.adapterRegistry.list()),
      deps.receiptStore.list(),
    ]);
    const entries = installed.map((entry) => mergeReceipt(entry, receipts)).sort(compareEntries);
    return createSuccessResult("list", entries);
  } catch (error) {
    return createFailureResult("list", {
      exitCode: 1,
      code: "COMMAND_FAILED",
      message: error instanceof Error ? error.message : "Failed to inspect installed servers",
    }) as CommandResult<readonly ListCommandEntry[]>;
  }
}

export async function inspectAdapters(
  adapters: readonly McpClientAdapter[],
): Promise<readonly InstalledMcpServer[]> {
  const installed: InstalledMcpServer[] = [];

  for (const adapter of adapters) {
    const detection = await adapter.detect();
    if (!detection.installed) {
      continue;
    }

    for (const scope of supportedScopes(detection.capabilities)) {
      installed.push(...(await adapter.inspect(scope)));
    }
  }

  return installed.sort(compareInstalled);
}

function supportedScopes(capabilityList: readonly string[]): readonly ClientScope[] {
  const capabilities = new Set(capabilityList);
  return (["user", "project", "global"] as const).filter((scope) =>
    capabilities.has(`native-scope-${scope}`),
  );
}

function mergeReceipt(
  entry: InstalledMcpServer,
  receipts: readonly InstallationReceipt[],
): ListCommandEntry {
  const receipt = entry.slug
    ? receipts.find(
        (candidate) =>
          candidate.slug === entry.slug &&
          candidate.client === entry.client &&
          candidate.scope === entry.scope,
      )
    : undefined;

  return {
    name: entry.name,
    ...(entry.slug ? { slug: entry.slug } : {}),
    client: entry.client,
    scope: entry.scope,
    transport: entry.transport,
    managedBy: receipt ? "mcpdir" : "external",
    ...(receipt ? { variantId: receipt.variantId, manifestHash: receipt.manifestHash } : {}),
  };
}

function compareInstalled(left: InstalledMcpServer, right: InstalledMcpServer): number {
  return compareEntries(left, right);
}

function compareEntries(
  left: Pick<ListCommandEntry, "client" | "scope" | "name" | "slug" | "transport">,
  right: Pick<ListCommandEntry, "client" | "scope" | "name" | "slug" | "transport">,
): number {
  return (
    compareText(left.client, right.client) ||
    compareText(left.scope, right.scope) ||
    compareText(left.name, right.name) ||
    compareText(left.slug ?? "", right.slug ?? "") ||
    compareText(left.transport, right.transport)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
