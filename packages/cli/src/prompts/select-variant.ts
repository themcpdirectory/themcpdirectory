import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { selectInstallVariant, type ClientId, UnsupportedVariantError } from "@themcpdirectory/install-engine";
import type { PromptIO } from "../dependencies.js";
import { AddPlanningPromptError } from "./types.js";

export async function selectVariantForClient(
  options: {
    readonly manifest: InstallManifestV1;
    readonly client: ClientId;
    readonly requestedVariantId?: string;
  },
  promptIO: PromptIO,
): Promise<InstallManifestV1["variants"][number]> {
  if (options.requestedVariantId !== undefined) {
    return selectInstallVariant(options.manifest, options.client, options.requestedVariantId);
  }

  const supportedVariants = options.manifest.variants.filter((variant) =>
    isSupportedVariant(options.manifest, options.client, variant.id),
  );

  if (supportedVariants.length === 0) {
    return selectInstallVariant(options.manifest, options.client);
  }

  if (supportedVariants.length === 1) {
    return supportedVariants[0]!;
  }

  if (!promptIO.isInteractive) {
    throw new AddPlanningPromptError(
      "REQUIRED_INPUT",
      `Multiple install variants are available for ${options.client}. Re-run with an explicit variant selection in interactive mode.`,
    );
  }

  const labels = supportedVariants.map((variant) => describeVariant(variant));
  const selectedLabel = await promptIO.select(
    `Select an install variant for ${options.manifest.server.title} in ${options.client}.`,
    labels,
  );
  const selectedIndex = labels.indexOf(selectedLabel);

  return supportedVariants[selectedIndex] ?? supportedVariants[0]!;
}

function isSupportedVariant(
  manifest: InstallManifestV1,
  client: ClientId,
  variantId: string,
): boolean {
  try {
    selectInstallVariant(manifest, client, variantId);
    return true;
  } catch (error) {
    if (error instanceof UnsupportedVariantError) {
      return false;
    }

    throw error;
  }
}

function describeVariant(variant: InstallManifestV1["variants"][number]): string {
  if (variant.kind === "package") {
    return `${variant.identifier}@${variant.version} (${variant.transport})`;
  }

  return `${variant.transport} remote (${variant.urlTemplate})`;
}