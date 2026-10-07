import type { Database as SqlJsDatabase } from "sql.js";
import type { Sql } from "@/lib/db/sql";

/** Обёртка sql.js под общий синхронный интерфейс склада. */
export function wrapSqlJs(database: SqlJsDatabase): Sql {
  return {
    exec(sql) {
      database.exec(sql);
    },
    get(sql, params = []) {
      const statement = database.prepare(sql);
      statement.bind(params as never[]);
      const row = statement.step() ? (statement.getAsObject() as never) : undefined;
      statement.free();
      return row;
    },
    all(sql, params = []) {
      const statement = database.prepare(sql);
      statement.bind(params as never[]);
      const rows: never[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as never);
      statement.free();
      return rows;
    },
    run(sql, params = []) {
      database.run(sql, params.length > 0 ? (params as never[]) : undefined);
    },
    transaction(fn) {
      database.run("BEGIN");
      try {
        const result = fn();
        database.run("COMMIT");
        return result;
      } catch (error) {
        database.run("ROLLBACK");
        throw error;
      }
    },
  };
}
