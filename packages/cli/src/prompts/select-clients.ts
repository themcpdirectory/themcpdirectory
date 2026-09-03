import { getSupportedClientById, type AdapterRegistry } from "@themcpdirectory/client-adapters";
import type { ClientId, ClientScope } from "@themcpdirectory/install-engine";
import type { PromptIO } from "../dependencies.js";
import { AddPlanningPromptError, type SelectedAddTarget } from "./types.js";

const ALL_DETECTED_CLIENTS_OPTION = "All detected clients";

export async function selectTargetClients(
  options: {
    readonly targetClients?: readonly ClientId[] | "all";
    readonly requestedScope?: ClientScope;
  },
  deps: {
    readonly adapterRegistry: AdapterRegistry;
    readonly promptIO: PromptIO;
  },
): Promise<readonly SelectedAddTarget[]> {
  const scope = options.requestedScope ?? "user";

  if (Array.isArray(options.targetClients)) {
    return await selectExplicitTargets(options.targetClients, scope, deps.adapterRegistry);
  }

  const detections = await deps.adapterRegistry.detectAll();
  const installedTargets = detections
    .filter((detection) => detection.installed)
    .map((detection) => ({ client: detection.id, scope, detection }));

  if (options.targetClients === "all") {
    if (installedTargets.length === 0) {
      throw new AddPlanningPromptError(
        "CLIENT_UNAVAILABLE",
        "No supported MCP clients were detected.",
      );
    }

    return installedTargets;
  }

  if (installedTargets.length === 0) {
    throw new AddPlanningPromptError(
      "CLIENT_UNAVAILABLE",
      "No supported MCP clients were detected.",
    );
  }

  if (installedTargets.length === 1) {
    return installedTargets;
  }

  if (!deps.promptIO.isInteractive) {
    throw new AddPlanningPromptError(
      "REQUIRED_INPUT",
      "Multiple MCP clients are available. Re-run with --to <client> or --to all.",
    );
  }

  const labelToTarget = new Map<string, SelectedAddTarget>();
  const labels = installedTargets.map((target) => {
    const label = getClientDisplayName(target.client);
    labelToTarget.set(label, target);
    return label;
  });
  const selected = await deps.promptIO.select(
    "Install to which client?",
    [...labels, ALL_DETECTED_CLIENTS_OPTION],
  );

  if (selected === ALL_DETECTED_CLIENTS_OPTION) {
    return installedTargets;
  }

  const resolved = labelToTarget.get(selected);
  if (!resolved) {
    throw new AddPlanningPromptError(
      "REQUIRED_INPUT",
      "A supported MCP client must be selected.",
    );
  }

  return [resolved];
}

async function selectExplicitTargets(
  targetClients: readonly ClientId[],
  scope: ClientScope,
  adapterRegistry: AdapterRegistry,
): Promise<readonly SelectedAddTarget[]> {
  const selectedTargets: SelectedAddTarget[] = [];
  const seen = new Set<ClientId>();

  for (const client of targetClients) {
    if (seen.has(client)) {
      continue;
    }

    seen.add(client);
    const adapter = adapterRegistry.get(client);
    const detection = await adapter.detect();
    if (!detection.installed) {
      throw new AddPlanningPromptError(
        "CLIENT_UNAVAILABLE",
        `${getClientDisplayName(client)} is not installed.`,
      );
    }

    selectedTargets.push({ client, scope, detection });
  }

  return selectedTargets;
}

function getClientDisplayName(client: ClientId): string {
  return getSupportedClientById(client)?.name ?? client;
}