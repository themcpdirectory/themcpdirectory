import { dropTestDatabase } from "./test-database";

export default async function globalTeardown(): Promise<void> {
  await dropTestDatabase();
}
