import { createDatabase, type Database } from "@themcpdirectory/db";

declare global {
  var __db: Database | undefined;
}

function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!global.__db) {
    global.__db = createDatabase(url);
  }
  return global.__db;
}

export { getDb };
