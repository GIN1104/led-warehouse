import type { Sql } from "@/lib/db/sql";

/** Типы строк в объединённой истории операций. */
export const OPERATION_KINDS = [
  "stock",
  "equipment",
  "order",
  "hire",
  "alert",
  "transfer",
  "other",
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];

export type OperationHistoryRow = {
  id: string;
  kind: OperationKind;
  /** Подтип: in/out/adjust/move, статус оборудования, audit action и т.п. */
  subtype: string;
  createdAt: number;
  actor: string;
  summary: string;
  skuCode: string | null;
  skuName: string | null;
  locationName: string | null;
  orderId: string | null;
  qty: number | null;
};

export type OperationHistoryFilter = {
  /** Начало суток (включительно), epoch ms */
  fromMs?: number | null;
  /** Конец суток (включительно), epoch ms */
  toMs?: number | null;
  /** Поиск по SKU code/name или тексту summary */
  query?: string | null;
  kind?: OperationKind | "all" | null;
  limit?: number;
};

function mapAuditKind(action: string): OperationKind {
  if (action.startsWith("order.")) return "order";
  if (action.startsWith("hire.")) return "hire";
  if (action.startsWith("alert.")) return "alert";
  if (action.startsWith("transfer.")) return "transfer";
  if (action.startsWith("stock.")) return "stock";
  return "other";
}

function summarizeAudit(action: string, payloadRaw: string, entityId: string): string {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(payloadRaw) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const bits: string[] = [action];
  if (typeof payload.from === "string" && typeof payload.to === "string") {
    bits.push(`${payload.from} → ${payload.to}`);
  } else if (typeof payload.status === "string") {
    bits.push(String(payload.status));
  } else if (typeof payload.phase === "string") {
    bits.push(`фаза ${payload.phase}`);
  } else if (typeof payload.type === "string" && typeof payload.qty === "number") {
    bits.push(`${payload.type} × ${payload.qty}`);
  } else if (typeof payload.customerName === "string") {
    bits.push(payload.customerName);
  }
  bits.push(`#${entityId.slice(0, 10)}`);
  return bits.join(" · ");
}

/**
 * Хронология изменений: движения склада, статусы оборудования, audit (без дублей stock.move).
 */
export function listOperationsHistory(db: Sql, filter: OperationHistoryFilter = {}): OperationHistoryRow[] {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  const fromMs = filter.fromMs ?? null;
  const toMs = filter.toMs ?? null;
  const query = filter.query?.trim().toLowerCase() ?? "";
  const kindFilter = !filter.kind || filter.kind === "all" ? null : filter.kind;

  const movements = db.all<{
    id: string;
    type: string;
    qty: number;
    reason: string;
    createdAt: number;
    createdBy: string;
    skuCode: string;
    skuName: string;
    locationName: string;
    orderId: string | null;
  }>(
    `SELECT m.id AS id, m.type AS type, m.qty AS qty, m.reason AS reason,
            m.created_at AS createdAt, m.created_by AS createdBy,
            s.code AS skuCode, s.name AS skuName, l.name AS locationName, m.order_id AS orderId
     FROM stock_movements m
     INNER JOIN skus s ON s.id = m.sku_id
     INNER JOIN locations l ON l.id = m.location_id
     ORDER BY m.created_at DESC
     LIMIT 500`,
  );

  const equipment = db.all<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string;
    actor: string;
    createdAt: number;
    skuCode: string;
    skuName: string;
    locationName: string | null;
    orderId: string | null;
    qty: number;
  }>(
    `SELECT h.id AS id, h.from_status AS fromStatus, h.to_status AS toStatus, h.note AS note,
            h.actor AS actor, h.created_at AS createdAt,
            s.code AS skuCode, s.name AS skuName, l.name AS locationName,
            e.order_id AS orderId, e.qty AS qty
     FROM equipment_status_history h
     INNER JOIN equipment_items e ON e.id = h.item_id
     INNER JOIN skus s ON s.id = e.sku_id
     LEFT JOIN locations l ON l.id = e.location_id
     ORDER BY h.created_at DESC
     LIMIT 500`,
  );

  const audits = db.all<{
    id: string;
    actor: string;
    action: string;
    entityId: string;
    payload: string;
    createdAt: number;
  }>(
    `SELECT id, actor, action, entity_id AS entityId, payload, created_at AS createdAt
     FROM audit_log
     WHERE action != 'stock.move'
     ORDER BY created_at DESC
     LIMIT 500`,
  );

  const rows: OperationHistoryRow[] = [];

  for (const m of movements) {
    const reason = m.reason.trim();
    rows.push({
      id: `mv:${m.id}`,
      kind: "stock",
      subtype: m.type,
      createdAt: m.createdAt,
      actor: m.createdBy,
      summary: reason || `${m.type} × ${m.qty}`,
      skuCode: m.skuCode,
      skuName: m.skuName,
      locationName: m.locationName,
      orderId: m.orderId,
      qty: m.qty,
    });
  }

  for (const e of equipment) {
    const transition = e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : e.toStatus;
    const note = e.note.trim();
    rows.push({
      id: `eq:${e.id}`,
      kind: "equipment",
      subtype: e.toStatus,
      createdAt: e.createdAt,
      actor: e.actor,
      summary: note ? `${transition}: ${note}` : transition,
      skuCode: e.skuCode,
      skuName: e.skuName,
      locationName: e.locationName,
      orderId: e.orderId,
      qty: e.qty,
    });
  }

  for (const a of audits) {
    rows.push({
      id: `au:${a.id}`,
      kind: mapAuditKind(a.action),
      subtype: a.action,
      createdAt: a.createdAt,
      actor: a.actor,
      summary: summarizeAudit(a.action, a.payload, a.entityId),
      skuCode: null,
      skuName: null,
      locationName: null,
      orderId: a.action.startsWith("order.") ? a.entityId : null,
      qty: null,
    });
  }

  rows.sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));

  return rows
    .filter((row) => {
      if (kindFilter && row.kind !== kindFilter) return false;
      if (fromMs != null && row.createdAt < fromMs) return false;
      if (toMs != null && row.createdAt > toMs) return false;
      if (!query) return true;
      const hay = [row.summary, row.skuCode, row.skuName, row.locationName, row.subtype, row.actor]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    })
    .slice(0, limit);
}
