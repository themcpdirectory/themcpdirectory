import type { InstallManifestV1, SupportedClientId } from "@themcpdirectory/api-contract";

export type ClientId = SupportedClientId;
export type InstallManifestVariantV1 = InstallManifestV1["variants"][number];
export type InstallManifestPackageVariantV1 = Extract<
  InstallManifestVariantV1,
  { kind: "package" }
>;
export type InstallManifestRemoteVariantV1 = Extract<InstallManifestVariantV1, { kind: "remote" }>;
