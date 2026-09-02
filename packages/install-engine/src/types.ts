import type { InstallManifestV1, SupportedClientId } from "@themcpdirectory/api-contract";

export type ClientId = SupportedClientId;
export type ClientScope = "user" | "project" | "global";
export type InstallManifestVariantV1 = InstallManifestV1["variants"][number];
export type InstallManifestPackageVariantV1 = Extract<
  InstallManifestVariantV1,
  { kind: "package" }
>;
export type InstallManifestRemoteVariantV1 = Extract<InstallManifestVariantV1, { kind: "remote" }>;

export type InstallInputKind = "env-reference" | "text" | "secret-value";

export type InstallInputValue =
  | { readonly kind: "env-reference"; readonly envName: string }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "secret-value"; readonly value: string; readonly allowPersistence: true };

export type ValidatedInstallInputMap = ReadonlyMap<string, InstallInputValue>;

interface BaseInstallInputDefinition {
  readonly key: string;
  readonly description: string | null;
  readonly required: boolean;
  readonly accepts: readonly InstallInputKind[];
}

type PackageArgumentType = InstallManifestPackageVariantV1["runtimeArguments"][number]["type"];

export interface PackageRuntimeArgumentInputDefinition extends BaseInstallInputDefinition {
  readonly source: "package-runtime-argument";
  readonly argumentType: PackageArgumentType;
  readonly index: number;
  readonly name: string | null;
  readonly valueHint: string | null;
}

export interface PackageArgumentInputDefinition extends BaseInstallInputDefinition {
  readonly source: "package-argument";
  readonly argumentType: PackageArgumentType;
  readonly index: number;
  readonly name: string | null;
  readonly valueHint: string | null;
}

export interface EnvironmentVariableInputDefinition extends BaseInstallInputDefinition {
  readonly source: "environment-variable";
  readonly name: string;
}

export interface RemoteVariableInputDefinition extends BaseInstallInputDefinition {
  readonly source: "remote-variable";
  readonly name: string;
}

export interface RemoteHeaderInputDefinition extends BaseInstallInputDefinition {
  readonly source: "remote-header";
  readonly headerName: string;
  readonly placeholder: string;
  readonly sensitive: boolean;
}

export type InstallInputDefinition =
  | PackageRuntimeArgumentInputDefinition
  | PackageArgumentInputDefinition
  | EnvironmentVariableInputDefinition
  | RemoteVariableInputDefinition
  | RemoteHeaderInputDefinition;

export type RemoteAuthBinding =
  | { readonly kind: "env-reference"; readonly inputKey: string; readonly envName: string }
  | { readonly kind: "persisted-secret"; readonly inputKey: string };

export type RemoteAuthResolution =
  | { readonly kind: "none" }
  | { readonly kind: "client-oauth"; readonly followUpMessage: string }
  | {
      readonly kind: "env-reference";
      readonly bindings: readonly Extract<RemoteAuthBinding, { readonly kind: "env-reference" }>[];
    }
  | {
      readonly kind: "persisted-secret";
      readonly bindings: readonly Extract<
        RemoteAuthBinding,
        { readonly kind: "persisted-secret" }
      >[];
      readonly requiresInteractiveConsent: true;
    }
  | {
      readonly kind: "mixed";
      readonly bindings: readonly RemoteAuthBinding[];
      readonly requiresInteractiveConsent: true;
    };

export interface ResolveIntentOptions {
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly requestedVariantId?: string;
  readonly inputValues: Record<string, InstallInputValue>;
  readonly noninteractive?: boolean;
  readonly remoteAuthPreference?: "auto" | "client-oauth";
}

export interface ResolvedInstallIntent {
  readonly schemaVersion: 1;
  readonly server: {
    readonly slug: InstallManifestV1["server"]["slug"];
    readonly title: InstallManifestV1["server"]["title"];
    readonly version: InstallManifestV1["server"]["version"];
  };
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly variant: InstallManifestVariantV1;
  readonly warnings: readonly string[];
  readonly inputs: readonly InstallInputDefinition[];
  readonly remoteAuth: RemoteAuthResolution;
  readonly requiredEnvReferences: readonly string[];
}
