import { DomainError } from "@/lib/domain/errors";
import type { Sql } from "@/lib/db/sql";
import { createOrder } from "@/lib/services/ledger";
import type { MapperOrderDraft } from "@/lib/services/mapper-sheet";
import { getOrderDetail } from "@/lib/services/queries";

export type MapperImportResult = {
  orderId: string;
  idempotent: boolean;
  shortages: { skuId: string; qty: number }[];
  reserved: { code: string; qty: number }[];
};

function fingerprint(draft: MapperOrderDraft): string {
  const lines = [...draft.lines]
    .map((line) => `${line.code}:${line.qty}`)
    .sort()
    .join(",");
  return `mapper:${draft.customerName.trim()}|${draft.startDate}|${draft.endDate}|${lines}`;
}

/** Заказ из mapper: строки Excel становятся бронью. Повтор того же external_id заказ не удваивает. */
export function importMapperOrder(db: Sql, draft: MapperOrderDraft, actor = "mapper"): MapperImportResult {
  const customerName = draft.customerName.trim();
  if (customerName.length < 2) throw new DomainError("Укажите заказчика");
  if (draft.lines.length === 0) throw new DomainError("Добавьте хотя бы одну строку");

  const externalId = (draft.externalId?.trim() || fingerprint(draft)).slice(0, 200);
  const existing = db.get<{ id: string }>(`SELECT id FROM rental_orders WHERE external_id = ?`, [externalId]);
  if (existing) {
    const detail = getOrderDetail(db, existing.id);
    return {
      orderId: existing.id,
      idempotent: true,
      shortages: (detail?.lines ?? [])
        .filter((line) => line.qtyShortage > 0)
        .map((line) => ({ skuId: line.skuId, qty: line.qtyShortage })),
      reserved: (detail?.lines ?? []).map((line) => ({ code: line.code, qty: line.qtySoftReserved })),
    };
  }

  const unknown: string[] = [];
  const lines: { skuId: string; qty: number }[] = [];
  for (const line of draft.lines) {
    const code = line.code.trim().toUpperCase();
    const sku = db.get<{ id: string }>(`SELECT id FROM skus WHERE upper(code) = ? OR upper(id) = ?`, [code, code]);
    if (!sku) {
      unknown.push(code);
      continue;
    }
    if (!Number.isInteger(line.qty) || line.qty <= 0) throw new DomainError("Количество в строке должно быть целым и больше нуля");
    lines.push({ skuId: sku.id, qty: line.qty });
  }
  if (unknown.length > 0) throw new DomainError(`Неизвестная номенклатура: ${unknown.join(", ")}`);

  const created = createOrder(
    db,
    {
      customerName,
      startDate: draft.startDate,
      endDate: draft.endDate,
      notes: draft.notes?.trim() || "Заказ из mapper",
      lines,
      source: "mapper",
      externalId,
    },
    actor,
  );
  const detail = getOrderDetail(db, created.orderId);
  return {
    orderId: created.orderId,
    idempotent: false,
    shortages: created.shortages,
    reserved: (detail?.lines ?? []).map((line) => ({ code: line.code, qty: line.qtySoftReserved })),
  };
}
