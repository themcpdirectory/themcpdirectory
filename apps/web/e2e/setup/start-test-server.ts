import { spawn } from "node:child_process";
import path from "node:path";
import {
  prepareTestDatabase,
  TEST_BETTER_AUTH_SECRET,
  TEST_DATABASE_URL,
  TEST_GITHUB_APP_ENV,
  TEST_PORT,
} from "./test-database";

async function main(): Promise<void> {
  await prepareTestDatabase();

  const nextCli = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextCli, "dev", "--port", TEST_PORT, "--webpack"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      NEXT_PUBLIC_BASE_URL: `http://localhost:${TEST_PORT}`,
      MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
      WEB_PORT: TEST_PORT,
      API_PORT: "3001",
      // Required by @themcpdirectory/config's loadWebEnv() so the dashboard/auth
      // routes (getAuth()) don't throw at request time; never sent to GitHub here.
      BETTER_AUTH_SECRET: TEST_BETTER_AUTH_SECRET,
      ...TEST_GITHUB_APP_ENV,
    },
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
