export {
  SUPPORTED_CLIENTS,
  getSupportedClientById,
  type ClientDescriptor,
  type ClientCapabilities,
} from "./catalog.js";
export {
  createNodeAdapterRuntime,
  AdapterRuntimeError,
  type AdapterRuntimeErrorCode,
  type AdapterRuntimeOperation,
  type NodeAdapterRuntimeOptions,
} from "./runtime.js";
export {
  createAdapterRegistry,
  AdapterRegistryError,
  type AdapterRegistryErrorCode,
} from "./registry.js";
export type {
  AdapterRegistry,
  AdapterRollbackResult,
  AdapterRuntime,
  ClientDetection,
  CopyFileOptions,
  DiagnosticIssue,
  DiagnosticResult,
  ExecFileOptions,
  ExecResult,
  FileStatSnapshot,
  InstallVerificationResult,
  InstalledMcpServer,
  McpClientAdapter,
  MkdirOptions,
  PlanInstallOptions,
  PlanRemoveOptions,
  RemoveVerificationResult,
  WriteFileOptions,
} from "./types.js";
