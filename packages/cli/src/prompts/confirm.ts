import { getSupportedClientById } from "@themcpdirectory/client-adapters";
import type { ConfirmationTargetSummary } from "./types.js";

export function buildAddConfirmationMessage(options: {
  readonly serverTitle: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly targets: readonly ConfirmationTargetSummary[];
}): string {
  const targetLabel = options.targets
    .map((target) => `${getClientDisplayName(target.client)} (${target.scope})`)
    .join(", ");
  const countLabel = `${options.targets.length} target${options.targets.length === 1 ? "" : "s"}`;

  if (options.dryRun) {
    return `Dry run: planned ${options.serverTitle} for ${countLabel}: ${targetLabel}.`;
  }

  if (options.yes) {
    return `Auto-confirmed ${options.serverTitle} for ${countLabel}: ${targetLabel}.`;
  }

  return `Ready to install ${options.serverTitle} for ${countLabel}: ${targetLabel}.`;
}

function getClientDisplayName(client: string): string {
  return getSupportedClientById(client)?.name ?? client;
}