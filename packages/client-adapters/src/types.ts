import type {
  AdapterCapability,
  AdapterSafetyDescriptor,
  ClientId,
  ClientScope,
  InstallPlan,
  RemovalPlan,
  ResolvedInstallIntent,
  ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";

export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ExecFileOptions {
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly shell: false;
  readonly stdin: "ignore";
}

export interface WriteFileOptions {
  readonly mode?: number;
  readonly exclusive?: boolean;
}

export interface MkdirOptions {
  readonly recursive?: boolean;
  readonly mode?: number;
}

export interface CopyFileOptions {
  readonly exclusive?: boolean;
}

export interface FileStatSnapshot {
  readonly mode: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface AdapterRuntime {
  readonly platform: NodeJS.Platform;
  readonly cwd: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly homeDirectory: string;
  execFile(
    executable: string,
    args: readonly string[],
    options: ExecFileOptions,
  ): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  lstat(path: string): Promise<FileStatSnapshot>;
  stat(path: string): Promise<FileStatSnapshot>;
  realpath(path: string): Promise<string>;
  unlink(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  copyFile(from: string, to: string, options?: CopyFileOptions): Promise<void>;
  fsyncFile(path: string): Promise<void>;
  fsyncDirectory(path: string): Promise<void>;
  openUrl(url: string): Promise<void>;
}

export interface ClientDetection {
  readonly id: ClientId;
  readonly installed: boolean;
  readonly executable?: string;
  readonly version?: string;
  readonly capabilities: readonly AdapterCapability[];
}

export interface InstalledMcpServer {
  readonly name: string;
  readonly slug?: string;
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly transport: "stdio" | "streamable-http" | "http";
  readonly managedBy: "external";
  readonly variantId?: string;
  readonly manifestHash?: string;
  readonly adapterMetadata: Readonly<Record<string, string | number | boolean>>;
}

export interface PlanInstallOptions {
  readonly intent: ResolvedInstallIntent;
  readonly inputs: ValidatedInstallInputMap;
  readonly noninteractive: boolean;
  readonly manifestHash: string;
  readonly intentHash: string;
}

export interface PlanRemoveOptions {
  readonly slug: string;
  readonly scope?: ClientScope;
}

export interface InstallVerificationResult {
  readonly ok: boolean;
  readonly installedEntry?: InstalledMcpServer;
  readonly message: string;
}

export interface RemoveVerificationResult {
  readonly ok: boolean;
  readonly message: string;
}

export interface DiagnosticIssue {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly recoveryHint?: string;
}

export interface DiagnosticResult {
  readonly client: ClientId;
  readonly ok: boolean;
  readonly issues: readonly DiagnosticIssue[];
}

export interface AdapterRollbackResult {
  readonly restored: boolean;
  readonly message: string;
}

export interface McpClientAdapter {
  readonly id: ClientId;
  detect(): Promise<ClientDetection>;
  inspect(scope?: ClientScope): Promise<readonly InstalledMcpServer[]>;
  planInstall(options: PlanInstallOptions): Promise<InstallPlan>;
  executePlan(plan: InstallPlan): Promise<void>;
  verifyInstall(plan: InstallPlan): Promise<InstallVerificationResult>;
  planRemove(options: PlanRemoveOptions): Promise<RemovalPlan>;
  executeRemove(plan: RemovalPlan): Promise<void>;
  verifyRemove(plan: RemovalPlan): Promise<RemoveVerificationResult>;
  diagnose(): Promise<DiagnosticResult>;
  getSafetyDescriptor(): AdapterSafetyDescriptor;
}

export interface AdapterRegistry {
  list(): readonly McpClientAdapter[];
  get(id: ClientId): McpClientAdapter;
  detectAll(): Promise<readonly ClientDetection[]>;
}
