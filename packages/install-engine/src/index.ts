export { type UnsupportedVariantReason, UnsupportedVariantError } from "./errors.js";
export {
  createInstallInputDefinitions,
  InstallInputValidationError,
  type InstallInputValidationErrorReason,
  validateInputValues,
} from "./input-resolution.js";
export {
  createResolvedInstallIntent,
  ResolveIntentError,
  type ResolveIntentErrorReason,
} from "./intent.js";
export {
  hashInstallManifest,
  hashResolvedInstallIntent,
  serializeInstallPlan,
  serializeRemovalPlan,
} from "./hash.js";
export { assertExactPinnedVersion, parseSemVer, type ParsedSemVer } from "./semver.js";
export { selectInstallVariant } from "./select-variant.js";
export {
  PlanValidationError,
  validateInstallPlan,
  validateRemovalPlan,
  type PlanValidationErrorCode,
  type PlanValidationErrorReason,
} from "./validate-plan.js";
export {
  type AdapterCapability,
  type AdapterSafetyDescriptor,
  type ClientId,
  type ClientCommandOperation,
  type ClientScope,
  type ConfigRemoveOperation,
  type ConfigWriteOperation,
  type CursorInstallDeeplinkDescriptor,
  type DeeplinkOperation,
  type EnvironmentVariableInputDefinition,
  type InstallInputDefinition,
  type InstallInputKind,
  type InstallInputValue,
  type InstallManifestPackageVariantV1,
  type InstallManifestRemoteVariantV1,
  type InstallManifestVariantV1,
  type InstallOperation,
  type InstallPlan,
  type InstallPlanBase,
  type PackageArgumentInputDefinition,
  type PackageRuntimeArgumentInputDefinition,
  type Plan,
  type JsonPrimitive,
  type JsonValue,
  type RemoteAuthBinding,
  type RemoteAuthResolution,
  type RemoteHeaderInputDefinition,
  type RemovalOperation,
  type RemoteVariableInputDefinition,
  type RemovalPlan,
  type ResolveIntentOptions,
  type ResolvedInstallIntent,
  type ValidatedInstallInputMap,
} from "./types.js";
