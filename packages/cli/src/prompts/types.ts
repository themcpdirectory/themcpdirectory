import type { ClientDetection } from "@themcpdirectory/client-adapters";
import type {
  AdapterCapability,
  ClientId,
  ClientScope,
  InstallInputValue,
} from "@themcpdirectory/install-engine";
import type { InstallManifestV1 } from "@themcpdirectory/api-contract";

export interface SelectedAddTarget {
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly detection: ClientDetection;
}

export interface CollectedInputsResult {
  readonly values: Record<string, InstallInputValue>;
  readonly inputSummary: readonly string[];
  readonly warnings: readonly string[];
}

export interface ConfirmationTargetSummary {
  readonly client: ClientId;
  readonly scope: ClientScope;
}

export interface CollectInputsOptions {
  readonly client: ClientId;
  readonly variant: InstallManifestV1["variants"][number];
  readonly capabilities: readonly AdapterCapability[];
}

export type AddPlanningPromptErrorCode =
  | "REQUIRED_INPUT"
  | "USER_CANCELLED"
  | "CLIENT_UNAVAILABLE"
  | "UNSUPPORTED_CLIENT";

export class AddPlanningPromptError extends Error {
  readonly code: AddPlanningPromptErrorCode;

  constructor(code: AddPlanningPromptErrorCode, message: string) {
    super(message);
    this.name = "AddPlanningPromptError";
    this.code = code;
  }
}