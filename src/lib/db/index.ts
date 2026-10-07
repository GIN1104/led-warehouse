import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "@/lib/db/migrate";
import * as schema from "@/lib/db/schema";
import { seedIfEmpty } from "@/lib/db/seed";
import type { AppDb } from "@/lib/db/types";

export type { AppDb };

const globalForDb = globalThis as unknown as { __ledDb?: AppDb };

export function createDb(filename = ":memory:"): AppDb {
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  if (filename !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "warehouse.sqlite");
}

export function getDb(): AppDb {
  if (!globalForDb.__ledDb) {
    const filename = databasePath();
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(filename), { recursive: true });
    }
    globalForDb.__ledDb = createDb(filename);
    seedIfEmpty(globalForDb.__ledDb);
  }
  return globalForDb.__ledDb;
}
