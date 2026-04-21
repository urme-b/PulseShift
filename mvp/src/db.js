import path from "node:path";

import { createPostgresStorage } from "./postgresStorage.js";
import { createSqliteStorage } from "./sqliteStorage.js";

export async function createStorage({
  driver = process.env.PULSESHIFT_DB_DRIVER || "sqlite",
  dbPath = path.join(process.cwd(), "data", "pulseshift.sqlite"),
  postgresUrl = process.env.PULSESHIFT_POSTGRES_URL,
  client = null
} = {}) {
  if (driver === "postgres" || driver === "postgresql") {
    return createPostgresStorage({
      postgresUrl,
      client
    });
  }

  return createSqliteStorage(dbPath);
}
