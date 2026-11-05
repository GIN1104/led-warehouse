import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openBetterSqlite } from "@/lib/db/better";
import { migrate } from "@/lib/db/migrate";
import {
  migrateRemote,
  pullSnapshot,
  pushSnapshot,
  replayStatements,
  tursoConfig,
  tursoEnabled,
} from "@/lib/db/turso";

describe("tursoConfig", () => {
  const prevUrl = process.env.TURSO_DATABASE_URL;
  const prevToken = process.env.TURSO_AUTH_TOKEN;

  beforeEach(() => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
  });

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = prevToken;
  });

  it("выключен без URL", () => {
    expect(tursoConfig()).toBeNull();
    expect(tursoEnabled()).toBe(false);
  });

  it("облако требует token", () => {
    process.env.TURSO_DATABASE_URL = "libsql://led-warehouse-org.turso.io";
    expect(tursoConfig()).toBeNull();
    process.env.TURSO_AUTH_TOKEN = "tok_test";
    expect(tursoConfig()).toEqual({
      url: "libsql://led-warehouse-org.turso.io",
      authToken: "tok_test",
    });
  });

  it("file: mock работает без token (локальный libsql)", () => {
    process.env.TURSO_DATABASE_URL = "file:/tmp/led-mock.db";
    expect(tursoEnabled()).toBe(true);
    expect(tursoConfig()).toEqual({ url: "file:/tmp/led-mock.db" });
  });
});

describe("копия склада в Turso", () => {
  it("переносит строки в файл libsql и читает их обратно", async () => {
    const dir = mkdtempSync(join(tmpdir(), "led-turso-"));
    const remote = createClient({ url: `file:${join(dir, "remote.db")}` });
    const source = openBetterSqlite(join(dir, "local.sqlite"));
    migrate(source);
    source.run(`INSERT INTO users (id, name, role) VALUES ('user_warehouse', 'Алексей', 'warehouse')`);
    source.run(`INSERT INTO workers (id, name, color, active, created_at) VALUES ('w1', 'Илья', '#1d4e89', 1, 1)`);
    source.run(
      `INSERT INTO work_tasks (id, title, notes, worker_id, work_date, progress, status, created_at, created_by) VALUES ('t1', 'Собрать кейс', '', 'w1', '2026-10-12', 25, 'doing', 1, 'user_warehouse')`,
    );
    source.run(
      `INSERT INTO skus (id, code, name, category, unit, track_mode, description)
       VALUES ('sku_turso', 'TURSO-1', 'LED panel', 'light', 'шт', 'quantity', '')`,
    );
    source.run(
      `INSERT INTO equipment_items (id, sku_id, qty, status, note, source, created_at, updated_at, created_by)
       VALUES ('eq1', 'sku_turso', 1, 'available', '', 'manual', 1, 1, 'user_warehouse')`,
    );
    source.run(
      `INSERT INTO equipment_status_history (id, item_id, from_status, to_status, note, actor, created_at)
       VALUES ('eh1', 'eq1', NULL, 'available', '', 'user_warehouse', 1)`,
    );
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
    const task = copy.get<{ title: string; progress: number }>(`SELECT title, progress FROM work_tasks WHERE id = 't1'`);
    expect(task).toMatchObject({ title: "Собрать кейс", progress: 25 });
    const item = copy.get<{ id: string }>(`SELECT id FROM equipment_items WHERE id = 'eq1'`);
    expect(item?.id).toBe("eq1");
    const hist = copy.get<{ item_id: string }>(`SELECT item_id FROM equipment_status_history WHERE id = 'eh1'`);
    expect(hist?.item_id).toBe("eq1");
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

