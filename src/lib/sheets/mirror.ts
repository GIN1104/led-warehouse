import type { Sql } from "@/lib/db/sql";

/** Снимок ключевых таблиц для optional Sheets mirror (не source of truth). */
export type SheetsMirrorSnapshot = {
  generatedAt: number;
  source: "led-warehouse-sqlite";
  tables: Record<string, Record<string, unknown>[]>;
};

export function buildSheetsMirrorSnapshot(db: Sql): SheetsMirrorSnapshot {
  const tables: Record<string, Record<string, unknown>[]> = {
    users: db.all(`SELECT id, name, role, email, phone, telegram_username, telegram_chat_id FROM users`),
    locations: db.all(`SELECT id, name, kind, parent_id FROM locations`),
    skus: db.all(`SELECT id, code, name, category, unit FROM skus`),
    stock_balances: db.all(`SELECT sku_id, location_id, qty_on_hand, qty_reserved FROM stock_balances`),
    rental_orders: db.all(
      `SELECT id, customer_name, start_date, end_date, status, phase, mount_date, show_start, show_end, demount_date FROM rental_orders`,
    ),
    stock_transfers: db.all(
      `SELECT id, sku_id, qty, from_location_id, to_location_id, status, driver_user_id, order_id FROM stock_transfers`,
    ),
  };
  return { generatedAt: Date.now(), source: "led-warehouse-sqlite", tables };
}

export function getSheetsMirrorWebhook(env: Record<string, string | undefined> = process.env): string {
  return (env.SHEETS_MIRROR_WEBHOOK_URL ?? "").trim();
}

/** POST JSON-снимка в Apps Script / webhook. Без URL — mock. */
export async function pushSheetsMirror(
  snapshot: SheetsMirrorSnapshot,
  opts?: { webhookUrl?: string; fetchImpl?: typeof fetch },
): Promise<{ mode: "sent" | "mock"; status?: number }> {
  const url = (opts?.webhookUrl ?? getSheetsMirrorWebhook()).trim();
  if (!url) return { mode: "mock" };
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) {
    throw new Error(`Sheets mirror HTTP ${response.status}`);
  }
  return { mode: "sent", status: response.status };
}
