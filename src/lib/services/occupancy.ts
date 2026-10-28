import { addDays, eachDate, todayIso } from "@/lib/dates";
import type { Sql } from "@/lib/db/sql";

export type OccupancyDemand = {
  lineId: string;
  orderId: string;
  customerName: string;
  qty: number;
  startDate: string;
  endDate: string;
  createdAt: number;
  qtyShortage: number;
};

export type OccupancyDayCell = {
  date: string;
  reserved: number;
  shortage: number;
  available: number;
  /** Доля занятости 0..1 относительно onHand (для цвета). */
  load: number;
  orders: { orderId: string; customerName: string; qty: number; short: number }[];
};

export type OccupancySkuRow = {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  onHand: number;
  days: OccupancyDayCell[];
  peakReserved: number;
  hasShortage: boolean;
};

export type OccupancyRange = {
  startDate: string;
  endDate: string;
  days: string[];
  rows: OccupancySkuRow[];
};

/** Занятость парка по дням для SKU с пересекающимися confirmed-заказами. */
export function listSkuOccupancy(
  db: Sql,
  opts?: { startDate?: string; endDate?: string; skuId?: string },
): OccupancyRange {
  const startDate = opts?.startDate ?? todayIso();
  const endDate = opts?.endDate ?? addDays(startDate, 13);
  const days = eachDate(startDate, endDate);

  const stock = new Map(
    db
      .all<{ skuId: string; qty: number }>(
        `SELECT sku_id AS skuId, SUM(qty_on_hand) AS qty FROM stock_balances GROUP BY sku_id`,
      )
      .map((row) => [row.skuId, Number(row.qty) || 0]),
  );

  const metaById = new Map(
    db
      .all<{ id: string; code: string; name: string; unit: string }>(`SELECT id, code, name, unit FROM skus`)
      .map((row) => [row.id, row]),
  );

  const bySku = new Map<string, OccupancyDemand[]>();
  for (const row of db.all<{
    lineId: string;
    orderId: string;
    customerName: string;
    skuId: string;
    qty: number;
    startDate: string;
    endDate: string;
    createdAt: number;
    qtyShortage: number;
  }>(
    `SELECT l.id AS lineId, l.order_id AS orderId, o.customer_name AS customerName, l.sku_id AS skuId,
            MAX(0, l.qty_requested - l.qty_issued) AS qty,
            o.start_date AS startDate, o.end_date AS endDate, o.created_at AS createdAt,
            l.qty_shortage AS qtyShortage
     FROM rental_lines l
     INNER JOIN rental_orders o ON o.id = l.order_id
     WHERE o.status = 'confirmed'
       AND o.start_date <= ?
       AND o.end_date >= ?
       AND (l.qty_requested - l.qty_issued) > 0
     ORDER BY o.created_at ASC, l.id ASC`,
    [endDate, startDate],
  )) {
    if (opts?.skuId && row.skuId !== opts.skuId) continue;
    const list = bySku.get(row.skuId) ?? [];
    list.push({
      lineId: row.lineId,
      orderId: row.orderId,
      customerName: row.customerName,
      qty: Number(row.qty) || 0,
      startDate: row.startDate,
      endDate: row.endDate,
      createdAt: Number(row.createdAt) || 0,
      qtyShortage: Number(row.qtyShortage) || 0,
    });
    bySku.set(row.skuId, list);
  }

  const rows: OccupancySkuRow[] = [];
  for (const [skuId, lines] of bySku) {
    const meta = metaById.get(skuId);
    if (!meta) continue;
    const onHand = stock.get(skuId) ?? 0;
    const dayCells: OccupancyDayCell[] = days.map((date) => {
      const covering = lines
        .filter((line) => line.startDate <= date && date <= line.endDate)
        .sort((a, b) => a.createdAt - b.createdAt || a.lineId.localeCompare(b.lineId));
      let remaining = Math.max(0, onHand);
      const orders: OccupancyDayCell["orders"] = [];
      let reserved = 0;
      let shortage = 0;
      for (const line of covering) {
        const covered = Math.min(line.qty, remaining);
        const short = line.qty - covered;
        remaining -= covered;
        reserved += covered;
        shortage += short;
        orders.push({
          orderId: line.orderId,
          customerName: line.customerName,
          qty: line.qty,
          short,
        });
      }
      const load = onHand > 0 ? Math.min(1, (reserved + shortage) / onHand) : shortage > 0 ? 1 : 0;
      return { date, reserved, shortage, available: remaining, load, orders };
    });
    rows.push({
      skuId,
      skuCode: meta.code,
      skuName: meta.name,
      unit: meta.unit,
      onHand,
      days: dayCells,
      peakReserved: Math.max(0, ...dayCells.map((cell) => cell.reserved + cell.shortage)),
      hasShortage: dayCells.some((cell) => cell.shortage > 0) || lines.some((line) => line.qtyShortage > 0),
    });
  }

  rows.sort((a, b) => {
    if (a.hasShortage !== b.hasShortage) return a.hasShortage ? -1 : 1;
    return a.skuCode.localeCompare(b.skuCode, "ru");
  });

  return { startDate, endDate, days, rows };
}
