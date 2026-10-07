/** Синхронный SQLite, общий для тестов (better-sqlite3) и браузера (sql.js). */
export type Sql = {
  exec(sql: string): void;
  get<T>(sql: string, params?: unknown[]): T | undefined;
  all<T>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): void;
  transaction<T>(fn: () => T): T;
};

export function newId(): string {
  return globalThis.crypto.randomUUID();
}
