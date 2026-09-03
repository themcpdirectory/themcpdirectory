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
export {
  CodexAdapterError,
  createCodexAdapter,
  detectCodex,
  probeCodexCapabilities,
  type CodexAdapterErrorCode,
  type CodexCapabilityProbeResult,
} from "./codex.js";
export {
  ClaudeCodeAdapterError,
  createClaudeCodeAdapter,
  detectClaudeCode,
  probeClaudeCodeCapabilities,
  type ClaudeCapabilityProbeResult,
  type ClaudeCodeAdapterErrorCode,
} from "./claude-code.js";
export {
  CursorAdapterError,
  createCursorAdapter,
  type CursorAdapterErrorCode,
} from "./cursor.js";
export {
  CursorJsonError,
  applyCursorConfigMutation,
  createCursorConfigMutation,
  getCursorServerEntry,
  readCursorConfigDocument,
  removeCursorServerEntry,
  resolveCursorScopePaths,
  setCursorServerEntry,
  type CursorConfigDocument,
  type CursorConfigMutation,
  type CursorJsonErrorCode,
  type CursorScopePaths,
} from "./cursor-json.js";
export {
  VsCodeJsonError,
  applyVsCodeConfigMutation,
  createVsCodeConfigMutation,
  getVsCodeServerEntry,
  readVsCodeConfigDocument,
  removeVsCodeServerEntry,
  resolveVsCodeScopePaths,
  setVsCodeInputs,
  setVsCodeServerEntry,
  type VsCodeConfigDocument,
  type VsCodeConfigMutation,
  type VsCodeJsonErrorCode,
  type VsCodeScopePaths,
} from "./vscode-json.js";
export { createCursorDeeplink } from "./cursor-deeplink.js";
export {
  VsCodeAdapterError,
  createVsCodeAdapter,
  type VsCodeAdapterErrorCode,
} from "./vscode.js";
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
