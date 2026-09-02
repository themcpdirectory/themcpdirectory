import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { assertExactPinnedVersion } from "./semver.js";
import type {
  ClientId,
  InstallManifestPackageVariantV1,
  InstallManifestRemoteVariantV1,
  InstallManifestVariantV1,
} from "./types.js";
import { UnsupportedVariantError, type UnsupportedVariantReason } from "./errors.js";

const SUPPORTED_REMOTE_TRANSPORTS = new Set<InstallManifestRemoteVariantV1["transport"]>([
  "streamable-http",
]);

function throwVariantError(
  reason: UnsupportedVariantReason,
  client: ClientId,
  message: string,
  options?: { readonly requestedVariantId?: string; readonly variantId?: string },
): never {
  throw new UnsupportedVariantError(reason, client, message, options);
}

function assertClientCompatible(manifest: InstallManifestV1, client: ClientId): void {
  const compatibilityStatus = manifest.compatibility[client];

  if (
    compatibilityStatus !== "supported" &&
    compatibilityStatus !== "supported_with_configuration"
  ) {
    throwVariantError(
      "CLIENT_INCOMPATIBLE",
      client,
      `Client ${client} is not compatible with this install manifest`,
    );
  }
}

function isSupportedPackageVariant(
  variant: InstallManifestPackageVariantV1,
  client: ClientId,
): variant is InstallManifestPackageVariantV1 {
  if (variant.registryType !== "npm") {
    throwVariantError(
      "UNSUPPORTED_REGISTRY",
      client,
      `Unsupported package registry: ${variant.registryType}`,
      { variantId: variant.id },
    );
  }

  if (variant.transport !== "stdio") {
    throwVariantError(
      "UNSUPPORTED_TRANSPORT",
      client,
      `Unsupported package transport: ${variant.transport}`,
      { variantId: variant.id },
    );
  }

  if (variant.runtimeHint !== null && variant.runtimeHint !== "npx") {
    throwVariantError(
      "UNSUPPORTED_TRANSPORT",
      client,
      `Unsupported package runtime hint: ${variant.runtimeHint}`,
      { variantId: variant.id },
    );
  }

  try {
    assertExactPinnedVersion(variant.version);
  } catch {
    throwVariantError(
      "MUTABLE_VERSION",
      client,
      `Package version must be immutable: ${variant.version}`,
      { variantId: variant.id },
    );
  }

  if (variant.integrity !== null) {
    if (
      variant.integrity.algorithm !== "sha256" ||
      !/^[a-f0-9]{64}$/i.test(variant.integrity.digest)
    ) {
      throwVariantError(
        "MALFORMED_INTEGRITY",
        client,
        `Malformed package integrity for variant ${variant.id}`,
        { variantId: variant.id },
      );
    }
  }

  return true;
}

function isSupportedRemoteVariant(
  variant: InstallManifestRemoteVariantV1,
  client: ClientId,
): variant is InstallManifestRemoteVariantV1 {
  if (!SUPPORTED_REMOTE_TRANSPORTS.has(variant.transport)) {
    throwVariantError(
      "UNSUPPORTED_TRANSPORT",
      client,
      `Unsupported remote transport: ${variant.transport}`,
      { variantId: variant.id },
    );
  }

  return true;
}

function selectValidatedVariant(
  variant: InstallManifestVariantV1,
  client: ClientId,
): InstallManifestVariantV1 {
  if (variant.kind === "package") {
    isSupportedPackageVariant(variant, client);
    return variant;
  }

  if (variant.kind === "remote") {
    isSupportedRemoteVariant(variant, client);
    return variant;
  }

  const invalidVariant = variant as InstallManifestVariantV1 & { readonly kind: string };

  throwVariantError(
    "UNSUPPORTED_TRANSPORT",
    client,
    `Unsupported install variant kind: ${invalidVariant.kind}`,
    { variantId: invalidVariant.id },
  );
}

export function selectInstallVariant(
  manifest: InstallManifestV1,
  client: ClientId,
  requestedVariantId?: string,
): InstallManifestVariantV1 {
  assertClientCompatible(manifest, client);

  if (requestedVariantId !== undefined) {
    const requestedVariant = manifest.variants.find((variant) => variant.id === requestedVariantId);
    if (!requestedVariant) {
      throwVariantError(
        "CLIENT_INCOMPATIBLE",
        client,
        `Requested variant is not available: ${requestedVariantId}`,
        { requestedVariantId },
      );
    }

    return selectValidatedVariant(requestedVariant, client);
  }

  let firstError: UnsupportedVariantError | null = null;

  for (const variant of manifest.variants) {
    try {
      return selectValidatedVariant(variant, client);
    } catch (error) {
      if (error instanceof UnsupportedVariantError) {
        if (firstError === null) {
          firstError = error;
        }
        continue;
      }

      throw error;
    }
  }

  if (firstError !== null) {
    throw firstError;
  }

  throwVariantError(
    "CLIENT_INCOMPATIBLE",
    client,
    "No install variants are available in this manifest",
  );
}
