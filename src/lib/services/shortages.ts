import { todayIso } from "@/lib/dates";
import type { Sql } from "@/lib/db/sql";
import { listSkuSummaries } from "@/lib/services/queries";

export type ShortageAltSku = {
  skuId: string;
  skuCode: string;
  skuName: string;
  availableToday: number;
  unit: string;
};

export type ShortageRow = {
  lineId: string;
  orderId: string;
  customerName: string;
  startDate: string;
  endDate: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  familyId: string | null;
  qtyRequested: number;
  qtySoftReserved: number;
  qtyShortage: number;
  qtyIssued: number;
  hireId: string | null;
  hireStatus: "needed" | "ordered" | "received" | "closed" | null;
  hireQty: number | null;
  supplierNote: string;
  alternatives: ShortageAltSku[];
};

/** Открытые нехватки по confirmed-заказам + статус ExternalHire + альтернативы из той же группы. */
export function listOpenShortages(db: Sql): ShortageRow[] {
  const today = todayIso();
  const summaries = listSkuSummaries(db);
  const availById = new Map(summaries.map((row) => [row.id, row]));

  const rows = db.all<{
    lineId: string;
    orderId: string;
    customerName: string;
    startDate: string;
    endDate: string;
    skuId: string;
    skuCode: string;
    skuName: string;
    unit: string;
    familyId: string | null;
    qtyRequested: number;
    qtySoftReserved: number;
    qtyShortage: number;
    qtyIssued: number;
    hireId: string | null;
    hireStatus: "needed" | "ordered" | "received" | "closed" | null;
    hireQty: number | null;
    supplierNote: string | null;
  }>(
    `SELECT l.id AS lineId, l.order_id AS orderId, o.customer_name AS customerName,
            o.start_date AS startDate, o.end_date AS endDate,
            s.id AS skuId, s.code AS skuCode, s.name AS skuName, s.unit AS unit, s.family_id AS familyId,
            l.qty_requested AS qtyRequested, l.qty_soft_reserved AS qtySoftReserved,
            l.qty_shortage AS qtyShortage, l.qty_issued AS qtyIssued,
            h.id AS hireId, h.status AS hireStatus, h.qty AS hireQty, h.supplier_note AS supplierNote
     FROM rental_lines l
     INNER JOIN rental_orders o ON o.id = l.order_id
     INNER JOIN skus s ON s.id = l.sku_id
     LEFT JOIN external_hires h ON h.order_id = l.order_id AND h.sku_id = l.sku_id
     WHERE o.status = 'confirmed' AND l.qty_shortage > 0
     ORDER BY o.start_date ASC, s.code ASC`,
  );

  const familyMembers = db.all<{ id: string; familyId: string | null }>(
    `SELECT id, family_id AS familyId FROM skus WHERE family_id IS NOT NULL`,
  );
  const byFamily = new Map<string, string[]>();
  for (const row of familyMembers) {
    if (!row.familyId) continue;
    const list = byFamily.get(row.familyId) ?? [];
    list.push(row.id);
    byFamily.set(row.familyId, list);
  }

  return rows.map((row) => {
    const alternatives: ShortageAltSku[] = [];
    if (row.familyId) {
      for (const siblingId of byFamily.get(row.familyId) ?? []) {
        if (siblingId === row.skuId) continue;
        const summary = availById.get(siblingId);
        if (!summary || summary.availableToday <= 0) continue;
        alternatives.push({
          skuId: summary.id,
          skuCode: summary.code,
          skuName: summary.name,
          availableToday: summary.availableToday,
          unit: summary.unit,
        });
      }
    }
    alternatives.sort((a, b) => b.availableToday - a.availableToday || a.skuCode.localeCompare(b.skuCode, "ru"));
    return {
      lineId: row.lineId,
      orderId: row.orderId,
      customerName: row.customerName,
      startDate: row.startDate,
      endDate: row.endDate,
      skuId: row.skuId,
      skuCode: row.skuCode,
      skuName: row.skuName,
      unit: row.unit,
      familyId: row.familyId,
      qtyRequested: Number(row.qtyRequested) || 0,
      qtySoftReserved: Number(row.qtySoftReserved) || 0,
      qtyShortage: Number(row.qtyShortage) || 0,
      qtyIssued: Number(row.qtyIssued) || 0,
      hireId: row.hireId,
      hireStatus: row.hireStatus,
      hireQty: row.hireQty == null ? null : Number(row.hireQty) || 0,
      supplierNote: row.supplierNote ?? "",
      alternatives: alternatives.slice(0, 4),
    };
  }).filter((row) => {
    // Prefer shortages that still overlap today or future; keep past open ones too for visibility.
    void today;
    return row.qtyShortage > 0;
  });
}

export function shortageLifecycleCounts(db: Sql): {
  openShortages: number;
  needed: number;
  ordered: number;
  received: number;
  shortageUnits: number;
} {
  const shortages = listOpenShortages(db);
  const hires = db.all<{ status: string; qty: number }>(
    `SELECT status, qty FROM external_hires WHERE status IN ('needed', 'ordered', 'received')`,
  );
  return {
    openShortages: shortages.length,
    needed: hires.filter((row) => row.status === "needed").length,
    ordered: hires.filter((row) => row.status === "ordered").length,
    received: hires.filter((row) => row.status === "received").length,
    shortageUnits: shortages.reduce((sum, row) => sum + row.qtyShortage, 0),
  };
}
