import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { openBetterSqlite } from "@/lib/db/better";
import { migrate } from "@/lib/db/migrate";
import { migrateRemote, pullSnapshot, pushSnapshot, replayStatements } from "@/lib/db/turso";

describe("копия склада в Turso", () => {
  it("переносит строки в файл libsql и читает их обратно", async () => {
    const dir = mkdtempSync(join(tmpdir(), "led-turso-"));
    const remote = createClient({ url: `file:${join(dir, "remote.db")}` });
    const source = openBetterSqlite(join(dir, "local.sqlite"));
    migrate(source);
    source.run(`INSERT INTO users (id, name, role) VALUES ('user_warehouse', 'Алексей', 'warehouse')`);
    source.run(`UPDATE ledger_meta SET value = '3' WHERE key = 'revision'`);

    await migrateRemote(remote);
    await pushSnapshot(source, remote);

    const copy = openBetterSqlite(":memory:");
    migrate(copy);
    await pullSnapshot(copy, remote);
    const user = copy.get<{ name: string }>(`SELECT name FROM users WHERE id = 'user_warehouse'`);
    const revision = copy.get<{ value: string }>(`SELECT value FROM ledger_meta WHERE key = 'revision'`);
    expect(user?.name).toBe("Алексей");
    expect(revision?.value).toBe("3");
    source.close();
    copy.close();
    remote.close();
  });

  it("повторяет пачку записей", async () => {
    const dir = mkdtempSync(join(tmpdir(), "led-turso-replay-"));
    const remote = createClient({ url: `file:${join(dir, "remote.db")}` });
    await migrateRemote(remote);
    await replayStatements(
      [{ sql: `INSERT INTO users (id, name, role) VALUES (?, ?, ?)`, args: ["user_manager", "Дмитрий", "manager"] }],
      remote,
    );
    const found = await remote.execute(`SELECT name FROM users WHERE id = ?`, ["user_manager"]);
    expect(found.rows[0]?.name).toBe("Дмитрий");
    remote.close();
  });
});
