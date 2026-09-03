import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type InstallationReceipt,
  createReceiptStore,
  type ReceiptStore,
} from "../config/receipt-store.js";
import { resolveCliStatePaths } from "../config/state-paths.js";

const createdDirs: string[] = [];

function createReceipt(overrides: Partial<InstallationReceipt> = {}): InstallationReceipt {
  return {
    schemaVersion: 1,
    slug: "github",
    client: "codex",
    scope: "user",
    serverVersion: "1.2.3",
    variantId: "11111111-1111-4111-8111-111111111111",
    manifestHash: "a".repeat(64),
    installedAt: "2026-09-03T12:00:00.000Z",
    adapterFingerprint: "fp:codex:v1",
    ...overrides,
  };
}

async function createStore(): Promise<{ readonly store: ReceiptStore; readonly stateDir: string }> {
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "mcpdir-cli-state-"));
  createdDirs.push(homeDirectory);

  const paths = resolveCliStatePaths({
    platform: process.platform,
    env: {
      MCPDIR_STATE_DIR: ".runtime-state",
    },
    homeDirectory,
    cwd: homeDirectory,
  });

  await mkdir(paths.stateDir, { recursive: true });

  return {
    store: createReceiptStore(paths, {
      lock: {
        maxAttempts: 2,
        retryDelayMs: 1,
      },
    }),
    stateDir: paths.stateDir,
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0, createdDirs.length).map(async (directory) => {
      await import("node:fs/promises").then(({ rm }) =>
        rm(directory, { recursive: true, force: true }),
      );
    }),
  );
});

describe("createReceiptStore", () => {
  it("writes and finds receipts atomically without persisting unknown fields", async () => {
    const { store, stateDir } = await createStore();
    const noisyReceipt = {
      ...createReceipt(),
      unknownField: "must-not-persist",
      secretValue: "super-secret-token",
      nested: { arbitrary: true },
    } as unknown as InstallationReceipt;

    await store.write(noisyReceipt);

    const receipts = await store.list();
    expect(receipts).toHaveLength(1);
    expect(await store.find({ slug: "github", client: "codex", scope: "user" })).toEqual(
      receipts[0],
    );

    const fileText = await readFile(path.join(stateDir, "receipts.v1.json"), "utf8");
    expect(fileText).not.toContain("unknownField");
    expect(fileText).not.toContain("secretValue");
    expect(fileText).not.toContain("nested");

    const stateFiles = await readdir(stateDir);
    expect(stateFiles.some((name) => name.includes(".tmp"))).toBe(false);
    await expect(stat(path.join(stateDir, "receipts.v1.lock"))).rejects.toThrow();
  });

  it("removes only the targeted receipt", async () => {
    const { store } = await createStore();

    await store.write(createReceipt({ slug: "github", client: "codex", scope: "user" }));
    await store.write(createReceipt({ slug: "github", client: "cursor", scope: "project" }));

    await store.remove({ slug: "github", client: "codex", scope: "user" });

    const receipts = await store.list();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ slug: "github", client: "cursor", scope: "project" });
    expect(await store.find({ slug: "github", client: "codex", scope: "user" })).toBeNull();
  });

  it("preserves corrupt receipt state before resetting to a safe empty schema", async () => {
    const { store, stateDir } = await createStore();
    await writeFile(path.join(stateDir, "receipts.v1.json"), "{not-valid-json", "utf8");

    const receipts = await store.list();
    expect(receipts).toEqual([]);

    const backups = await readdir(path.join(stateDir, "backups"));
    expect(backups.some((entry) => entry.startsWith("receipts.v1.corrupt-"))).toBe(true);

    const rewritten = await readFile(path.join(stateDir, "receipts.v1.json"), "utf8");
    expect(rewritten).toContain('"schemaVersion": 1');
    expect(rewritten).toContain('"receipts": []');
  });

  it("fails fast when an active lock exists and does not overwrite it", async () => {
    const { store, stateDir } = await createStore();
    const lockPath = path.join(stateDir, "receipts.v1.lock");

    await writeFile(lockPath, JSON.stringify({ ownerPid: 42, createdAt: Date.now() }), "utf8");

    await expect(store.write(createReceipt())).rejects.toMatchObject({
      name: "ReceiptStoreError",
      code: "RECEIPT_STATE_LOCKED",
    });

    const lockContent = await readFile(lockPath, "utf8");
    expect(lockContent).toContain("ownerPid");
  });
});
