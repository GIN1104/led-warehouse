import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";
import { notifyOrderPhaseTelegram } from "@/lib/telegram/notify";

export const ORDER_PHASES = ["planning", "mount", "show", "demount", "done"] as const;
export type OrderPhase = (typeof ORDER_PHASES)[number];

export type OrderPhaseFields = {
  mountDate: string | null;
  showStart: string | null;
  showEnd: string | null;
  demountDate: string | null;
  phase: OrderPhase;
};

function emptyToNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const next = raw.trim();
  return next ? next : null;
}

function assertPhase(phase: string): OrderPhase {
  if (!(ORDER_PHASES as readonly string[]).includes(phase)) {
    throw new DomainError("Неизвестная фаза заказа");
  }
  return phase as OrderPhase;
}

/** Даты фаз должны укладываться в [startDate, endDate] заказа, если заданы. */
export function assertPhaseDates(
  order: { startDate: string; endDate: string },
  fields: Omit<OrderPhaseFields, "phase">,
): void {
  const points = [fields.mountDate, fields.showStart, fields.showEnd, fields.demountDate].filter(Boolean) as string[];
  for (const day of points) {
    if (day < order.startDate || day > order.endDate) {
      throw new DomainError("Даты фаз должны быть внутри периода заказа");
    }
  }
  if (fields.showStart && fields.showEnd && fields.showStart > fields.showEnd) {
    throw new DomainError("Конец шоу раньше начала");
  }
  if (fields.mountDate && fields.showStart && fields.mountDate > fields.showStart) {
    throw new DomainError("Монтаж позже начала шоу");
  }
  if (fields.showEnd && fields.demountDate && fields.showEnd > fields.demountDate) {
    throw new DomainError("Демонтаж раньше конца шоу");
  }
}

export function updateOrderPhases(
  db: Sql,
  orderId: string,
  input: {
    mountDate?: string | null;
    showStart?: string | null;
    showEnd?: string | null;
    demountDate?: string | null;
    phase?: string;
  },
  actor = "system",
): OrderPhaseFields {
  const order = db.get<{ id: string; startDate: string; endDate: string; customerName: string }>(
    `SELECT id, start_date AS startDate, end_date AS endDate, customer_name AS customerName
     FROM rental_orders WHERE id = ?`,
    [orderId],
  );
  if (!order) throw new DomainError("Заказ не найден");

  const current = db.get<{
    mountDate: string | null;
    showStart: string | null;
    showEnd: string | null;
    demountDate: string | null;
    phase: string;
  }>(
    `SELECT mount_date AS mountDate, show_start AS showStart, show_end AS showEnd,
            demount_date AS demountDate, phase AS phase
     FROM rental_orders WHERE id = ?`,
    [orderId],
  );
  if (!current) throw new DomainError("Заказ не найден");

  const next: OrderPhaseFields = {
    mountDate: input.mountDate === undefined ? current.mountDate : emptyToNull(input.mountDate),
    showStart: input.showStart === undefined ? current.showStart : emptyToNull(input.showStart),
    showEnd: input.showEnd === undefined ? current.showEnd : emptyToNull(input.showEnd),
    demountDate: input.demountDate === undefined ? current.demountDate : emptyToNull(input.demountDate),
    phase: input.phase === undefined ? assertPhase(current.phase || "planning") : assertPhase(input.phase),
  };
  assertPhaseDates(order, next);
  db.run(
    `UPDATE rental_orders
     SET mount_date = ?, show_start = ?, show_end = ?, demount_date = ?, phase = ?
     WHERE id = ?`,
    [next.mountDate, next.showStart, next.showEnd, next.demountDate, next.phase, orderId],
  );
  if (current.phase !== next.phase) {
    db.run(
      `INSERT INTO audit_log (id, actor, action, entity, entity_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        actor,
        "order.phase",
        "rental_order",
        orderId,
        JSON.stringify({ from: current.phase, to: next.phase, phase: next.phase }),
        Date.now(),
      ],
    );
    notifyOrderPhaseTelegram(db, {
      orderId,
      customerName: order.customerName,
      fromPhase: current.phase || "planning",
      toPhase: next.phase,
    });
  }
  return next;
}
