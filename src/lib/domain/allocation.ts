import { eachDate } from "@/lib/dates";

export type DemandLine = {
  id: string;
  qtyRequested: number;
  startDate: string;
  endDate: string;
  createdAt: number;
};

export type Allocation = {
  id: string;
  qtySoftReserved: number;
  qtyShortage: number;
};

/**
 * Мягкий резерв одного SKU на интервале дат.
 * На каждый день остаток получают более ранние заказы.
 * Нехватка строки — худший день её интервала. Заказ из-за нехватки не отклоняется.
 * Все строки должны относиться к одному SKU и одному пулу остатка.
 */
export function allocateForSku(onHand: number, lines: DemandLine[]): Allocation[] {
  const state = new Map<string, { reserved: number; shortage: number }>();
  for (const line of lines) {
    state.set(line.id, { reserved: line.qtyRequested, shortage: 0 });
  }

  const days = new Set<string>();
  for (const line of lines) {
    for (const day of eachDate(line.startDate, line.endDate)) {
      days.add(day);
    }
  }

  for (const day of days) {
    const covering = lines
      .filter((line) => line.startDate <= day && day <= line.endDate)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

    let remaining = Math.max(0, onHand);
    for (const line of covering) {
      const covered = Math.min(line.qtyRequested, remaining);
      remaining -= covered;
      const current = state.get(line.id);
      if (!current) continue;
      current.shortage = Math.max(current.shortage, line.qtyRequested - covered);
      current.reserved = Math.min(current.reserved, covered);
    }
  }

  return lines.map((line) => {
    const current = state.get(line.id) ?? { reserved: 0, shortage: line.qtyRequested };
    return {
      id: line.id,
      qtySoftReserved: current.reserved,
      qtyShortage: current.shortage,
    };
  });
}
