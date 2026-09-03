import { posix, win32 } from "node:path";
import type { AdapterRuntime } from "./types.js";

interface StandardInstallationCandidate {
  readonly path: string | undefined;
  readonly kind: "file" | "directory";
}

export async function findInstalledApplication(
  runtime: AdapterRuntime,
  executableName: string,
  standardCandidates: readonly StandardInstallationCandidate[],
): Promise<string | undefined> {
  const pathModule = runtime.platform === "win32" ? win32 : posix;
  const delimiter = runtime.platform === "win32" ? ";" : ":";
  const pathValue =
    runtime.platform === "win32"
      ? Object.entries(runtime.env).find(([key]) => key.toLowerCase() === "path")?.[1]
      : runtime.env.PATH;
  const executableNames =
    runtime.platform === "win32"
      ? (runtime.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
          .map((extension) => `${executableName}${extension.toLowerCase()}`)
      : [executableName];
  const pathCandidates = (pathValue ?? "")
    .split(delimiter)
    .filter((directory) => directory !== "." && pathModule.isAbsolute(directory))
    .flatMap((directory) =>
      executableNames.map((name) => ({
        path: pathModule.join(directory, name),
        kind: "file" as const,
      })),
    );
  const candidates = [...pathCandidates, ...standardCandidates].filter(
    (candidate): candidate is { readonly path: string; readonly kind: "file" | "directory" } =>
      candidate.path !== undefined,
  );

  for (const candidate of candidates) {
    try {
      const stat = await runtime.stat(candidate.path);
      if (candidate.kind === "directory" ? stat.isDirectory() : isExecutableFile(runtime, stat)) {
        return candidate.path;
      }
    } catch {
      // Missing and inaccessible candidates are unavailable.
    }
  }

  return undefined;
}

function isExecutableFile(
  runtime: AdapterRuntime,
  stat: Awaited<ReturnType<AdapterRuntime["stat"]>>,
): boolean {
  return stat.isFile() && (runtime.platform === "win32" || (stat.mode & 0o111) !== 0);
}
