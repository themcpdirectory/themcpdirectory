import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP address for the API test server.");
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForResponse(child: ChildProcess, url: string): Promise<Response> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `API process exited before listening (code ${child.exitCode}, signal ${child.signalCode}).`,
      );
    }

    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error(`API did not listen at ${url}.`);
}

describe("API process", () => {
  let child: ChildProcess | undefined;

  afterEach(async () => {
    if (child?.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    child = undefined;
  });

  it("listens on API_PORT and serves the health response", async () => {
    const port = await reservePort();
    child = spawn("pnpm", ["start"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: {
        ...process.env,
        API_PORT: String(port),
        DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
        MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
      },
      stdio: "pipe",
    });

    const response = await waitForResponse(child, `http://127.0.0.1:${port}/`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
