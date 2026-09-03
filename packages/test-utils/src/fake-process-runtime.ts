interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface ExecFileOptions {
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly shell: false;
  readonly stdin: "ignore";
}

interface WriteFileOptions {
  readonly mode?: number;
  readonly exclusive?: boolean;
}

interface MkdirOptions {
  readonly recursive?: boolean;
  readonly mode?: number;
}

interface CopyFileOptions {
  readonly exclusive?: boolean;
}

interface FileStatSnapshot {
  readonly mode: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

interface AdapterRuntimeLike {
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

type FakeEntry =
  | { readonly type: "file"; content: string; mode: number }
  | { readonly type: "directory"; mode: number }
  | { readonly type: "symlink"; target: string; mode: number };

export interface FakeProcessRuntimeOptions {
  readonly platform?: NodeJS.Platform;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly execResults?: readonly ExecResult[];
  readonly execDelaysMs?: readonly number[];
  readonly entries?: Readonly<Record<string, FakeEntry>>;
}

export interface FakeProcessRuntime {
  readonly runtime: AdapterRuntimeLike;
  readonly spawnCalls: Array<{
    readonly executable: string;
    readonly args: readonly string[];
    readonly options: ExecFileOptions;
  }>;
  readonly openCalls: string[];
  readonly fileWrites: Array<{
    readonly path: string;
    readonly content: string;
    readonly options: WriteFileOptions | undefined;
  }>;
  readonly mkdirCalls: Array<{ readonly path: string; readonly options: MkdirOptions | undefined }>;
  readonly copyCalls: Array<{
    readonly from: string;
    readonly to: string;
    readonly options: CopyFileOptions | undefined;
  }>;
  readonly chmodCalls: Array<{ readonly path: string; readonly mode: number }>;
  readonly renameCalls: Array<{ readonly from: string; readonly to: string }>;
  readonly fsyncFileCalls: string[];
  readonly fsyncDirectoryCalls: string[];
  readonly unlinkCalls: string[];
  readonly readCalls: string[];
  readonly lstatCalls: string[];
  readonly statCalls: string[];
  readonly realpathCalls: string[];
}

function createFrozenEnv(env: NodeJS.ProcessEnv | undefined): Readonly<NodeJS.ProcessEnv> {
  return Object.freeze({ ...(env ?? process.env) });
}

function cloneEntry(entry: FakeEntry): FakeEntry {
  switch (entry.type) {
    case "file":
      return { type: "file", content: entry.content, mode: entry.mode };
    case "directory":
      return { type: "directory", mode: entry.mode };
    case "symlink":
      return { type: "symlink", target: entry.target, mode: entry.mode };
  }
}

function createStatSnapshot(entry: FakeEntry): FileStatSnapshot {
  return {
    mode: entry.mode,
    isFile: () => entry.type === "file",
    isDirectory: () => entry.type === "directory",
    isSymbolicLink: () => entry.type === "symlink",
  };
}

function createFsError(code: string, message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function assertParentDirectory(entries: Map<string, FakeEntry>, path: string): void {
  const parent = getParentPath(path);
  if (!parent) {
    return;
  }

  const resolvedParent = resolveRealPath(entries, parent);
  if (getEntry(entries, resolvedParent).type !== "directory") {
    throw createFsError("ENOTDIR", `Fake parent is not a directory: ${parent}`);
  }
}

function resolveWritablePath(entries: Map<string, FakeEntry>, path: string): string {
  const entry = entries.get(path);
  if (!entry) {
    return path;
  }
  if (entry.type === "directory") {
    throw createFsError("EISDIR", `Cannot write directory path: ${path}`);
  }

  return entry.type === "symlink" ? resolveRealPath(entries, path) : path;
}

function getParentPath(path: string): string | null {
  const separators = [path.lastIndexOf("/"), path.lastIndexOf("\\")];
  const boundary = Math.max(...separators);
  if (boundary <= 0) {
    return null;
  }

  return path.slice(0, boundary);
}

function collectMissingParents(entries: Map<string, FakeEntry>, path: string): string[] {
  const parents: string[] = [];
  let current = getParentPath(path);
  while (current && !entries.has(current)) {
    parents.unshift(current);
    current = getParentPath(current);
  }

  return parents;
}

function getEntry(entries: Map<string, FakeEntry>, path: string): FakeEntry {
  const entry = entries.get(path);
  if (!entry) {
    throw createFsError("ENOENT", `Missing fake path: ${path}`);
  }

  return entry;
}

function resolveRealPath(
  entries: Map<string, FakeEntry>,
  path: string,
  seen = new Set<string>(),
): string {
  if (seen.has(path)) {
    throw createFsError("ELOOP", `Symlink cycle at ${path}`);
  }

  const entry = getEntry(entries, path);
  if (entry.type !== "symlink") {
    return path;
  }

  seen.add(path);
  return resolveRealPath(entries, entry.target, seen);
}

export function createFakeProcessRuntime(
  options: FakeProcessRuntimeOptions = {},
): FakeProcessRuntime {
  const entries = new Map<string, FakeEntry>(
    Object.entries(options.entries ?? {}).map(([path, entry]) => [path, cloneEntry(entry)]),
  );
  const execResults = [...(options.execResults ?? [])];
  const execDelaysMs = [...(options.execDelaysMs ?? [])];
  const spawnCalls: FakeProcessRuntime["spawnCalls"] = [];
  const openCalls: string[] = [];
  const fileWrites: FakeProcessRuntime["fileWrites"] = [];
  const mkdirCalls: FakeProcessRuntime["mkdirCalls"] = [];
  const copyCalls: FakeProcessRuntime["copyCalls"] = [];
  const chmodCalls: FakeProcessRuntime["chmodCalls"] = [];
  const renameCalls: FakeProcessRuntime["renameCalls"] = [];
  const fsyncFileCalls: string[] = [];
  const fsyncDirectoryCalls: string[] = [];
  const unlinkCalls: string[] = [];
  const readCalls: string[] = [];
  const lstatCalls: string[] = [];
  const statCalls: string[] = [];
  const realpathCalls: string[] = [];

  const runtime = Object.freeze<AdapterRuntimeLike>({
    platform: options.platform ?? "darwin",
    cwd: options.cwd ?? "/tmp/fake-runtime",
    env: createFrozenEnv(options.env),
    homeDirectory: options.homeDirectory ?? "/Users/fake-runtime",
    async execFile(executable, args, execOptions): Promise<ExecResult> {
      if (execOptions.shell !== false || execOptions.stdin !== "ignore") {
        throw createFsError(
          "EXEC_INVALID_OPTIONS",
          "Adapter commands require shell: false and stdin: ignore",
        );
      }

      spawnCalls.push({ executable, args: [...args], options: { ...execOptions } });
      const result = execResults.shift() ?? { exitCode: 0, stdout: "", stderr: "" };
      const delayMs = execDelaysMs.shift() ?? 0;
      if (delayMs > execOptions.timeoutMs) {
        throw createFsError("EXEC_TIMEOUT", `Fake command timed out: ${executable}`);
      }
      if (
        Buffer.byteLength(result.stdout) > execOptions.maxStdoutBytes ||
        Buffer.byteLength(result.stderr) > execOptions.maxStderrBytes
      ) {
        throw createFsError(
          "EXEC_OUTPUT_LIMIT",
          `Fake command exceeded output limit: ${executable}`,
        );
      }

      return result;
    },
    async readFile(path): Promise<string> {
      readCalls.push(path);
      const resolvedPath = resolveRealPath(entries, path);
      const entry = getEntry(entries, resolvedPath);
      if (entry.type !== "file") {
        throw createFsError("EISDIR", `Cannot read non-file path: ${path}`);
      }

      return entry.content;
    },
    async writeFile(path, content, writeOptions): Promise<void> {
      if (writeOptions?.exclusive && entries.has(path)) {
        throw createFsError("EEXIST", `Fake path already exists: ${path}`);
      }

      assertParentDirectory(entries, path);
      const writablePath = resolveWritablePath(entries, path);
      const existingEntry = entries.get(writablePath);

      fileWrites.push({ path, content, options: writeOptions });
      entries.set(writablePath, {
        type: "file",
        content,
        mode: existingEntry?.type === "file" ? existingEntry.mode : (writeOptions?.mode ?? 0o666),
      });
    },
    async rename(from, to): Promise<void> {
      renameCalls.push({ from, to });
      const entry = getEntry(entries, from);
      assertParentDirectory(entries, to);
      const destination = entries.get(to);
      if (destination?.type === "directory" && entry.type !== "directory") {
        throw createFsError("EISDIR", `Cannot rename non-directory over directory: ${to}`);
      }
      if (destination && destination.type !== "directory" && entry.type === "directory") {
        throw createFsError("ENOTDIR", `Cannot rename directory over non-directory: ${to}`);
      }

      entries.set(to, cloneEntry(entry));
      entries.delete(from);
    },
    async mkdir(path, mkdirOptions): Promise<void> {
      mkdirCalls.push({ path, options: mkdirOptions });
      const existingEntry = entries.get(path);
      if (existingEntry) {
        if (existingEntry.type === "directory" && mkdirOptions?.recursive) {
          return;
        }
        throw createFsError("EEXIST", `Fake path already exists: ${path}`);
      }

      const missingParents = collectMissingParents(entries, path);
      if (missingParents.length > 0 && !mkdirOptions?.recursive) {
        throw createFsError("ENOENT", `Missing fake parent directory for ${path}`);
      }

      const nearestExistingParent = getParentPath(missingParents[0] ?? path);
      if (nearestExistingParent) {
        const resolvedParent = resolveRealPath(entries, nearestExistingParent);
        if (getEntry(entries, resolvedParent).type !== "directory") {
          throw createFsError(
            "ENOTDIR",
            `Fake parent is not a directory: ${nearestExistingParent}`,
          );
        }
      }

      for (const parent of missingParents) {
        entries.set(parent, { type: "directory", mode: mkdirOptions?.mode ?? 0o777 });
      }

      entries.set(path, { type: "directory", mode: mkdirOptions?.mode ?? 0o777 });
    },
    async lstat(path): Promise<FileStatSnapshot> {
      lstatCalls.push(path);
      return createStatSnapshot(getEntry(entries, path));
    },
    async stat(path): Promise<FileStatSnapshot> {
      statCalls.push(path);
      return createStatSnapshot(getEntry(entries, resolveRealPath(entries, path)));
    },
    async realpath(path): Promise<string> {
      realpathCalls.push(path);
      return resolveRealPath(entries, path);
    },
    async unlink(path): Promise<void> {
      unlinkCalls.push(path);
      const entry = getEntry(entries, path);
      if (entry.type === "directory") {
        throw createFsError("EISDIR", `Cannot unlink directory path: ${path}`);
      }
      entries.delete(path);
    },
    async chmod(path, mode): Promise<void> {
      chmodCalls.push({ path, mode });
      const entry = getEntry(entries, path);
      entries.set(path, { ...cloneEntry(entry), mode });
    },
    async copyFile(from, to, copyOptions): Promise<void> {
      copyCalls.push({ from, to, options: copyOptions });
      if (copyOptions?.exclusive && entries.has(to)) {
        throw createFsError("EEXIST", `Fake copy destination exists: ${to}`);
      }

      assertParentDirectory(entries, to);
      const sourceEntry = getEntry(entries, resolveRealPath(entries, from));
      if (sourceEntry.type !== "file") {
        throw createFsError("EISDIR", `Cannot copy non-file path: ${from}`);
      }
      const destinationPath = resolveWritablePath(entries, to);
      entries.set(destinationPath, cloneEntry(sourceEntry));
    },
    async fsyncFile(path): Promise<void> {
      fsyncFileCalls.push(path);
      getEntry(entries, path);
    },
    async fsyncDirectory(path): Promise<void> {
      fsyncDirectoryCalls.push(path);
      const entry = getEntry(entries, path);
      if (entry.type !== "directory") {
        throw createFsError("ENOTDIR", `Cannot fsync non-directory path: ${path}`);
      }
    },
    async openUrl(url): Promise<void> {
      openCalls.push(url);
    },
  });

  return {
    runtime,
    spawnCalls,
    openCalls,
    fileWrites,
    mkdirCalls,
    copyCalls,
    chmodCalls,
    renameCalls,
    fsyncFileCalls,
    fsyncDirectoryCalls,
    unlinkCalls,
    readCalls,
    lstatCalls,
    statCalls,
    realpathCalls,
  };
}
