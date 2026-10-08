import Database from "better-sqlite3";
import type { Sql } from "@/lib/db/sql";

export type SqliteHandle = Sql & {
  close(): void;
  serialize(): Buffer;
};

export function openBetterSqlite(filename = ":memory:"): SqliteHandle {
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  return {
    exec(sql) {
      sqlite.exec(sql);
    },
    get(sql, params = []) {
      return sqlite.prepare(sql).get(...params) as never;
    },
    all(sql, params = []) {
      return sqlite.prepare(sql).all(...params) as never[];
    },
    run(sql, params = []) {
      sqlite.prepare(sql).run(...params);
    },
    transaction(fn) {
      return sqlite.transaction(fn)();
    },
    close() {
      sqlite.close();
    },
    serialize() {
      return sqlite.serialize();
    },
  };
}
