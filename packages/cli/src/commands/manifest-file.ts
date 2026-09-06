import { resolve } from "node:path";
import {
  parseMcpdirManifest,
  toRegistryPublishArtifact,
  type McpdirManifest,
  type RegistryPublishArtifact,
} from "@themcpdirectory/registry-normalizer";
import type { CliDependencies } from "../dependencies.js";

export const DEFAULT_MAINTAINER_MANIFEST_PATH = "mcpdir.json";

export type ManifestFileResult =
  | {
      readonly ok: true;
      readonly path: string;
      readonly manifest: McpdirManifest;
      readonly artifact: RegistryPublishArtifact;
    }
  | {
      readonly ok: false;
      readonly path: string;
      readonly code:
        | "MANIFEST_NOT_FOUND"
        | "MANIFEST_READ_FAILED"
        | "MANIFEST_JSON_INVALID"
        | "MANIFEST_INVALID";
      readonly message: string;
    };

export async function readMaintainerManifest(
  requestedPath: string | undefined,
  deps: CliDependencies,
): Promise<ManifestFileResult> {
  const path = resolveMaintainerPath(requestedPath, deps);
  const fileSystem = deps.maintainerFileSystem;
  if (!fileSystem) {
    return {
      ok: false,
      path,
      code: "MANIFEST_READ_FAILED",
      message: `${path} could not be read. Check the file path and permissions.`,
    };
  }
  let contents: string;
  try {
    contents = await fileSystem.readFile(path);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      return {
        ok: false,
        path,
        code: "MANIFEST_NOT_FOUND",
        message: `${path} was not found. Run mcpdir init to create mcpdir.json.`,
      };
    }
    return {
      ok: false,
      path,
      code: "MANIFEST_READ_FAILED",
      message: `${path} could not be read. Check the file path and permissions.`,
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(contents);
  } catch {
    return {
      ok: false,
      path,
      code: "MANIFEST_JSON_INVALID",
      message: `${path} must contain valid JSON.`,
    };
  }

  const parsed = parseMcpdirManifest(input);
  if (!parsed.success) {
    const details = parsed.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .sort()
      .join("; ");
    return {
      ok: false,
      path,
      code: "MANIFEST_INVALID",
      message: `${path} is invalid: ${details}`,
    };
  }

  return {
    ok: true,
    path,
    manifest: parsed.data,
    artifact: toRegistryPublishArtifact(parsed.data),
  };
}

export function resolveMaintainerPath(
  requestedPath: string | undefined,
  deps: CliDependencies,
): string {
  return resolve(
    deps.runtime.workingDirectory ?? process.cwd(),
    requestedPath ?? DEFAULT_MAINTAINER_MANIFEST_PATH,
  );
}

export function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
