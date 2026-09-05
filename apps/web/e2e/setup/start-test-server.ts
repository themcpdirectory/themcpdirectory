import { spawn } from "node:child_process";
import path from "node:path";
import {
  prepareTestDatabase,
  TEST_BETTER_AUTH_SECRET,
  TEST_DATABASE_URL,
  TEST_GITHUB_APP_ENV,
  TEST_PORT,
} from "./test-database";

function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Next.js failed with ${signal ?? `exit code ${code ?? "unknown"}`}.`));
    });
  });
}

async function main(): Promise<void> {
  await prepareTestDatabase();

  const nextCli = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    NEXT_PUBLIC_BASE_URL: `http://localhost:${TEST_PORT}`,
    MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
    WEB_PORT: TEST_PORT,
    API_PORT: "3001",
    BETTER_AUTH_SECRET: TEST_BETTER_AUTH_SECRET,
    ...TEST_GITHUB_APP_ENV,
  };
  const production = process.env.WEB_E2E_MODE === "production";
  if (production) {
    const build = spawn(process.execPath, [nextCli, "build", "--webpack"], {
      stdio: "inherit",
      env,
    });
    await waitForExit(build);
  }

  const command = production ? "start" : "dev";
  const args = [nextCli, command, "--port", TEST_PORT, ...(production ? [] : ["--webpack"])];
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env,
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
