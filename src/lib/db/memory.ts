import { openBetterSqlite } from "@/lib/db/better";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";

export function createDb(): Sql {
  const db = openBetterSqlite(":memory:");
  migrate(db);
  return db;
}
