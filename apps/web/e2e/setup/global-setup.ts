import postgres from "postgres";
import { TEST_DATABASE_URL } from "./test-database";

async function globalSetup(): Promise<void> {
  const client = postgres(TEST_DATABASE_URL, { max: 1 });
  try {
    const [result] = await client<{ serverCount: number }[]>`
      select count(*)::integer as "serverCount" from servers
    `;
    if (!result || result.serverCount === 0) {
      throw new Error("The Playwright database was not seeded.");
    }
    console.log(`[global-setup] Test DB ready with ${result.serverCount} servers.`);
  } catch (err) {
    throw new Error(`Test database is not reachable: ${String(err)}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

export default globalSetup;
