import { posix, win32 } from "node:path";

const STATE_DIR_ENV_NAME = "MCPDIR_STATE_DIR";

export interface CliStatePaths {
  readonly stateDir: string;
  readonly receiptsFile: string;
  readonly lockFile: string;
  readonly backupsDir: string;
}

export function resolveCliStatePaths(options: {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly cwd: string;
}): CliStatePaths {
  const platformPath = options.platform === "win32" ? win32 : posix;
  const override = options.env[STATE_DIR_ENV_NAME]?.trim();

  const stateDir =
    override && override.length > 0
      ? resolveMaybeRelativePath(platformPath, override, options.cwd)
      : resolveDefaultStateDir(options.platform, options.env, options.homeDirectory);

  return {
    stateDir,
    receiptsFile: platformPath.join(stateDir, "receipts.v1.json"),
    lockFile: platformPath.join(stateDir, "receipts.v1.lock"),
    backupsDir: platformPath.join(stateDir, "backups"),
  };
}

function resolveDefaultStateDir(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  homeDirectory: string,
): string {
  if (platform === "darwin") {
    return posix.join(homeDirectory, "Library", "Application Support", "mcpdir");
  }

  if (platform === "win32") {
    const appData = env.APPDATA?.trim();
    if (appData && appData.length > 0) {
      return win32.join(appData, "mcpdir");
    }

    return win32.join(homeDirectory, "AppData", "Roaming", "mcpdir");
  }

  const xdgStateHome = env.XDG_STATE_HOME?.trim();
  if (xdgStateHome && xdgStateHome.length > 0) {
    return posix.join(xdgStateHome, "mcpdir");
  }

  return posix.join(homeDirectory, ".local", "state", "mcpdir");
}

function resolveMaybeRelativePath(
  platformPath: typeof posix | typeof win32,
  directory: string,
  cwd: string,
): string {
  if (platformPath.isAbsolute(directory)) {
    return platformPath.normalize(directory);
  }

  return platformPath.resolve(cwd, directory);
}
