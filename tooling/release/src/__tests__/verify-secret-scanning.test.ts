import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { releaseCandidateFiles } from "../verify-secret-scanning.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("secret scan release candidate files", () => {
  it("includes present tracked and untracked files while excluding tracked deletions", async () => {
    const repository = await mkdtemp(path.join(os.tmpdir(), "secret-scan-files-"));
    temporaryDirectories.push(repository);
    await execFileAsync("git", ["init"], { cwd: repository });
    await mkdir(path.join(repository, "apps", "web"), { recursive: true });
    await writeFile(path.join(repository, "apps", "web", "present.ts"), "present");
    await writeFile(path.join(repository, "apps", "web", "deleted.ts"), "deleted");
    await execFileAsync("git", ["add", "apps/web/present.ts", "apps/web/deleted.ts"], {
      cwd: repository,
    });
    await rm(path.join(repository, "apps", "web", "deleted.ts"));
    await writeFile(path.join(repository, "apps", "web", "new.ts"), "new");

    await expect(releaseCandidateFiles(repository)).resolves.toEqual([
      "apps/web/new.ts",
      "apps/web/present.ts",
    ]);
  });
});
